import { response, parseBody, cleanString, toISO } from './_shared/http.js';
import { getFirebase } from './_shared/firebase.js';
import { findOrderByReference, paystackRequest, completePaidOrder } from './_shared/payments.js';
import { sendBrandedEmail, notifyAdmin } from './_shared/email.js';

function receiptOrder(order) {
  return { orderNumber: order.orderNumber, name: order.name, email: order.email, phone: order.phone, address: order.address, city: order.city, country: order.country, countryCode: order.countryCode, region: order.region, postalCode: order.postalCode, note: order.note, mode: order.mode, productName: order.productName, quantity: Number(order.quantity || 1), unitPrice: Number(order.unitPrice || 0), total: Number(order.total || 0), processingFee: Number(order.processingFee || 0), chargeTotal: Number(order.chargeTotal ?? (Number(order.total || 0) + Number(order.processingFee || 0))), amountPaid: Number(order.amountPaid ?? order.chargeTotal ?? (Number(order.total || 0) + Number(order.processingFee || 0))), currency: order.currency || 'GHS', paymentReference: order.paymentReference, paymentChannel: order.paymentChannel || 'Paystack', status: order.status || 'preparing', expectedDeliveryDate: toISO(order.expectedDeliveryDate), deliveredAt: toISO(order.deliveredAt), createdAt: toISO(order.createdAt), paidAt: toISO(order.paidAt) };
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  try {
    const body = parseBody(event);
    const reference = cleanString(body.reference, 140);
    if (!reference || !/^[a-zA-Z0-9_-]+$/.test(reference)) return response(400, { error: 'A valid payment reference is required.' });
    const { db } = getFirebase();
    const found = await findOrderByReference(db, reference);
    if (!found) return response(404, { error: 'We could not find an order for this payment reference.' });
    if (found.data.paymentStatus === 'success') return response(200, { verified: true, orderNumber: found.data.orderNumber, status: found.data.status, order: receiptOrder(found.data) });
    const verification = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
    const txn = verification.data;
    if (!txn || txn.status !== 'success') return response(202, { verified: false, pending: true, orderNumber: found.data.orderNumber, message: 'Payment is not confirmed yet. Please give it a moment and check again.' });
    const result = await completePaidOrder({ db, orderRef: found.ref, transactionData: txn });
    if (result.changed) {
      const order = result.order;
      await Promise.allSettled([
        sendBrandedEmail({ to: order.email, type: 'order_preparing', data: { name: order.name, order } }),
        notifyAdmin('purchase_admin', { order })
      ]);
    }
    return response(200, { verified: true, orderNumber: result.order.orderNumber, status: result.order.status, order: receiptOrder(result.order) });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || 'Payment verification could not be completed.' });
  }
};
