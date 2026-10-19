import { getFirebase } from './firebase.js';
import { estimateDeliveryDate } from './store.js';

export async function paystackRequest(path, body) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('Paystack is not configured. Add PAYSTACK_SECRET_KEY in Netlify environment variables.');
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) throw new Error(payload.message || 'Paystack could not complete this request.');
  return payload;
}

export async function findOrderByReference(db, reference) {
  const snapshot = await db.collection('orders').where('paymentReference', '==', reference).limit(1).get();
  if (snapshot.empty) return null;
  return { ref: snapshot.docs[0].ref, data: snapshot.docs[0].data() };
}

export async function completePaidOrder({ db, orderRef, transactionData }) {
  const { FieldValue } = getFirebase();
  const settingsRef = db.collection('settings').doc('store');
  const result = await db.runTransaction(async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new Error('Order not found for this payment.');
    const settingsSnap = await tx.get(settingsRef);
    const order = orderSnap.data();
    if (order.paymentStatus === 'success') return { changed: false, order };
    if (transactionData.status !== 'success' || transactionData.reference !== order.paymentReference) {
      throw new Error('Payment verification did not match this order.');
    }
    if (String(transactionData.currency).toUpperCase() !== 'GHS' || Number(transactionData.amount) !== Number(order.amountSubunits)) {
      throw new Error('The verified payment amount did not match the order total.');
    }
    if (String(transactionData.customer?.email || '').toLowerCase() !== String(order.email || '').toLowerCase()) {
      throw new Error('The verified payment email did not match the order email.');
    }
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    let inventoryShortfall = false;
    const stock = Number(settings.inventory);
    const alreadyReserved = order.inventoryReserved === true;
    if (!alreadyReserved && settings.inventory !== null && settings.inventory !== undefined && Number.isFinite(stock)) {
      if (stock < Number(order.quantity)) inventoryShortfall = true;
      tx.set(settingsRef, { inventory: Math.max(0, stock - Number(order.quantity)), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const nowIso = new Date().toISOString();
    const expectedDeliveryDate = order.status === 'cancelled' ? null : (order.expectedDeliveryDate || estimateDeliveryDate(settings));
    const updated = {
      ...order,
      paymentStatus: 'success',
      status: 'preparing',
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      expectedDeliveryDate, inventoryReserved: false, inventoryReservationCommitted: alreadyReserved,
      inventoryShortfall,
      paymentChannel: transactionData.channel || null,
      paystackTransactionId: String(transactionData.id || ''),
      history: [...(Array.isArray(order.history) ? order.history : []), { status: 'preparing', at: nowIso }]
    };
    tx.update(orderRef, {
      paymentStatus: updated.paymentStatus,
      status: updated.status,
      paidAt: updated.paidAt,
      updatedAt: updated.updatedAt,
      expectedDeliveryDate: updated.expectedDeliveryDate, inventoryReserved: false, inventoryReservationCommitted: alreadyReserved,
      inventoryShortfall,
      paymentChannel: updated.paymentChannel,
      paystackTransactionId: updated.paystackTransactionId,
      history: updated.history
    });
    return { changed: true, order: { ...updated, orderNumber: order.orderNumber } };
  });
  return result;
}
