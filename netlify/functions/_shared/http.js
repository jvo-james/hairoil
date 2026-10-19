export const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

export function response(statusCode, payload) {
  return { statusCode, headers, body: JSON.stringify(payload ?? {}) };
}

export function methodNotAllowed(allowed = 'POST') {
  return response(405, { error: `Method not allowed. Use ${allowed}.` });
}

export function parseBody(event) {
  const raw = event?.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event?.body || '{}');
  if (raw.length > 80_000) throw new Error('This request is too large.');
  try { return JSON.parse(raw); } catch { throw new Error('Please send valid JSON.'); }
}

export function cleanString(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

export function normaliseEmail(value) {
  return cleanString(value, 160).toLowerCase();
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;
}

export function publicOrder(order) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    mode: order.mode,
    productName: order.productName,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    total: order.total,
    processingFee: Number(order.processingFee || 0),
    chargeTotal: Number(order.chargeTotal ?? (Number(order.total || 0) + Number(order.processingFee || 0))),
    amountPaid: Number(order.amountPaid ?? order.chargeTotal ?? (Number(order.total || 0) + Number(order.processingFee || 0))),
    expectedDeliveryDate: toISO(order.expectedDeliveryDate),
    deliveredAt: toISO(order.deliveredAt),
    currency: 'GHS',
    createdAt: toISO(order.createdAt),
    updatedAt: toISO(order.updatedAt),
    history: Array.isArray(order.history) ? order.history.map(item => ({ status: item.status, at: toISO(item.at) })) : []
  };
}

export function toISO(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
