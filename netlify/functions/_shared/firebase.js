import admin from 'firebase-admin';

let cachedDb;
let cachedAuth;

export function getFirebase() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Firebase is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON in Netlify environment variables.');
    let serviceAccount;
    try { serviceAccount = JSON.parse(raw); } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain the full service account JSON.'); }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id });
  }
  cachedDb ||= admin.firestore();
  cachedAuth ||= admin.auth();
  return { admin, db: cachedDb, auth: cachedAuth, FieldValue: admin.firestore.FieldValue, Timestamp: admin.firestore.Timestamp };
}

export async function requireAdmin(event) {
  const authHeader = event?.headers?.authorization || event?.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) throw Object.assign(new Error('Please sign in to continue.'), { statusCode: 401 });
  const { auth } = getFirebase();
  let decoded;
  try { decoded = await auth.verifyIdToken(match[1], true); }
  catch { throw Object.assign(new Error('Your sign-in has expired. Please sign in again.'), { statusCode: 401 }); }
  const allowlist = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const isAllowlisted = Boolean(decoded.email && allowlist.includes(decoded.email.toLowerCase()));
  const { db, FieldValue } = getFirebase();
  const settingsRef = db.collection('settings').doc('store');
  const settingsSnap = await settingsRef.get();
  const storeSettings = settingsSnap.exists ? settingsSnap.data() : {};
  const registeredUid = storeSettings.adminUid || null;
  const isRegisteredOwner = Boolean(registeredUid && registeredUid === decoded.uid);
  if (!decoded.email || (!isAllowlisted && !isRegisteredOwner)) {
    throw Object.assign(new Error('This account does not have admin access.'), { statusCode: 403 });
  }
  if (isAllowlisted && !registeredUid && decoded.uid) {
    await settingsRef.set({ adminUid: decoded.uid, adminUidLinkedAt: FieldValue.serverTimestamp() }, { merge: true });
    storeSettings.adminUid = decoded.uid;
  }
  // Reuse this already-read document in admin-api instead of reading settings/store twice.
  return { ...decoded, storeSettings };
}
