import { response, parseBody, cleanString, normaliseEmail, isEmail } from './_shared/http.js';
import { getFirebase } from './_shared/firebase.js';
import { consumeRateLimit } from './_shared/rate-limit.js';
import { sendBrandedEmail, notifyAdmin } from './_shared/email.js';

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  try {
    if (!(await consumeRateLimit(event, 'subscribe', 5, 60))) return response(429, { error: 'Please wait a little before trying again.' });
    const body = parseBody(event);
    if (cleanString(body.website, 200)) return response(400, { error: 'Unable to subscribe.' });
    const email = normaliseEmail(body.email);
    const name = cleanString(body.name, 70);
    if (!isEmail(email)) return response(400, { error: 'Enter a valid email address.' });
    const { db, FieldValue } = getFirebase();
    const ref = db.collection('subscribers').doc(Buffer.from(email).toString('base64url'));
    const exists = await ref.get();
    if (exists.exists && exists.data().status === 'subscribed') return response(200, { ok: true, message: 'You are already on the list.' });
    await ref.set({ email, name, status: 'subscribed', source: 'website', subscribedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await Promise.allSettled([
      sendBrandedEmail({ to: email, type: 'subscriber_welcome', data: { name, email }, unsubscribeEmail: email }),
      notifyAdmin('subscriber_admin', { name, email })
    ]);
    return response(201, { ok: true, message: 'You are on the list. Keep an eye on your inbox.' });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || 'We could not add you to the list.' });
  }
};
