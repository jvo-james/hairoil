import admin from 'firebase-admin';

// Netlify environment variable values are strings. Normalise common copy/paste
// artefacts without making the allow-list comparison less strict.
function normaliseAdminEmail(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .trim()
    .toLowerCase();
}

function parseAdminEmails(value) {
  const cleaned = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, '$2')
    .replace(/^ADMIN_EMAILS\s*=\s*/i, '');
  return cleaned
    .split(/[,;\r\n]+/)
    .map(normaliseAdminEmail)
    .filter(Boolean);
}

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
  const allowlist = parseAdminEmails(process.env.ADMIN_EMAILS);
  const tokenEmail = normaliseAdminEmail(decoded.email);
  const isAllowlisted = Boolean(tokenEmail && allowlist.includes(tokenEmail));
  const { db, FieldValue } = getFirebase();
  const settingsRef = db.collection('settings').doc('store');
  const settingsSnap = await settingsRef.get();
  const storeSettings = settingsSnap.exists ? settingsSnap.data() : {};
  const registeredUid = storeSettings.adminUid || null;
  const isRegisteredOwner = Boolean(registeredUid && registeredUid === decoded.uid);

  if (!tokenEmail) {
    console.warn('[admin-auth] Rejected sign-in: verified Firebase token has no email claim.', {
      firebaseProjectId: decoded.aud || null,
      uidPresent: Boolean(decoded.uid)
    });
    throw Object.assign(new Error('Firebase sign-in succeeded, but the verified session has no email address. Sign out and sign in again with the admin email/password account.'), { statusCode: 403 });
  }

  if (!isAllowlisted && !isRegisteredOwner) {
    // Log diagnostic flags, never the configured allow-list or service-account secrets.
    console.warn('[admin-auth] Rejected admin access.', {
      firebaseProjectId: decoded.aud || null,
      adminEmailsConfigured: allowlist.length > 0,
      adminEmailsCount: allowlist.length,
      tokenEmailMatchesAllowlist: isAllowlisted,
      registeredAdminUidConfigured: Boolean(registeredUid),
      tokenUidMatchesRegisteredAdmin: isRegisteredOwner
    });
    const message = allowlist.length === 0
      ? 'Admin access is not configured for this deployed Netlify Function: ADMIN_EMAILS is empty or unavailable. Check that the variable is available to Functions for the active deployment context, then redeploy.'
      : 'Firebase sign-in succeeded, but this deployed Netlify Function did not authorize the account email in the verified session. Check the active Netlify site/deployment context and the ADMIN_EMAILS value, then redeploy.';
    throw Object.assign(new Error(message), { statusCode: 403 });
  }
  if (isAllowlisted && !registeredUid && decoded.uid) {
    await settingsRef.set({ adminUid: decoded.uid, adminUidLinkedAt: FieldValue.serverTimestamp() }, { merge: true });
    storeSettings.adminUid = decoded.uid;
  }
  // Reuse this already-read document in admin-api instead of reading settings/store twice.
  return { ...decoded, storeSettings };
}
