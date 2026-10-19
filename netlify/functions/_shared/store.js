export const DEFAULT_SETTINGS = {
  productName: 'Hair Confidante Hair Oil',
  productDescription: 'A hair oil created to be part of your regular hair and scalp care routine. Apply in sections, then massage gently into the scalp.',
  retailPrice: Number(process.env.RETAIL_PRICE_GHS || 70),
  wholesalePrice: Number(process.env.WHOLESALE_PRICE_GHS || 60),
  wholesaleMinQty: Number(process.env.WHOLESALE_MIN_QTY || 10),
  bottleSize: '100 mL',
  inventory: null,
  productImageUrl: '',
  dispatchDays: [1, 2, 3, 4, 5, 6],
  estimatedDeliveryDays: 3,
  updatedAt: null
};

export async function getSettings(db) {
  const snapshot = await db.collection('settings').doc('store').get();
  return snapshot.exists ? { ...DEFAULT_SETTINGS, ...snapshot.data() } : { ...DEFAULT_SETTINGS };
}

export function publicSettings(settings) {
  return {
    productName: settings.productName,
    productDescription: settings.productDescription,
    retailPrice: Number(settings.retailPrice),
    wholesalePrice: Number(settings.wholesalePrice),
    wholesaleMinQty: Math.max(1, Math.floor(Number(settings.wholesaleMinQty) || 10)),
    bottleSize: settings.bottleSize || '100 mL',
    inventory: Number.isFinite(settings.inventory) ? Number(settings.inventory) : null,
    productImageUrl: settings.productImageUrl || '',
    dispatchDays: Array.isArray(settings.dispatchDays) ? settings.dispatchDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [1, 2, 3, 4, 5, 6],
    estimatedDeliveryDays: Math.max(1, Math.min(21, Math.floor(Number(settings.estimatedDeliveryDays) || 3)))
  };
}

export function validWholeQuantity(value, min = 1, max = 1000) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= min && quantity <= max ? quantity : null;
}

export function validPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0.01 && price <= 100000 && Math.round(price * 100) === price * 100 ? price : null;
}

export function normaliseUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

export function estimateDeliveryDate(settings = {}, from = new Date()) {
  const allowed = Array.isArray(settings.dispatchDays) ? settings.dispatchDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [1, 2, 3, 4, 5, 6];
  const deliveryDays = allowed.length ? new Set(allowed) : new Set([1, 2, 3, 4, 5, 6]);
  const daysNeeded = Math.max(1, Math.min(21, Math.floor(Number(settings.estimatedDeliveryDays) || 3)));
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  let counted = 0;
  for (let attempts = 0; attempts < 45 && counted < daysNeeded; attempts++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (deliveryDays.has(cursor.getUTCDay())) counted++;
  }
  return cursor.toISOString().slice(0, 10);
}
