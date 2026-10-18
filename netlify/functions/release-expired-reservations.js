import { getFirebase } from './_shared/firebase.js';

export const config = { schedule: '@hourly' };

export const handler = async () => {
  const { db, FieldValue } = getFirebase();
  const now = new Date();
  const candidates = await db.collection('orders').where('inventoryReserved', '==', true).get();
  let released = 0;
  for (const candidate of candidates.docs) {
    const row = candidate.data();
    const expires = row.inventoryReservationExpiresAt?.toDate ? row.inventoryReservationExpiresAt.toDate() : new Date(row.inventoryReservationExpiresAt || 0);
    if (!Number.isFinite(expires.getTime()) || expires > now || row.paymentStatus === 'success') continue;
    const orderRef = candidate.ref;
    const settingsRef = db.collection('settings').doc('store');
    const didRelease = await db.runTransaction(async tx => {
      const [orderSnap, settingsSnap] = await Promise.all([tx.get(orderRef), tx.get(settingsRef)]);
      if (!orderSnap.exists) return false;
      const order = orderSnap.data();
      const currentExpiry = order.inventoryReservationExpiresAt?.toDate ? order.inventoryReservationExpiresAt.toDate() : new Date(order.inventoryReservationExpiresAt || 0);
      if (order.inventoryReserved !== true || order.paymentStatus === 'success' || !Number.isFinite(currentExpiry.getTime()) || currentExpiry > now) return false;
      if (settingsSnap.exists && settingsSnap.data().inventory !== null && settingsSnap.data().inventory !== undefined && Number.isFinite(Number(settingsSnap.data().inventory))) {
        tx.set(settingsRef, { inventory: Number(settingsSnap.data().inventory) + Number(order.quantity || 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      tx.update(orderRef, { inventoryReserved: false, inventoryReservationReleased: true, inventoryReservationReleasedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (didRelease) released++;
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, released }) };
};
