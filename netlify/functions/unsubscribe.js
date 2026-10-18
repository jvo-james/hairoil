import crypto from 'node:crypto';
import { getFirebase } from './_shared/firebase.js';
import { normaliseEmail, isEmail } from './_shared/http.js';

function page(title, message, status = 200) {
  const safeTitle = String(title).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const safeMessage = String(message).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  return { statusCode: status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" }, body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f4efe7"><title>${safeTitle} | Hair Confidante</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:#f4efe7;color:#30252b;font-family:Arial,sans-serif}.card{max-width:520px;width:100%;padding:clamp(28px,7vw,54px);background:#fffdf8;border:1px solid #e3d5c6;box-shadow:0 20px 70px #2f1d2910}.brand{font-size:13px;letter-spacing:.22em;font-weight:800}.by{margin-top:7px;color:#9c765b;font-family:Georgia,serif}.rule{height:1px;background:#eadfd2;margin:30px 0}.eyebrow{font-size:10px;letter-spacing:.18em;color:#9c765b;font-weight:700}h1{font-family:Georgia,serif;font-size:clamp(32px,7vw,46px);font-weight:500;line-height:1.1;margin:13px 0}p{font-size:14px;line-height:1.8;color:#65585d}</style></head><body><main class="card"><div class="brand">HAIR CONFIDANTE</div><div class="by">by MB</div><div class="rule"></div><div class="eyebrow">EMAIL PREFERENCES</div><h1>${safeTitle}</h1><p>${safeMessage}</p></main></body></html>` };
}

export const handler = async event => {
  if (event.httpMethod !== 'GET') return page('Link not available', 'Use the unsubscribe link from the email we sent you.', 405);
  const email = normaliseEmail(event.queryStringParameters?.email);
  const token = String(event.queryStringParameters?.token || '');
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret || !isEmail(email) || !/^[a-f0-9]{64}$/i.test(token)) return page('Link could not be verified', 'This unsubscribe link is incomplete or no longer valid. Please contact us for help.', 400);
  const expected = crypto.createHmac('sha256', secret).update(email).digest();
  const supplied = Buffer.from(token, 'hex');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return page('Link could not be verified', 'This unsubscribe link is incomplete or no longer valid. Please contact us for help.', 400);
  try {
    const { db, FieldValue } = getFirebase();
    const id = Buffer.from(email).toString('base64url');
    await db.collection('subscribers').doc(id).set({ email, status: 'unsubscribed', unsubscribedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), source: 'email-link' }, { merge: true });
    return page('You are unsubscribed.', 'You will no longer receive marketing updates from Hair Confidante. If you signed up again later, you can choose to hear from us again.', 200);
  } catch {
    return page('We could not update your preferences', 'Please contact Hair Confidante and we will help remove you from the mailing list.', 500);
  }
};
