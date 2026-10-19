import crypto from 'node:crypto';
import { response, parseBody, cleanString, normaliseEmail, isEmail } from './_shared/http.js';
import { getFirebase } from './_shared/firebase.js';
import { DEFAULT_SETTINGS, validWholeQuantity } from './_shared/store.js';
import { paystackRequest } from './_shared/payments.js';
import { consumeRateLimit } from './_shared/rate-limit.js';

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  try {
    if (!(await consumeRateLimit(event, 'checkout', 8, 60))) return response(429, { error: 'Too many checkout attempts. Please try again later.' });
    const origin = String(process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');
    if (!origin || !/^https:\/\//i.test(origin)) return response(503, { error: 'SITE_URL must be set to your deployed HTTPS domain in Netlify.' });
    const body = parseBody(event);
    if (cleanString(body.company_site, 200)) return response(400, { error: 'Unable to submit this order.' });
    const name = cleanString(body.name, 90);
    const email = normaliseEmail(body.email);
    const phone = cleanString(body.phone, 25);
    const address = cleanString(body.address, 500);
    const city = cleanString(body.city, 100);
    const country = cleanString(body.country, 100);
    const countryCode = cleanString(body.countryCode, 2).toUpperCase();
    const region = cleanString(body.region, 100);
    const postalCode = cleanString(body.postalCode, 30);
    const note = cleanString(body.note, 500);
    const mode = body.mode === 'wholesale' ? 'wholesale' : body.mode === 'retail' ? 'retail' : '';
    if (!name || name.length < 2 || !isEmail(email) || phone.length < 7 || address.length < 5 || !city || !country || !/^[A-Z]{2}$/.test(countryCode) || !region || (countryCode !== 'GH' && !postalCode) || !mode) {
      return response(400, { error: 'Please check your contact and delivery details. International orders require a postal code.' });
    }
    const { db, FieldValue } = getFirebase();
    const counterRef = db.collection('counters').doc('orders');
    const settingsRef = db.collection('settings').doc('store');
    const reference = `HC${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const quantityRequested = Number(body.quantity);
    const prepared = await db.runTransaction(async tx => {
      const [counterSnap, settingsSnap] = await Promise.all([tx.get(counterRef), tx.get(settingsRef)]);
      const settings = { ...DEFAULT_SETTINGS, ...(settingsSnap.exists ? settingsSnap.data() : {}) };
      const min = mode === 'wholesale' ? Math.max(1, Math.floor(Number(settings.wholesaleMinQty) || 10)) : 1;
      const quantity = validWholeQuantity(quantityRequested, min, 1000);
      if (!quantity) throw new Error(mode === 'wholesale' ? `Wholesale orders must be whole numbers of ${min} bottles or more.` : 'Please choose a whole-number quantity from 1 to 1000.');
      const price = Number(mode === 'wholesale' ? settings.wholesalePrice : settings.retailPrice);
      if (!Number.isFinite(price) || price <= 0) throw new Error('The product price is not configured correctly. Please contact the store.');
      const tracksInventory = settings.inventory !== null && settings.inventory !== undefined && Number.isFinite(Number(settings.inventory));
      const stockBefore = tracksInventory ? Number(settings.inventory) : null;
      if (tracksInventory && stockBefore < quantity) throw new Error('There is not enough stock available for this quantity. Please reduce the quantity or contact the store.');
      const total = Math.round(price * quantity * 100) / 100;
      const processingFee = Math.round(total * 0.0295 * 100) / 100;
      const amountDue = Math.round((total + processingFee) * 100) / 100;
      const amountSubunits = Math.round(amountDue * 100);
      const orderSeq = Number(counterSnap.exists ? counterSnap.data().lastNumber || 0 : 0) + 1;
      const orderNumber = `HC-${String(orderSeq).padStart(5, '0')}`;
      const orderRef = db.collection('orders').doc(orderNumber);
      const order = {
        orderNumber, orderSeq, name, email, phone, address, city, country, countryCode, region, postalCode, note,
        mode, productName: settings.productName || 'Hair Confidante Hair Oil',
        quantity, unitPrice: price, total, processingFee, amountDue, amountSubunits, currency: 'GHS',
        status: 'awaiting_payment', paymentStatus: 'pending', paymentReference: reference,
        inventoryReserved: tracksInventory, inventoryReservationReleased: false,
        inventoryReservationExpiresAt: tracksInventory ? new Date(Date.now() + 45 * 60 * 1000).toISOString() : null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        history: [{ status: 'awaiting_payment', at: new Date().toISOString() }]
      };
      tx.set(counterRef, { lastNumber: orderSeq, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (tracksInventory) tx.set(settingsRef, { inventory: stockBefore - quantity, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(orderRef, order);
      return { orderNumber, order, orderRefId: orderRef.id, amountSubunits, quantity, price, total, processingFee, amountDue };
    });
    const callbackUrl = `${origin}/confirmation.html?reference=${encodeURIComponent(reference)}`;
    let paystack;
    try {
      paystack = await paystackRequest('/transaction/initialize', {
        email, amount: prepared.amountSubunits, currency: 'GHS', reference,
        callback_url: callbackUrl,
        metadata: { order_number: prepared.orderNumber, order_mode: mode, quantity: prepared.quantity, custom_fields: [{ display_name: 'Order Number', variable_name: 'order_number', value: prepared.orderNumber }] }
      });
    } catch (error) {
      const orderRef = db.collection('orders').doc(prepared.orderNumber);
      await db.runTransaction(async tx => {
        const [orderSnap, currentSettingsSnap] = await Promise.all([tx.get(orderRef), tx.get(settingsRef)]);
        if (!orderSnap.exists) return;
        const current = orderSnap.data();
        if (current.inventoryReserved && currentSettingsSnap.exists && currentSettingsSnap.data().inventory !== null && currentSettingsSnap.data().inventory !== undefined && Number.isFinite(Number(currentSettingsSnap.data().inventory))) {
          tx.set(settingsRef, { inventory: Number(currentSettingsSnap.data().inventory) + Number(current.quantity || 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        tx.update(orderRef, { paymentStatus: 'initialization_failed', status: 'awaiting_payment', inventoryReserved: false, inventoryReservationReleased: Boolean(current.inventoryReserved), updatedAt: FieldValue.serverTimestamp(), paymentError: cleanString(error.message, 200) });
      });
      throw error;
    }
    await db.collection('orders').doc(prepared.orderNumber).update({ paystackAccessCode: paystack.data?.access_code || null, updatedAt: FieldValue.serverTimestamp() });
    return response(200, { authorizationUrl: paystack.data?.authorization_url, reference, orderNumber: prepared.orderNumber });
  } catch (error) {
    const statusCode = /not configured|SITE_URL/.test(error.message) ? 503 : 400;
    return response(statusCode, { error: error.message || 'We could not start checkout. Please try again.' });
  }
};
