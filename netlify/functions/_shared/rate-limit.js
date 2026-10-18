import crypto from 'node:crypto';
import { getFirebase } from './firebase.js';

export async function consumeRateLimit(event, action, limit = 6, windowMinutes = 60) {
  const ip = event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const salt = process.env.RATE_LIMIT_SALT || process.env.FIREBASE_PROJECT_ID || 'hair-confidante';
  const key = crypto.createHash('sha256').update(`${salt}:${action}:${ip}`).digest('hex');
  const { db, FieldValue } = getFirebase();
  const ref = db.collection('rateLimits').doc(key);
  const bucket = Math.floor(Date.now() / (windowMinutes * 60 * 1000));
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const count = data.bucket === bucket ? Number(data.count || 0) : 0;
    if (count >= limit) return false;
    tx.set(ref, { bucket, count: count + 1, action, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}
