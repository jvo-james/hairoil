import { Resend } from 'resend';
import crypto from 'node:crypto';

const BRAND = 'Hair Confidante by MB';
const fromAddress = () => process.env.RESEND_FROM_EMAIL || 'Hair Confidante <onboarding@resend.dev>';
const siteUrl = () => String(process.env.SITE_URL || process.env.URL || 'https://example.com').replace(/\/$/, '');

export function escapeHTML(input = '') {
  return String(input).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function shell({ eyebrow = 'A NOTE FROM HAIR CONFIDANTE', title, intro, content, buttonText, buttonUrl, footer = 'Made with care. Thank you for being here.', unsubscribeUrl = '' }) {
  const safeTitle = escapeHTML(title || BRAND);
  const cta = buttonText && buttonUrl ? `<tr><td align="center" style="padding:28px 0 8px"><a href="${escapeHTML(buttonUrl)}" style="display:inline-block;padding:15px 24px;background:#321f29;color:#fff7ee;text-decoration:none;font-size:12px;letter-spacing:1.3px;font-weight:700;border-radius:2px">${escapeHTML(buttonText)}</a></td></tr>` : '';
  const unsubscribe = unsubscribeUrl ? `<br><br><a href="${escapeHTML(unsubscribeUrl)}" style="font-size:10px;color:#765742">Unsubscribe from email updates</a>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4efe7;font-family:Arial,Helvetica,sans-serif;color:#30252b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe7;padding:28px 10px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf8;border:1px solid #e9dfd3"><tr><td style="padding:24px 30px;border-bottom:1px solid #eadfd2"><div style="font-size:18px;letter-spacing:2.7px;font-weight:800;color:#321f29">HAIR CONFIDANTE</div><div style="font-family:Georgia,serif;font-size:12px;color:#8c6b57;margin-top:5px">by MB</div></td></tr><tr><td style="padding:35px 30px 12px"><div style="font-size:10px;letter-spacing:2px;font-weight:700;color:#9c765b;margin-bottom:17px">${escapeHTML(eyebrow)}</div><h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;line-height:1.15;font-size:33px;margin:0 0 18px;color:#321f29">${safeTitle}</h1><p style="font-size:15px;line-height:1.8;color:#64575b;margin:0">${intro || ''}</p></td></tr><tr><td style="padding:0 30px 16px"><div style="border-top:1px solid #eadfd2;margin-top:14px;padding-top:19px;font-size:14px;line-height:1.8;color:#4d4145">${content || ''}</div></td></tr>${cta}<tr><td style="padding:28px 30px 31px;background:#f9f4ec;border-top:1px solid #eadfd2"><p style="font-size:12px;color:#8e7d78;line-height:1.8;margin:0">${escapeHTML(footer)}<br><a href="${siteUrl()}" style="color:#765742">Hair Confidante by MB</a>${unsubscribe}</p></td></tr></table></td></tr></table></body></html>`;
}

const orderUrl = () => `${siteUrl()}/`;
const money = value => `GH₵${Number(value || 0).toFixed(2)}`;
function orderRows(order, amountLabel = 'Product subtotal') {
  const fee = Number(order.processingFee || 0);
  const charged = Number(order.amountDue ?? (Number(order.total || 0) + fee));
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;line-height:1.9"><tr><td style="color:#8e7d78">Order number</td><td align="right" style="font-weight:700">${escapeHTML(order.orderNumber || '')}</td></tr><tr><td style="color:#8e7d78">Product</td><td align="right">${escapeHTML(order.productName || 'Hair Confidante Hair Oil')}</td></tr><tr><td style="color:#8e7d78">Quantity</td><td align="right">${Number(order.quantity || 1)}</td></tr><tr><td style="color:#8e7d78">${escapeHTML(amountLabel)}</td><td align="right">${money(order.total)}</td></tr>${fee > 0 ? `<tr><td style="color:#8e7d78">Processing fee</td><td align="right">${money(fee)}</td></tr>` : ''}<tr><td style="padding-top:5px;border-top:1px solid #eadfd2;font-weight:700">Total charged</td><td align="right" style="padding-top:5px;border-top:1px solid #eadfd2;font-weight:700">${money(charged)}</td></tr></table>`;
}
function deliveryUpdate(order) {
  const status = String(order.status || '').toLowerCase();
  if (status === 'cancelled') return '';
  if (status === 'delivered') {
    const when = order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' }) : '';
    return when ? `<p style="margin:18px 0 0;padding:12px 14px;background:#f4efe7"><strong>Delivered on:</strong> ${escapeHTML(when)}</p>` : '';
  }
  if (!order.expectedDeliveryDate) return '';
  const d = new Date(`${String(order.expectedDeliveryDate).slice(0,10)}T12:00:00Z`);
  const text = Number.isNaN(d.getTime()) ? String(order.expectedDeliveryDate) : d.toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' });
  return `<p style="margin:18px 0 0;padding:12px 14px;background:#f4efe7"><strong>Expected delivery:</strong> ${escapeHTML(text)}</p>`;
}

export function buildEmail(type, data = {}) {
  const name = escapeHTML(data.name || 'there');
  const order = data.order || data;
  const orderNo = escapeHTML(order.orderNumber || 'your order');
  const trackUrl = `${siteUrl()}/`;
  const content = {
    order_preparing: {
      subject: `We've got your order ${orderNo}`,
      html: shell({ eyebrow: 'ORDER CONFIRMED', title: 'Your order is in good hands.', intro: `Hi ${name}, thank you for choosing Hair Confidante. Your payment has been confirmed and we're preparing your order.`, content: orderRows(order) + deliveryUpdate(order) + `<p style="margin:20px 0 0">We'll email you again when your order is ready to move.</p>`, buttonText: 'Visit Hair Confidante', buttonUrl: orderUrl() })
    },
    order_ready: {
      subject: `Your order ${orderNo} is ready`,
      html: shell({ eyebrow: 'A LITTLE UPDATE', title: 'Your order is ready.', intro: `Hi ${name}, we've marked order ${orderNo} as ready. We'll let you know when it has been dispatched.`, content: orderRows(order) + deliveryUpdate(order), buttonText: 'View Hair Confidante', buttonUrl: orderUrl() })
    },
    order_dispatched: {
      subject: `Your order ${orderNo} is on the way`,
      html: shell({ eyebrow: 'ON ITS WAY', title: 'Your order has been dispatched.', intro: `Hi ${name}, order ${orderNo} has been dispatched. Keep an eye out for your delivery.`, content: orderRows(order) + deliveryUpdate(order), buttonText: 'View Hair Confidante', buttonUrl: orderUrl() })
    },
    order_delivered: {
      subject: `Order ${orderNo} has been delivered`,
      html: shell({ eyebrow: 'DELIVERY UPDATE', title: 'Your order has arrived.', intro: `Hi ${name}, order ${orderNo} has been marked as delivered. We hope Hair Confidante fits beautifully into your routine.`, content: orderRows(order) + deliveryUpdate(order) + `<p style="margin:20px 0 0">When you've had a chance to try it, your honest review helps the next customer.</p>`, buttonText: 'Leave a review', buttonUrl: `${siteUrl()}/product.html#reviews` })
    },
    order_cancelled: {
      subject: `An update on order ${orderNo}`,
      html: shell({ eyebrow: 'ORDER UPDATE', title: 'Your order was cancelled.', intro: `Hi ${name}, order ${orderNo} has been cancelled by the store. If you believe this was a mistake or need help with a refund, please contact us.`, content: orderRows(order) + deliveryUpdate(order) + `<p style="margin:20px 0 0">Please reply to this email or contact 0593231032 for assistance.</p>`, buttonText: 'Visit Hair Confidante', buttonUrl: orderUrl() })
    },
    payment_failed: {
      subject: `Payment update for order ${orderNo}`,
      html: shell({ eyebrow: 'PAYMENT UPDATE', title: 'Your payment was not confirmed.', intro: `Hi ${name}, Paystack did not confirm the payment attempt for order ${orderNo}. The store has not marked this order as paid. If your provider shows a debit, please contact us before trying again.`, content: `<p><strong>Order number:</strong> ${orderNo}</p><p><strong>Expected total:</strong> ${money(order.amountDue ?? (Number(order.total || 0) + Number(order.processingFee || 0)))}</p><p>If your bank or Mobile Money provider shows a debit, please contact us before trying again so we can help check it.</p>`, buttonText: 'Return to the shop', buttonUrl: `${siteUrl()}/product.html` })
    },
    payment_failed_admin: {
      subject: `Payment attempt did not complete: ${orderNo}`,
      html: shell({ eyebrow: 'PAYMENT ATTEMPT UPDATE', title: 'A payment was not confirmed.', intro: `The payment attempt for order ${orderNo} did not complete. The store has not marked this order as paid.`, content: orderRows(order, 'Product subtotal') + `<p><strong>Customer:</strong> ${escapeHTML(order.name || '')}<br><strong>Email:</strong> ${escapeHTML(order.email || '')}<br><strong>Phone:</strong> ${escapeHTML(order.phone || '')}</p>`, buttonText: 'Open admin', buttonUrl: `${siteUrl()}/admin.html` })
    },
    review_received: {
      subject: 'Thanks for sharing your experience',
      html: shell({ eyebrow: 'REVIEW RECEIVED', title: 'Your note is with us.', intro: `Hi ${name}, thank you for taking a moment to share your Hair Confidante experience. We review submissions before they appear on the website.`, content: `<p style="margin:0 0 8px;color:#9c765b">${'★'.repeat(Number(data.rating || 0))}${'☆'.repeat(5 - Number(data.rating || 0))}</p><p style="margin:0;font-style:italic">“${escapeHTML(data.review || '')}”</p>`, buttonText: 'Back to the product', buttonUrl: `${siteUrl()}/product.html#reviews` })
    },
    review_admin: {
      subject: 'A new product review needs moderation',
      html: shell({ eyebrow: 'ADMIN NOTIFICATION', title: 'A new review arrived.', intro: `A customer has submitted a review for Hair Confidante Hair Oil. It is hidden until approved.`, content: `<p><strong>${name}</strong> · ${Number(data.rating || 0)} out of 5 stars</p><blockquote style="margin:10px 0;padding:12px 16px;background:#f9f4ec;border-left:3px solid #d1aa79">${escapeHTML(data.review || '')}</blockquote><p style="font-size:12px;color:#8e7d78">${escapeHTML(data.email || '')}</p>`, buttonText: 'Open admin', buttonUrl: `${siteUrl()}/admin.html` })
    },
    review_approved: {
      subject: 'Your review is now live',
      html: shell({ eyebrow: 'THANK YOU', title: 'Your words are live.', intro: `Hi ${name}, your Hair Confidante review has been approved and is now visible on the website. Thank you for helping the community.`, content: `<p style="font-style:italic">“${escapeHTML(data.review || '')}”</p>`, buttonText: 'Read the reviews', buttonUrl: `${siteUrl()}/product.html#reviews` })
    },
    subscriber_welcome: {
      subject: 'You are on the Hair Confidante list',
      html: shell({ eyebrow: 'WELCOME IN', title: 'A little note, now and then.', intro: `Hi ${name}, you're on the Hair Confidante mailing list. We'll only send useful updates about the product, new content and the brand.`, content: `<p>You can reply to this email if you need help or have a question.</p>`, buttonText: 'Meet the product', buttonUrl: `${siteUrl()}/product.html`, unsubscribeUrl: data.unsubscribeUrl || '' })
    },
    subscriber_admin: {
      subject: 'A new newsletter subscriber',
      html: shell({ eyebrow: 'ADMIN NOTIFICATION', title: 'Someone joined the list.', intro: 'A new person has subscribed to Hair Confidante updates.', content: `<p><strong>Email:</strong> ${escapeHTML(data.email || '')}</p><p><strong>Name:</strong> ${name}</p>`, buttonText: 'Open admin', buttonUrl: `${siteUrl()}/admin.html` })
    },
    message_received: {
      subject: 'We received your message',
      html: shell({ eyebrow: 'MESSAGE RECEIVED', title: 'Your message is with us.', intro: `Hi ${name}, thanks for reaching out to Hair Confidante. Your message has been received and someone will get back to you.`, content: `<div style="background:#f9f4ec;padding:14px 16px">${escapeHTML(data.message || '')}</div>`, buttonText: 'Visit Hair Confidante', buttonUrl: orderUrl() })
    },
    message_admin: {
      subject: 'A new customer message arrived',
      html: shell({ eyebrow: 'ADMIN NOTIFICATION', title: 'A customer got in touch.', intro: `${name} has sent a new message.`, content: `<p><strong>Email:</strong> ${escapeHTML(data.email || '')}</p><p><strong>Phone:</strong> ${escapeHTML(data.phone || 'Not provided')}</p><div style="background:#f9f4ec;padding:14px 16px">${escapeHTML(data.message || '')}</div>`, buttonText: 'Open messages', buttonUrl: `${siteUrl()}/admin.html` })
    },
    purchase_admin: {
      subject: `Paid order received: ${orderNo}`,
      html: shell({ eyebrow: 'NEW PAID ORDER', title: 'A new order is ready to work on.', intro: `The customer payment has been verified. Order ${orderNo} is now preparing.`, content: orderRows(order) + `<p><strong>Customer:</strong> ${escapeHTML(order.name || '')}<br><strong>Email:</strong> ${escapeHTML(order.email || '')}<br><strong>Phone:</strong> ${escapeHTML(order.phone || '')}<br><strong>Address:</strong> ${escapeHTML([order.address,order.city,order.region,order.postalCode,order.country].filter(Boolean).join(', '))}</p>`, buttonText: 'Manage order', buttonUrl: `${siteUrl()}/admin.html` })
    },
    custom: {
      subject: cleanSubject(data.subject || 'A note from Hair Confidante'),
      html: shell({ eyebrow: 'A NOTE FROM HAIR CONFIDANTE', title: data.title || data.subject || 'A little update for you.', intro: escapeHTML(data.intro || ''), content: String(data.messageHtml || `<p>${escapeHTML(data.message || '').replace(/\n/g, '<br>')}</p>`), buttonText: data.buttonText, buttonUrl: data.buttonUrl || siteUrl(), footer: 'You are receiving this email from Hair Confidante by MB.', unsubscribeUrl: data.unsubscribeUrl || '' })
    }
  };
  return content[type] || content.custom;
}

function cleanSubject(value) { return String(value).replace(/[\r\n]/g, ' ').slice(0, 150); }

function signedUnsubscribeUrl(email) {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret || !email) return '';
  const normalised = String(email).trim().toLowerCase();
  const token = crypto.createHmac('sha256', secret).update(normalised).digest('hex');
  return `${siteUrl()}/.netlify/functions/unsubscribe?email=${encodeURIComponent(normalised)}&token=${token}`;
}

export async function sendBrandedEmail({ to, type, data = {}, replyTo, unsubscribeEmail }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { skipped: true, reason: 'Resend credentials are not configured.' };
  const emailData = unsubscribeEmail ? { ...data, unsubscribeUrl: signedUnsubscribeUrl(unsubscribeEmail) } : data;
  const email = buildEmail(type, emailData);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({ from: fromAddress(), to: Array.isArray(to) ? to : [to], subject: email.subject, html: email.html, replyTo: replyTo || process.env.ADMIN_NOTIFICATION_EMAIL || undefined });
  if (result.error) throw new Error(result.error.message || 'Email could not be sent.');
  return { id: result.data?.id || null };
}

export async function notifyAdmin(type, data = {}) {
  const target = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!target) return { skipped: true, reason: 'ADMIN_NOTIFICATION_EMAIL is not configured.' };
  return sendBrandedEmail({ to: target, type, data, replyTo: data.email });
}
