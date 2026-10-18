import { response, parseBody, cleanString, normaliseEmail, isEmail } from './_shared/http.js';
import { getFirebase } from './_shared/firebase.js';
import { consumeRateLimit } from './_shared/rate-limit.js';
import { sendBrandedEmail, notifyAdmin } from './_shared/email.js';

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  try {
    if (!(await consumeRateLimit(event, 'message', 5, 60))) return response(429, { error: 'Please wait before sending another message.' });
    const body = parseBody(event);
    if (cleanString(body.company_site, 200)) return response(400, { error: 'Unable to send this message.' });
    const name = cleanString(body.name, 70);
    const email = normaliseEmail(body.email);
    const phone = cleanString(body.phone, 25);
    const message = cleanString(body.message, 2000);
    if (name.length < 2 || !isEmail(email) || message.length < 10) return response(400, { error: 'Please add your name, a valid email and a message of at least 10 characters.' });
    const { db, FieldValue } = getFirebase();
    await db.collection('messages').add({ name, email, phone, message, status: 'unread', createdAt: FieldValue.serverTimestamp(), source: 'website' });
    await Promise.allSettled([
      sendBrandedEmail({ to: email, type: 'message_received', data: { name, email, phone, message } }),
      notifyAdmin('message_admin', { name, email, phone, message })
    ]);
    return response(201, { ok: true, message: 'Your message has been sent. Thanks for reaching out.' });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || 'We could not send your message.' });
  }
};
