import crypto from 'node:crypto';
import { response } from './_shared/http.js';
import { getFirebase } from './_shared/firebase.js';
import { findOrderByReference, paystackRequest, completePaidOrder } from './_shared/payments.js';
import { sendBrandedEmail, notifyAdmin } from './_shared/email.js';

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return response(503, { error: 'Payment webhook is not configured.' });
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '', 'utf8');
    const received = event.headers?.['x-paystack-signature'] || event.headers?.['X-Paystack-Signature'] || '';
    const expected = crypto.createHmac('sha512', secret).update(raw).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = /^[a-f0-9]{128}$/i.test(received) ? Buffer.from(received, 'hex') : Buffer.alloc(0);
    if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) return response(401, { error: 'Invalid webhook signature.' });
    const payload = JSON.parse(raw.toString('utf8'));
    if (!payload.data?.reference || !['charge.success', 'charge.failed'].includes(payload.event)) return response(200, { received: true, ignored: true });
    const { db, FieldValue } = getFirebase();
    const found = await findOrderByReference(db, String(payload.data.reference));
    if (!found) return response(200, { received: true, ignored: true });
    if (found.data.paymentStatus === 'success') return response(200, { received: true, alreadyProcessed: true });

    if (payload.event === 'charge.failed') {
      let orderForEmail = null;
      const didUpdate = await db.runTransaction(async tx => {
        const orderSnap = await tx.get(found.ref);
        if (!orderSnap.exists) return false;
        const order = orderSnap.data();
        if (order.paymentStatus === 'success' || order.paymentStatus === 'failed') return false;
        orderForEmail = { ...order, orderNumber: order.orderNumber || found.ref.id };
        tx.update(found.ref, { paymentStatus: 'failed', paymentFailureMessage: String(payload.data.gateway_response || payload.data.message || 'Payment was not confirmed').slice(0, 240), updatedAt: FieldValue.serverTimestamp() });
        return true;
      });
      if (didUpdate && orderForEmail) {
        await Promise.allSettled([
          sendBrandedEmail({ to: orderForEmail.email, type: 'payment_failed', data: { name: orderForEmail.name, order: orderForEmail } }),
          notifyAdmin('payment_failed_admin', { order: orderForEmail })
        ]);
      }
      return response(200, { received: true, paymentFailed: didUpdate });
    }

    const verified = await paystackRequest(`/transaction/verify/${encodeURIComponent(payload.data.reference)}`);
    if (verified.data?.status !== 'success') return response(200, { received: true, pending: true });
    const result = await completePaidOrder({ db, orderRef: found.ref, transactionData: verified.data });
    if (result.changed) {
      const order = result.order;
      await Promise.allSettled([
        sendBrandedEmail({ to: order.email, type: 'order_preparing', data: { name: order.name, order } }),
        notifyAdmin('purchase_admin', { order })
      ]);
    }
    return response(200, { received: true, processed: true });
  } catch (error) {
    return response(500, { error: error.message || 'Webhook processing failed.' });
  }
};
