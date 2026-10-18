import { response, parseBody, cleanString, normaliseEmail, isEmail, toISO } from './_shared/http.js';
import { getFirebase, requireAdmin } from './_shared/firebase.js';
import { getSettings, DEFAULT_SETTINGS, validPrice, validWholeQuantity, normaliseUrl } from './_shared/store.js';
import { sendBrandedEmail } from './_shared/email.js';

const VALID_STATUSES = new Set(['preparing', 'ready', 'dispatched', 'delivered', 'cancelled']);

function serialise(value) {
  if (value == null) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serialise(child)]));
  return value;
}

async function docs(collection, limit = 150) {
  const { db } = getFirebase();
  const snap = await db.collection(collection).limit(limit).get();
  return snap.docs.map(doc => ({ id: doc.id, ...serialise(doc.data()) })).sort((a, b) => String(b.createdAt || b.updatedAt || b.subscribedAt || '').localeCompare(String(a.createdAt || a.updatedAt || a.subscribedAt || '')));
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  try {
    const adminUser = await requireAdmin(event);
    const body = parseBody(event);
    const action = cleanString(body.action, 60);
    const { db, FieldValue } = getFirebase();

    if (action === 'dashboard') {
      const [orders, reviews, messages, subscribers, emailCampaigns] = await Promise.all([docs('orders', 200), docs('reviews', 200), docs('messages', 200), docs('subscribers', 500), docs('emailCampaigns', 100)]);
      const settings = await getSettings(db);
      const paidOrders = orders.filter(order => order.paymentStatus === 'success');
      const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      return response(200, {
        ok: true,
        admin: { email: adminUser.email },
        settings: { ...DEFAULT_SETTINGS, ...serialise(settings) },
        metrics: {
          orders: orders.length,
          paidOrders: paidOrders.length,
          revenue,
          pendingReviews: reviews.filter(review => review.published !== true).length,
          unreadMessages: messages.filter(message => !['read', 'archived'].includes(message.status)).length,
          subscribers: subscribers.filter(subscriber => subscriber.status === 'subscribed').length
        },
        orders,
        purchases: paidOrders,
        reviews,
        messages,
        subscribers,
        emailCampaigns
      });
    }

    if (action === 'update-settings') {
      const productName = cleanString(body.productName, 100);
      const productDescription = cleanString(body.productDescription, 500);
      const retailPrice = validPrice(body.retailPrice);
      const wholesalePrice = validPrice(body.wholesalePrice);
      const wholesaleMinQty = validWholeQuantity(body.wholesaleMinQty, 1, 1000);
      const inventory = body.inventory === '' || body.inventory === null || body.inventory === undefined ? null : validWholeQuantity(body.inventory, 0, 1000000);
      const productImageUrl = normaliseUrl(body.productImageUrl);
      if (!productName || productName.length < 3 || !productDescription || !retailPrice || !wholesalePrice || !wholesaleMinQty || (body.inventory !== '' && body.inventory !== null && body.inventory !== undefined && inventory === null) || (body.productImageUrl && !productImageUrl)) {
        return response(400, { error: 'Please check the product name, description, prices, minimum quantity, stock and image URL.' });
      }
      const settings = { productName, productDescription, retailPrice, wholesalePrice, wholesaleMinQty, inventory, productImageUrl, bottleSize: '100 mL', updatedAt: FieldValue.serverTimestamp(), updatedBy: adminUser.email };
      await db.collection('settings').doc('store').set(settings, { merge: true });
      return response(200, { ok: true, message: 'Product settings saved.' });
    }

    if (action === 'update-delivery-settings') {
      const daysRaw = Array.isArray(body.dispatchDays) ? body.dispatchDays : [];
      const dispatchDays = [...new Set(daysRaw.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
      const estimatedDeliveryDays = validWholeQuantity(body.estimatedDeliveryDays, 1, 21);
      if (!dispatchDays.length || !estimatedDeliveryDays) return response(400, { error: 'Select at least one delivery day and an estimate from 1 to 21 days.' });
      await db.collection('settings').doc('store').set({ dispatchDays, estimatedDeliveryDays, updatedAt: FieldValue.serverTimestamp(), updatedBy: adminUser.email }, { merge: true });
      return response(200, { ok: true, message: 'Delivery settings saved.' });
    }

    if (action === 'update-order-status') {
      const orderNumber = cleanString(body.orderNumber, 30).toUpperCase();
      const status = cleanString(body.status, 30).toLowerCase();
      if (!/^HC-\d{5,8}$/.test(orderNumber) || !VALID_STATUSES.has(status)) return response(400, { error: 'Choose a valid order and status.' });
      const orderRef = db.collection('orders').doc(orderNumber);
      let resultOrder;
      let changed = false;
      await db.runTransaction(async tx => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
        const current = snap.data();
        if (current.paymentStatus !== 'success') throw Object.assign(new Error('Only paid orders can be moved through fulfilment statuses.'), { statusCode: 400 });
        if (current.status === status) { resultOrder = current; return; }
        const now = new Date().toISOString();
        const history = [...(Array.isArray(current.history) ? current.history : []), { status, at: now, by: adminUser.email }];
        tx.update(orderRef, { status, updatedAt: FieldValue.serverTimestamp(), history, statusUpdatedBy: adminUser.email });
        resultOrder = { ...current, status, history, orderNumber };
        changed = true;
      });
      if (changed) {
        const order = { ...resultOrder, orderNumber };
        await sendBrandedEmail({ to: order.email, type: `order_${status}`, data: { name: order.name, order } });
      }
      return response(200, { ok: true, message: changed ? `Order marked ${status}. A customer update email was queued.` : 'This order already has that status.', order: serialise(resultOrder) });
    }

    if (action === 'review-status') {
      const id = cleanString(body.id, 120);
      const published = body.published === true;
      if (!id) return response(400, { error: 'Review id is required.' });
      const ref = db.collection('reviews').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return response(404, { error: 'Review not found.' });
      const review = snap.data();
      await ref.update({ published, moderationStatus: published ? 'approved' : 'hidden', reviewedAt: FieldValue.serverTimestamp(), reviewedBy: adminUser.email });
      if (published && review.published !== true && review.email) {
        await sendBrandedEmail({ to: review.email, type: 'review_approved', data: { name: review.name, review: review.review, rating: review.rating } });
      }
      return response(200, { ok: true, message: published ? 'Review published.' : 'Review hidden.' });
    }

    if (action === 'delete-review') {
      const id = cleanString(body.id, 120);
      if (!id) return response(400, { error: 'Review id is required.' });
      await db.collection('reviews').doc(id).delete();
      return response(200, { ok: true, message: 'Review deleted.' });
    }

    if (action === 'message-status') {
      const id = cleanString(body.id, 120);
      const status = ['unread', 'read', 'archived'].includes(body.status) ? body.status : '';
      if (!id || !status) return response(400, { error: 'Choose a message and status.' });
      await db.collection('messages').doc(id).update({ status, updatedAt: FieldValue.serverTimestamp(), updatedBy: adminUser.email });
      return response(200, { ok: true, message: 'Message updated.' });
    }

    if (action === 'delete-message') {
      const id = cleanString(body.id, 120);
      if (!id) return response(400, { error: 'Message id is required.' });
      await db.collection('messages').doc(id).delete();
      return response(200, { ok: true, message: 'Message deleted.' });
    }

    if (action === 'subscriber-status') {
      const id = cleanString(body.id, 180);
      const status = body.status === 'unsubscribed' ? 'unsubscribed' : body.status === 'subscribed' ? 'subscribed' : '';
      if (!id || !status) return response(400, { error: 'Choose a subscriber and status.' });
      await db.collection('subscribers').doc(id).update({ status, updatedAt: FieldValue.serverTimestamp(), updatedBy: adminUser.email });
      return response(200, { ok: true, message: `Subscriber marked ${status}.` });
    }

    if (action === 'send-email') {
      const subject = cleanString(body.subject, 150);
      const message = cleanString(body.message, 8000);
      const intro = cleanString(body.intro, 400);
      const to = normaliseEmail(body.to);
      const toSubscribers = body.toSubscribers === true;
      if (!subject || message.length < 2 || (!toSubscribers && !isEmail(to))) return response(400, { error: 'Add a subject, message and a valid recipient or choose all active subscribers.' });
      let recipients = [to];
      if (toSubscribers) {
        const list = await db.collection('subscribers').where('status', '==', 'subscribed').limit(250).get();
        recipients = list.docs.map(doc => doc.data().email).filter(isEmail);
        if (!recipients.length) return response(400, { error: 'There are no active subscribers to email.' });
      }
      let sent = 0;
      let failed = 0;
      for (let i = 0; i < recipients.length; i += 5) {
        const batch = recipients.slice(i, i + 5);
        const outcomes = await Promise.allSettled(batch.map(recipient => sendBrandedEmail({ to: recipient, type: 'custom', data: { subject, title: subject, intro, message }, unsubscribeEmail: toSubscribers ? recipient : undefined })));
        outcomes.forEach(outcome => outcome.status === 'fulfilled' ? sent++ : failed++);
      }
      await db.collection('emailCampaigns').add({ subject, intro, message, toSubscribers, recipientCount: recipients.length, sent, failed, createdAt: FieldValue.serverTimestamp(), createdBy: adminUser.email });
      return response(200, { ok: true, message: `Email processed. ${sent} sent${failed ? `, ${failed} failed` : ''}.`, sent, failed, total: recipients.length });
    }

    return response(400, { error: 'Unknown admin action.' });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || 'The admin request could not be completed.' });
  }
};
