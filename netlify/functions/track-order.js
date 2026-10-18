import { response, parseBody, cleanString, normaliseEmail, isEmail, publicOrder } from './_shared/http.js';
import { getFirebase } from './_shared/firebase.js';
import { consumeRateLimit } from './_shared/rate-limit.js';

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  try {
    if (!(await consumeRateLimit(event, 'track-order', 10, 60))) return response(429, { error: 'Too many tracking attempts. Please try again later.' });
    const body = parseBody(event);
    const email = normaliseEmail(body.email);
    const orderNumber = cleanString(body.orderNumber, 30).toUpperCase();
    if (!isEmail(email) || !/^HC-\d{5,8}$/.test(orderNumber)) return response(400, { error: 'Enter the email used at checkout and a valid order number such as HC-00001.' });
    const { db } = getFirebase();
    const snap = await db.collection('orders').doc(orderNumber).get();
    if (!snap.exists) return response(404, { error: 'We could not find an order with those details. Please check both fields and try again.' });
    const order = snap.data();
    if (String(order.email || '').toLowerCase() !== email || order.paymentStatus !== 'success') {
      return response(404, { error: 'We could not find an order with those details. Please check both fields and try again.' });
    }
    return response(200, { ok: true, order: publicOrder(order) });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || 'Order tracking is temporarily unavailable.' });
  }
};
