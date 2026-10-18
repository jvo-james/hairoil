import { response, parseBody, cleanString, normaliseEmail, isEmail } from './_shared/http.js';
import { getFirebase } from './_shared/firebase.js';
import { consumeRateLimit } from './_shared/rate-limit.js';
import { sendBrandedEmail, notifyAdmin } from './_shared/email.js';

export const handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  try {
    if (!(await consumeRateLimit(event, 'review', 4, 60))) return response(429, { error: 'That is a lot of reviews in a short time. Please try again later.' });
    const body = parseBody(event);
    if (cleanString(body.website, 200)) return response(400, { error: 'Unable to submit this review.' });
    const name = cleanString(body.name, 70);
    const email = normaliseEmail(body.email);
    const rating = Number(body.rating);
    const review = cleanString(body.review, 1200);
    if (name.length < 2 || !isEmail(email) || !Number.isInteger(rating) || rating < 1 || rating > 5 || review.length < 12) {
      return response(400, { error: 'Please add your name, a valid email, a star rating and a review of at least 12 characters.' });
    }
    const { db, FieldValue } = getFirebase();
    const ref = await db.collection('reviews').add({ name, email, rating, review, published: false, moderationStatus: 'pending', createdAt: FieldValue.serverTimestamp(), source: 'website' });
    await Promise.allSettled([
      sendBrandedEmail({ to: email, type: 'review_received', data: { name, email, rating, review } }),
      notifyAdmin('review_admin', { name, email, rating, review, reviewId: ref.id })
    ]);
    return response(201, { ok: true, message: 'Thank you. Your review is waiting for approval.', id: ref.id });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || 'We could not submit your review. Please try again.' });
  }
};
