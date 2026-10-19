import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const config = window.HC_FIREBASE_CONFIG || {};
const loginScreen = document.querySelector('[data-admin-login-screen]');
const appScreen = document.querySelector('[data-admin-app]');
const loginForm = document.querySelector('[data-admin-login]');
const loginError = document.querySelector('[data-admin-login-error]');
const banner = document.querySelector('[data-admin-banner]');
const titleMap = {
  overview: ['Overview', 'Your store at a glance.'],
  orders: ['Orders', 'Every paid order and the next step.'],
  product: ['Product & stock', 'Control the information customers see.'],
  delivery: ['Delivery settings', 'Manage your regular delivery schedule.'],
  reviews: ['Reviews', 'Moderate customer reviews before publishing.'],
  messages: ['Messages', 'Keep track of questions and follow-ups.'],
  subscribers: ['Subscribers', 'Your growing community, in one place.'],
  purchases: ['Purchases', 'A record of verified payments.'],
  email: ['Email centre', 'Send a note with the Hair Confidante look.'],
  settings: ['Account settings', 'Keep your admin account current and secure.']
};
let auth;
let currentUser = null;
let dashboardData = null;
let dashboardTask = null;
let activeSection = 'overview';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const gh = value => `GH₵${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = value => { if (!value) return 'Not available'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString('en-GH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const shortDate = value => { if (!value) return 'New'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'New' : date.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }); };
const api = async payload => {
  if (!currentUser) throw new Error('Please sign in again.');
  const token = await currentUser.getIdToken();
  const response = await fetch('/.netlify/functions/admin-api', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
};

function bannerMessage(message, kind = 'success') {
  if (!banner) return;
  banner.textContent = message;
  banner.classList.toggle('is-error', kind === 'error');
  banner.hidden = false;
  clearTimeout(banner._hideTimer);
  banner._hideTimer = setTimeout(() => { banner.hidden = true; }, 6000);
}

async function loadingButton(button, task, label = 'Saving') {
  if (!button || button.dataset.busy === 'yes') return;
  const original = button.innerHTML;
  button.dataset.busy = 'yes'; button.disabled = true; button.classList.add('is-loading'); button.setAttribute('aria-busy', 'true');
  button.innerHTML = `<span class="button-spinner"><span class="spinner ${button.classList.contains('button-light') ? 'spinner-dark' : 'spinner-light'}"></span><span>${esc(label)}</span></span>`;
  try { return await task(); }
  finally { button.innerHTML = original; button.disabled = false; button.classList.remove('is-loading'); button.removeAttribute('aria-busy'); delete button.dataset.busy; }
}

function showLogin() { if (loginScreen) loginScreen.hidden = false; if (appScreen) appScreen.hidden = true; }
function showApp() { if (loginScreen) loginScreen.hidden = true; if (appScreen) appScreen.hidden = false; }
function setSection(section) {
  if (!titleMap[section]) return;
  activeSection = section;
  document.querySelectorAll('[data-admin-nav]').forEach(button => button.classList.toggle('is-active', button.dataset.adminNav === section));
  document.querySelectorAll('[data-admin-section]').forEach(panel => panel.classList.toggle('is-active', panel.dataset.adminSection === section));
  const title = document.querySelector('[data-admin-page-title]');
  const subtitle = document.querySelector('[data-admin-page-subtitle]');
  if (title) title.textContent = titleMap[section][0];
  if (subtitle) subtitle.textContent = titleMap[section][1];
  if (section === 'orders') renderOrders();
  if (section === 'product') fillProductForm();
  if (section === 'delivery') fillDeliveryForm();
  if (section === 'reviews') renderReviews();
  if (section === 'messages') renderMessages();
  if (section === 'subscribers') renderSubscribers();
  if (section === 'purchases') renderPurchases();
  if (section === 'email') renderEmailHistory();
  if (section === 'settings') fillAccountForm();
  closeMobileSidebar();
  const main = document.querySelector('.admin-main');
  if (main && window.matchMedia('(max-width: 760px)').matches) main.scrollTo({ top: 0, behavior: 'smooth' });
}

function statusPill(status) {
  const labels = { awaiting_payment: 'Awaiting payment', preparing: 'Preparing', ready: 'Ready', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled', pending: 'Pending', approved: 'Approved', hidden: 'Hidden', unread: 'Unread', read: 'Read', archived: 'Archived', subscribed: 'Subscribed', unsubscribed: 'Unsubscribed' };
  return `<span class="status-pill">${esc(labels[status] || status || 'Unknown')}</span>`;
}
function emptyTable(message) { return `<div class="admin-empty">${esc(message)}</div>`; }
function table(columns, rows, minimum = 680) {
  if (!rows.length) return emptyTable('Nothing here yet. New activity will show up here.');
  return `<table class="admin-table" style="min-width:${minimum}px"><thead><tr>${columns.map(col => `<th>${esc(col)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function renderMetrics() {
  const metrics = dashboardData?.metrics || {};
  const values = { orders: metrics.orders || 0, paidOrders: metrics.paidOrders || 0, revenue: gh(metrics.revenue || 0), subscribers: metrics.subscribers || 0 };
  Object.entries(values).forEach(([key, value]) => { const node = document.querySelector(`[data-metric="${key}"]`); if (node) node.textContent = value; });
  const target = document.querySelector('[data-overview-orders]');
  const orders = (dashboardData?.orders || []).slice(0, 6);
  if (target) target.innerHTML = table(['Order', 'Customer', 'Product subtotal', 'Status', 'Placed'], orders.map(order => `<tr data-open-order="${esc(order.orderNumber)}" tabindex="0" role="button"><td><strong>${esc(order.orderNumber)}</strong><small>${esc(order.mode || 'retail')}</small></td><td><strong>${esc(order.name || 'Customer')}</strong><small>${esc(order.email || '')}</small></td><td><strong>${gh(order.total)}</strong><small>${Number(order.quantity || 1)} bottle${Number(order.quantity) === 1 ? '' : 's'}</small></td><td>${statusPill(order.status)}</td><td>${esc(shortDate(order.createdAt))}</td></tr>`));
  if (target) bindOrderRowClicks(target);
}

function renderOrders() {
  const target = document.querySelector('[data-orders-table]');
  if (!target) return;
  const search = String(document.querySelector('[data-order-search]')?.value || '').toLowerCase().trim();
  const filter = document.querySelector('[data-order-filter]')?.value || 'all';
  const orders = (dashboardData?.orders || []).filter(order => {
    const text = `${order.orderNumber} ${order.name} ${order.email} ${order.phone}`.toLowerCase();
    return (!search || text.includes(search)) && (filter === 'all' || order.status === filter);
  });
  if (!orders.length) { target.innerHTML = emptyTable('No orders match this view.'); return; }
  const rows = orders.map(order => `<tr data-open-order="${esc(order.orderNumber)}" tabindex="0" role="button" aria-label="View order ${esc(order.orderNumber)} details"><td><strong>${esc(order.orderNumber)}</strong><small>${esc(order.mode || 'retail')} · ${esc(shortDate(order.createdAt))}</small><small class="admin-row-hint">View details <i class="fa-solid fa-arrow-up-right-from-square"></i></small></td><td><strong>${esc(order.name || 'Customer')}</strong><small>${esc(order.email || '')}</small></td><td><strong>${gh(order.total)}</strong><small>${Number(order.quantity || 1)} bottle${Number(order.quantity) === 1 ? '' : 's'}</small></td><td>${statusPill(order.status)}${order.paymentStatus !== 'success' ? `<small>${esc(order.paymentStatus || 'Payment not confirmed')}</small>` : ''}</td><td>${esc(shortDate(order.createdAt))}</td></tr>`);
  target.innerHTML = table(['Order', 'Customer', 'Product subtotal', 'Status', 'Placed'], rows, 760);
  bindOrderRowClicks(target);
}

function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function expectedDateFallback(order) {
  if (order.expectedDeliveryDate) return order.expectedDeliveryDate;
  const date = new Date(order.createdAt || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + Math.max(1, Number(dashboardData?.settings?.estimatedDeliveryDays || 3)));
  const days = new Set((dashboardData?.settings?.dispatchDays || [1, 2, 3, 4, 5, 6]).map(Number));
  for (let i = 0; i < 7 && !days.has(date.getDay()); i++) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function bindOrderRowClicks(target) {
  target.querySelectorAll('[data-open-order]').forEach(row => {
    if (row.dataset.orderClickBound === 'yes') return;
    row.dataset.orderClickBound = 'yes';
    row.addEventListener('click', event => {
      if (event.target.closest('button,select,a,input,textarea,label')) return;
      openOrderDrawer(row.dataset.openOrder);
    });
    row.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === row) {
        event.preventDefault();
        openOrderDrawer(row.dataset.openOrder);
      }
    });
  });
}

function closeOrderDrawer() {
  const drawer = document.querySelector('[data-admin-order-drawer]');
  const backdrop = document.querySelector('[data-admin-order-backdrop]');
  if (drawer) { drawer.hidden = true; drawer.setAttribute('aria-hidden', 'true'); drawer.innerHTML = ''; }
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('has-admin-order-drawer');
}

function openOrderDrawer(orderNumber) {
  const order = (dashboardData?.orders || []).find(item => item.orderNumber === orderNumber);
  const drawer = document.querySelector('[data-admin-order-drawer]');
  const backdrop = document.querySelector('[data-admin-order-backdrop]');
  if (!order || !drawer || !backdrop) return;
  closeMobileSidebar();
  const paid = order.paymentStatus === 'success';
  const quantity = Number(order.quantity || 1);
  const unitPrice = Number(order.unitPrice || (Number(order.total || 0) / quantity));
  const processingFee = Number(order.processingFee ?? (Math.round(Number(order.total || 0) * 0.0295 * 100) / 100));
  const statusOptions = ['preparing','ready','dispatched','delivered','cancelled'].map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status[0].toUpperCase() + status.slice(1)}</option>`).join('');
  const address = [order.address, order.city, order.region, order.postalCode, order.country].filter(Boolean).join(', ');
  const deliveredDate = order.deliveredAt || (order.history || []).find(item => item.status === 'delivered')?.at;
  const mobileDrawer = window.matchMedia('(max-width: 760px)').matches;
  const detailsReadOnly = mobileDrawer ? 'readonly aria-readonly="true"' : '';
  const detailsSelectDisabled = mobileDrawer ? 'disabled aria-disabled="true"' : '';
  drawer.innerHTML = `
    <header class="admin-order-drawer-head"><div><span class="admin-drawer-eyebrow">ORDER FILE · ${esc(shortDate(order.createdAt))}</span><h2>${esc(order.orderNumber)}</h2><p>${esc(order.name || 'Customer')} <span>·</span> ${esc(order.mode || 'retail')} order</p></div><button type="button" data-close-order-drawer aria-label="Close order details"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="admin-order-drawer-body">
      <div class="admin-order-status-card"><div><span>Current status</span><strong>${statusPill(order.status)}</strong></div><div><span>Payment</span><strong class="admin-payment-state ${paid ? 'is-paid' : ''}"><i class="fa-solid ${paid ? 'fa-circle-check' : 'fa-clock'}"></i> ${esc(paid ? 'Verified' : order.paymentStatus || 'Pending')}</strong></div></div>
      ${mobileDrawer ? '<p class="admin-mobile-order-note"><i class="fa-solid fa-mobile-screen-button"></i> Order details are view-only on mobile. You can update the order status below.</p>' : ''}
      <form data-order-edit-form><input type="hidden" name="orderNumber" value="${esc(order.orderNumber)}">
      <section class="admin-drawer-section"><div class="admin-drawer-section-heading"><span class="admin-drawer-section-icon"><i class="fa-solid fa-user"></i></span><div><h3>Customer details</h3><p>Contact information provided at checkout</p></div></div>
        <div class="admin-drawer-fields"><label class="field"><span>Full name</span><input name="name" value="${esc(order.name || '')}" required minlength="2" maxlength="90" ${detailsReadOnly}></label><label class="field"><span>Email address</span><input name="email" type="email" value="${esc(order.email || '')}" required maxlength="160" ${detailsReadOnly}></label><label class="field"><span>Phone number</span><input name="phone" type="tel" value="${esc(order.phone || '')}" required minlength="7" maxlength="25" ${detailsReadOnly}></label><label class="field"><span>Country</span><input name="country" value="${esc(order.country || 'Ghana')}" required maxlength="100" ${detailsReadOnly}></label></div>
      </section>
      <section class="admin-drawer-section"><div class="admin-drawer-section-heading"><span class="admin-drawer-section-icon"><i class="fa-solid fa-location-dot"></i></span><div><h3>Delivery address</h3><p>${mobileDrawer ? 'Shipping details are view-only on mobile' : 'Editable shipping details'}</p></div></div>
        <div class="admin-drawer-fields"><label class="field field-full"><span>Street address</span><textarea name="address" rows="2" required minlength="5" maxlength="500" ${detailsReadOnly}>${esc(order.address || '')}</textarea></label><label class="field"><span>City / town</span><input name="city" value="${esc(order.city || '')}" required maxlength="100" ${detailsReadOnly}></label><label class="field"><span>Region / state</span><input name="region" value="${esc(order.region || '')}" required maxlength="100" ${detailsReadOnly}></label><label class="field"><span>Country code</span><input name="countryCode" value="${esc(order.countryCode || 'GH')}" required maxlength="2" minlength="2" pattern="[A-Za-z]{2}" ${detailsReadOnly}></label><label class="field"><span>Postal code</span><input name="postalCode" value="${esc(order.postalCode || '')}" maxlength="30" ${String(order.countryCode || 'GH').toUpperCase() === 'GH' ? '' : 'required'} ${detailsReadOnly}></label></div>
      </section>
      <section class="admin-drawer-section"><div class="admin-drawer-section-heading"><span class="admin-drawer-section-icon"><i class="fa-solid fa-box-open"></i></span><div><h3>Purchased item</h3><p>Product details and the product subtotal</p></div></div>
        <div class="admin-drawer-fields"><label class="field field-full"><span>Product name</span><input name="productName" value="${esc(order.productName || 'Hair Confidante Hair Oil')}" required maxlength="100" ${detailsReadOnly}></label><label class="field"><span>Order type</span><select name="mode" ${detailsSelectDisabled}><option value="retail" ${order.mode === 'retail' ? 'selected' : ''}>Retail</option><option value="wholesale" ${order.mode === 'wholesale' ? 'selected' : ''}>Wholesale</option></select></label><label class="field"><span>Quantity (bottles)</span><input name="quantity" type="number" min="1" max="1000" step="1" value="${quantity}" required ${detailsReadOnly}></label><label class="field"><span>Unit price (GH₵)</span><input name="unitPrice" type="number" min="0.01" max="100000" step="0.01" value="${unitPrice.toFixed(2)}" required ${detailsReadOnly}></label><label class="field"><span>Expected delivery date</span><input name="expectedDeliveryDate" type="date" value="${dateInputValue(expectedDateFallback(order))}" ${detailsReadOnly}></label></div>
        <div class="admin-drawer-totals"><div><span>Product subtotal</span><strong data-order-edit-subtotal>${gh(order.total)}</strong></div><div><span>Processing fee <small>Listed separately</small></span><strong data-order-edit-fee>${gh(processingFee)}</strong></div><div class="admin-drawer-total"><span>Customer charge record</span><strong data-order-edit-charged>${gh(order.chargeTotal ?? (Number(order.total || 0) + processingFee))}</strong></div></div>
      </section>
      <section class="admin-drawer-section"><div class="admin-drawer-section-heading"><span class="admin-drawer-section-icon"><i class="fa-solid fa-message"></i></span><div><h3>Customer note</h3><p>Message the customer entered during checkout</p></div></div><label class="field"><span>Note / special instructions</span><textarea name="note" rows="3" maxlength="500" placeholder="No note provided" ${detailsReadOnly}>${esc(order.note || '')}</textarea></label></section>
      ${paid ? `<section class="admin-drawer-section admin-status-edit"><div class="admin-drawer-section-heading"><span class="admin-drawer-section-icon"><i class="fa-solid fa-truck-fast"></i></span><div><h3>Fulfilment</h3><p>Changing status sends the appropriate customer email</p></div></div><label class="field"><span>Order status</span><select name="status">${statusOptions}</select></label>${order.status === 'delivered' && deliveredDate ? `<p class="admin-delivered-date"><i class="fa-solid fa-circle-check"></i> Delivered on ${esc(dateText(deliveredDate))}</p>` : ''}</section>` : `<div class="admin-drawer-payment-note"><i class="fa-solid fa-lock"></i> Order fulfilment becomes available once payment is verified.</div>`}
      <div class="admin-drawer-footer"><button type="button" class="button button-outline" data-close-order-drawer>Close</button>${mobileDrawer ? (paid ? '<button type="submit" class="button button-dark"><span>Save status</span><i class="fa-solid fa-check"></i></button>' : '') : '<button type="submit" class="button button-dark"><span>Save order changes</span><i class="fa-solid fa-floppy-disk"></i></button>'}</div>
      </form>
    </div>`;
  drawer.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.hidden = false;
  document.body.classList.add('has-admin-order-drawer');
  drawer.querySelectorAll('[data-close-order-drawer]').forEach(button => button.addEventListener('click', closeOrderDrawer));
  if (!mobileDrawer) drawer.querySelector('[data-order-edit-form]')?.addEventListener('input', () => updateDrawerMoney(drawer));
  drawer.querySelector('[data-order-edit-form]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    if (mobileDrawer) {
      if (!paid || !form.elements.status) { bannerMessage('This order is not ready for a status update.', 'error'); return; }
      const nextStatus = form.elements.status.value;
      if (nextStatus === order.status) { bannerMessage('No status change to save.'); closeOrderDrawer(); return; }
      try {
        await loadingButton(button, async () => {
          const result = await api({ action: 'update-order-status', orderNumber: order.orderNumber, status: nextStatus });
          bannerMessage(result.message);
          closeOrderDrawer();
          await loadDashboard(false);
        }, 'Saving status');
      } catch (error) { bannerMessage(error.message, 'error'); }
      return;
    }
    const values = Object.fromEntries(new FormData(form).entries());
    const nextStatus = paid ? values.status : order.status;
    delete values.status;
    try {
      await loadingButton(button, async () => {
        const result = await api({ action: 'update-order-details', ...values });
        if (paid && nextStatus !== order.status) {
          const statusResult = await api({ action: 'update-order-status', orderNumber: order.orderNumber, status: nextStatus });
          bannerMessage(`${result.message} ${statusResult.message}`);
        } else bannerMessage(result.message);
        closeOrderDrawer();
        await loadDashboard(false);
      }, 'Saving changes');
    } catch (error) { bannerMessage(error.message, 'error'); }
  });
  if (mobileDrawer) drawer.querySelector('[data-close-order-drawer]')?.focus({ preventScroll: true });
  else drawer.querySelector('input[name="name"]')?.focus({ preventScroll: true });
}

function updateDrawerMoney(drawer) {
  const form = drawer.querySelector('[data-order-edit-form]');
  if (!form) return;
  const quantity = Number(form.elements.quantity?.value || 0);
  const price = Number(form.elements.unitPrice?.value || 0);
  const subtotal = Math.round(quantity * price * 100) / 100;
  const fee = Math.round(subtotal * 0.0295 * 100) / 100;
  const money = value => gh(value);
  const subtotalNode = drawer.querySelector('[data-order-edit-subtotal]');
  const feeNode = drawer.querySelector('[data-order-edit-fee]');
  const chargedNode = drawer.querySelector('[data-order-edit-charged]');
  if (subtotalNode) subtotalNode.textContent = money(subtotal);
  if (feeNode) feeNode.textContent = money(fee);
  if (chargedNode) chargedNode.textContent = money(subtotal + fee);
}

function closeMobileSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  const backdrop = document.querySelector('[data-admin-sidebar-backdrop]');
  const toggle = document.querySelector('[data-admin-mobile-toggle]');
  sidebar?.classList.remove('is-open');
  backdrop?.classList.remove('is-open');
  toggle?.setAttribute('aria-expanded', 'false');
}

function toggleMobileSidebar(force) {
  const sidebar = document.querySelector('.admin-sidebar');
  const backdrop = document.querySelector('[data-admin-sidebar-backdrop]');
  const toggle = document.querySelector('[data-admin-mobile-toggle]');
  const open = force ?? !sidebar?.classList.contains('is-open');
  sidebar?.classList.toggle('is-open', open);
  backdrop?.classList.toggle('is-open', open);
  toggle?.setAttribute('aria-expanded', String(open));
}

function fillProductForm() {
  const form = document.querySelector('[data-product-settings-form]');
  if (!form || !dashboardData?.settings) return;
  const settings = dashboardData.settings;
  for (const key of ['productName','productDescription','retailPrice','wholesalePrice','wholesaleMinQty','inventory','productImageUrl']) {
    if (form.elements[key]) form.elements[key].value = settings[key] ?? '';
  }
}

function fillAccountForm() {
  const form = document.querySelector('[data-admin-account-form]');
  const currentEmail = form?.elements.currentEmail;
  if (currentEmail) currentEmail.value = currentUser?.email || dashboardData?.admin?.email || '';
}

function fillDeliveryForm() {
  const form = document.querySelector('[data-delivery-settings-form]');
  const settings = dashboardData?.settings;
  if (!form || !settings) return;
  if (form.elements.estimatedDeliveryDays) form.elements.estimatedDeliveryDays.value = String(settings.estimatedDeliveryDays || 3);
  const days = Array.isArray(settings.dispatchDays) ? settings.dispatchDays.map(Number) : [1, 2, 3, 4, 5, 6];
  form.querySelectorAll('[data-admin-dispatch-day]').forEach(input => { input.checked = days.includes(Number(input.value)); });
}

function renderReviews() {
  const target = document.querySelector('[data-reviews-table]');
  if (!target) return;
  const filter = document.querySelector('[data-review-filter]')?.value || 'pending';
  const reviews = (dashboardData?.reviews || []).filter(review => {
    if (filter === 'pending') return review.published !== true && review.moderationStatus !== 'hidden';
    if (filter === 'published') return review.published === true;
    if (filter === 'hidden') return review.moderationStatus === 'hidden' || (review.published !== true && review.moderationStatus !== 'pending');
    return true;
  });
  const rows = reviews.map(review => {
    const stars = `${'★'.repeat(Number(review.rating || 0))}${'☆'.repeat(5 - Number(review.rating || 0))}`;
    return `<tr><td><strong>${esc(review.name)}</strong><small>${esc(review.email || '')}</small><small>${esc(shortDate(review.createdAt))}</small></td><td><span class="admin-review-stars">${stars}</span><div class="admin-review-preview">${esc(review.review)}</div></td><td>${statusPill(review.published ? 'published' : (review.moderationStatus || 'pending'))}</td><td><div class="table-actions">${review.published ? `<button class="table-action" type="button" data-review-toggle="${esc(review.id)}" data-publish="false">Hide</button>` : `<button class="table-action" type="button" data-review-toggle="${esc(review.id)}" data-publish="true">Publish</button>`}<button class="table-action is-danger" type="button" data-review-delete="${esc(review.id)}">Delete</button></div></td></tr>`;
  });
  target.innerHTML = table(['Customer', 'Review', 'Status', 'Actions'], rows, 820);
  target.querySelectorAll('[data-review-toggle]').forEach(button => button.addEventListener('click', () => runAction(button, async () => {
    const published = button.dataset.publish === 'true';
    const result = await api({ action: 'review-status', id: button.dataset.reviewToggle, published });
    bannerMessage(result.message); await loadDashboard(false);
  }, published ? 'Publishing' : 'Hiding')));
  target.querySelectorAll('[data-review-delete]').forEach(button => button.addEventListener('click', () => {
    if (!window.confirm('Delete this review permanently?')) return;
    runAction(button, async () => { const result = await api({ action: 'delete-review', id: button.dataset.reviewDelete }); bannerMessage(result.message); await loadDashboard(false); }, 'Deleting');
  }));
}

function renderMessages() {
  const target = document.querySelector('[data-messages-table]');
  if (!target) return;
  const filter = document.querySelector('[data-message-filter]')?.value || 'unread';
  const messages = (dashboardData?.messages || []).filter(message => filter === 'all' || message.status === filter || (filter === 'unread' && !['read','archived'].includes(message.status)));
  const rows = messages.map(message => `<tr><td><strong>${esc(message.name)}</strong><small>${esc(message.email)}</small><small>${esc(message.phone || 'No phone number')}</small></td><td><div class="admin-message-preview" style="white-space:normal">${esc(message.message)}</div><small>${esc(dateText(message.createdAt))}</small></td><td>${statusPill(message.status || 'unread')}</td><td><div class="table-actions"><button class="table-action" type="button" data-reply-message="${esc(message.id)}">Reply</button>${message.status === 'read' ? `<button class="table-action" type="button" data-message-state="${esc(message.id)}" data-state="archived">Archive</button>` : `<button class="table-action" type="button" data-message-state="${esc(message.id)}" data-state="read">Mark read</button>`}<button class="table-action is-danger" type="button" data-message-delete="${esc(message.id)}">Delete</button></div></td></tr>`);
  target.innerHTML = table(['From', 'Message', 'Status', 'Actions'], rows, 880);
  target.querySelectorAll('[data-message-state]').forEach(button => button.addEventListener('click', () => runAction(button, async () => { const result = await api({ action: 'message-status', id: button.dataset.messageState, status: button.dataset.state }); bannerMessage(result.message); await loadDashboard(false); }, 'Saving')));
  target.querySelectorAll('[data-message-delete]').forEach(button => button.addEventListener('click', () => { if (!window.confirm('Delete this message permanently?')) return; runAction(button, async () => { const result = await api({ action: 'delete-message', id: button.dataset.messageDelete }); bannerMessage(result.message); await loadDashboard(false); }, 'Deleting'); }));
  target.querySelectorAll('[data-reply-message]').forEach(button => button.addEventListener('click', () => {
    const message = (dashboardData?.messages || []).find(row => row.id === button.dataset.replyMessage);
    setSection('email');
    const form = document.querySelector('[data-admin-email-form]');
    if (form && message) { form.elements.to.value = message.email || ''; form.elements.subject.value = `Re: Your message to Hair Confidante`; form.elements.intro.value = `Hi ${message.name || 'there'},`; form.elements.message.focus(); }
  }));
}

function renderSubscribers() {
  const target = document.querySelector('[data-subscribers-table]');
  if (!target) return;
  const subscribers = dashboardData?.subscribers || [];
  const rows = subscribers.map(subscriber => `<tr><td><strong>${esc(subscriber.email)}</strong><small>${esc(subscriber.name || 'No name provided')}</small></td><td>${statusPill(subscriber.status || 'subscribed')}</td><td>${esc(dateText(subscriber.subscribedAt))}</td><td><button type="button" class="table-action" data-sub-status="${esc(subscriber.id)}" data-state="${subscriber.status === 'subscribed' ? 'unsubscribed' : 'subscribed'}">${subscriber.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}</button></td></tr>`);
  target.innerHTML = table(['Email', 'Status', 'Joined', 'Actions'], rows, 690);
  target.querySelectorAll('[data-sub-status]').forEach(button => button.addEventListener('click', () => runAction(button, async () => { const result = await api({ action: 'subscriber-status', id: button.dataset.subStatus, status: button.dataset.state }); bannerMessage(result.message); await loadDashboard(false); }, 'Updating')));
}

function renderPurchases() {
  const target = document.querySelector('[data-purchases-table]');
  if (!target) return;
  const purchases = dashboardData?.purchases || [];
  const rows = purchases.map(order => `<tr><td><strong>${esc(order.orderNumber)}</strong><small>${esc(dateText(order.paidAt || order.createdAt))}</small></td><td><strong>${esc(order.name)}</strong><small>${esc(order.email)}</small><small>${esc([order.city, order.region, order.country].filter(Boolean).join(', '))}</small></td><td><strong>${esc(order.productName)}</strong><small>${Number(order.quantity)} bottle${Number(order.quantity) === 1 ? '' : 's'} · ${esc(order.mode)}</small></td><td><strong>${gh(order.total)}</strong><small>${esc(order.paymentChannel || 'Paystack')}</small></td><td>${statusPill(order.status)}<div style="margin-top:7px"><button type="button" class="table-action" data-admin-receipt="${esc(order.orderNumber)}"><i class="fa-solid fa-download"></i> Receipt</button></div></td></tr>`);
  target.innerHTML = table(['Order', 'Customer', 'Items', 'Product subtotal', 'Fulfilment & receipt'], rows, 900);
  target.querySelectorAll('[data-admin-receipt]').forEach(button => button.addEventListener('click', () => {
    const order = purchases.find(item => item.orderNumber === button.dataset.adminReceipt);
    if (!order) return;
    const address = [order.address, order.city, order.region, order.postalCode, order.country].filter(Boolean).join(', ');
    const qty = Number(order.quantity || 1);
    const unitPrice = Number(order.unitPrice || (Number(order.total || 0) / qty));
    const paidDate = dateText(order.paidAt || order.createdAt);
    const receipt = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hair Confidante receipt ${esc(order.orderNumber)}</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#f2ede5;color:#33212a;font:14px/1.55 Arial,sans-serif}.sheet{max-width:760px;margin:auto;padding:32px;background:#fffdf8;border:1px solid #e4dbd1}.head{display:flex;align-items:center;gap:12px;padding-bottom:18px;border-bottom:1px solid #e4dbd1}.mark{display:grid;place-items:center;width:42px;height:42px;border:1px solid #b98167;border-radius:50%;font-family:Georgia,serif}.head small,.muted{display:block;color:#857a7d;font-size:10px}.paid{margin-left:auto;color:#516c43;font-size:11px;font-weight:bold;letter-spacing:.12em}.intro{padding:24px 0}.intro h1{margin:0 0 6px;font:32px Georgia,serif}.meta{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:15px 0;border-block:1px solid #e4dbd1}.meta strong,.meta span{display:block;overflow-wrap:anywhere;font-size:11px}.label{display:block;margin-bottom:5px;color:#857a7d;font-size:9px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase}.line{display:flex;justify-content:space-between;gap:18px;padding:14px 0;border-bottom:1px solid #e4dbd1;font-size:12px}.total{display:flex;justify-content:space-between;padding:18px 0;font-weight:bold;border-bottom:2px solid #33212a}.note{color:#62565d;font-size:11px;line-height:1.7}@media(max-width:560px){body{padding:8px}.sheet{padding:18px}.meta{grid-template-columns:1fr}}</style></head><body><main class="sheet"><header class="head"><span class="mark">HC</span><div><strong>HAIR CONFIDANTE</strong><small>by MB · PAYMENT RECEIPT</small></div><span class="paid">PAID</span></header><section class="intro"><span class="label">Order confirmed</span><h1>Payment receipt</h1><span class="muted">Reference: ${esc(order.paymentReference || '')}</span></section><section class="meta"><div><span class="label">Order number</span><strong>${esc(order.orderNumber)}</strong><span class="muted">Paid on ${esc(paidDate)}</span></div><div><span class="label">Customer</span><strong>${esc(order.name || '')}</strong><span>${esc(order.email || '')}</span><span>${esc(order.phone || '')}</span></div><div><span class="label">Delivery address</span><strong>${esc(address || 'Provided at checkout')}</strong></div><div><span class="label">Payment method</span><strong>${esc(order.paymentChannel || 'Paystack')}</strong></div></section><div class="line"><span><strong>${esc(order.productName || 'Hair Confidante Hair Oil')}</strong><span class="muted">${esc(order.mode || 'retail')} · ${qty} bottle${qty === 1 ? '' : 's'} × ${gh(unitPrice)}</span></span><strong>${gh(unitPrice * qty)}</strong></div><div class="line"><span>Product subtotal</span><strong>${gh(order.total)}</strong></div><div class="line"><span>Processing fee</span><strong>${gh(order.processingFee || 0)}</strong></div><div class="line"><span>Delivery fee</span><strong>Not included</strong></div><div class="total"><span>Total paid</span><strong>${gh(order.amountPaid ?? order.chargeTotal ?? (Number(order.total || 0) + Number(order.processingFee || 0)))}</strong></div><p class="note">The delivery fee will be estimated and communicated separately after checkout.</p><p class="muted">Currency: GHS · Keep this receipt for your records.</p></main></body></html>`;
    const url = URL.createObjectURL(new Blob([receipt], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `Hair-Confidante-Receipt-${String(order.orderNumber || 'order').replace(/[^a-z0-9-]/gi, '-')}.html`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }));
}

function renderEmailHistory() {
  const target = document.querySelector('[data-email-history]');
  if (!target) return;
  const campaigns = dashboardData?.emailCampaigns || [];
  if (!campaigns.length) { target.innerHTML = emptyTable('No custom campaigns have been sent yet.'); return; }
  target.innerHTML = `<div style="display:grid;gap:0">${campaigns.slice(0, 8).map(campaign => `<div style="padding:13px 0;border-bottom:1px solid var(--line)"><strong style="display:block;font-size:11px">${esc(campaign.subject)}</strong><small style="display:block;margin-top:4px;color:var(--ink-faint);font-size:9px">${esc(dateText(campaign.createdAt))} · ${Number(campaign.sent || 0)} sent · ${Number(campaign.failed || 0)} failed</small><p style="margin:6px 0 0;color:var(--ink-soft);font-size:10px">${campaign.toSubscribers ? 'Active subscribers' : `${Number(campaign.recipientCount || 1)} recipient`}</p></div>`).join('')}</div>`;
}

async function runAction(button, task, label) {
  try { await loadingButton(button, task, label); }
  catch (error) { bannerMessage(error.message, 'error'); }
}

function loadDashboard(showNotice = true) {
  if (dashboardTask) return dashboardTask;
  const refresh = document.querySelector('[data-admin-refresh]');
  dashboardTask = (async () => {
    try {
      const data = await api({ action: 'dashboard' });
      dashboardData = data;
      showApp();
      const account = document.querySelector('[data-admin-email]');
      if (account) account.textContent = data.admin?.email || currentUser?.email || 'Admin account';
      renderMetrics(); renderOrders(); fillProductForm(); fillDeliveryForm(); renderReviews(); renderMessages(); renderSubscribers(); renderPurchases(); renderEmailHistory(); fillAccountForm();
      if (showNotice) bannerMessage('Workspace is up to date.');
      return data;
    } catch (error) {
      if (/admin access|sign in|expired/i.test(error.message)) {
        bannerMessage(error.message, 'error');
        showLogin();
      } else bannerMessage(error.message, 'error');
      return null;
    } finally {
      if (refresh) refresh.disabled = false;
      dashboardTask = null;
    }
  })();
  return dashboardTask;
}

async function submitLogin(event) {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  loginError.hidden = true;
  const button = loginForm.querySelector('button[type="submit"]');
  if (!config.apiKey || String(config.apiKey).includes('REPLACE') || !config.projectId || String(config.projectId).includes('REPLACE')) {
    loginError.textContent = 'Add your Firebase web configuration to firebase-config.js before signing in.';
    loginError.hidden = false; return;
  }
  const form = new FormData(loginForm);
  try {
    await loadingButton(button, async () => {
      const credential = await signInWithEmailAndPassword(auth, String(form.get('email')).trim(), String(form.get('password')));
      currentUser = credential.user;
      await loadDashboard(false);
      if (!dashboardData) throw new Error('This account could not access the admin workspace. Check ADMIN_EMAILS in Netlify.');
      loginForm.reset(); bannerMessage('You are signed in.');
    }, 'Checking credentials');
  } catch (error) {
    try { if (auth.currentUser) await signOut(auth); } catch { /* no action */ }
    currentUser = null;
    loginError.textContent = error.message || 'We could not sign you in.'; loginError.hidden = false;
  }
}

function bindNavigation() {
  document.querySelectorAll('[data-admin-nav]').forEach(button => button.addEventListener('click', () => setSection(button.dataset.adminNav)));
  document.querySelector('[data-admin-mobile-toggle]')?.addEventListener('click', () => toggleMobileSidebar());
  document.querySelector('[data-admin-sidebar-backdrop]')?.addEventListener('click', closeMobileSidebar);
  document.querySelector('[data-admin-order-backdrop]')?.addEventListener('click', closeOrderDrawer);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMobileSidebar(); closeOrderDrawer(); } });
  document.querySelectorAll('[data-admin-go]').forEach(button => button.addEventListener('click', () => setSection(button.dataset.adminGo)));
  document.querySelector('[data-admin-refresh]')?.addEventListener('click', async event => runAction(event.currentTarget, () => loadDashboard(false), 'Refreshing'));
  document.querySelector('[data-order-search]')?.addEventListener('input', renderOrders);
  document.querySelector('[data-order-filter]')?.addEventListener('change', renderOrders);
  document.querySelector('[data-review-filter]')?.addEventListener('change', renderReviews);
  document.querySelector('[data-message-filter]')?.addEventListener('change', renderMessages);
  document.querySelector('[data-admin-signout]')?.addEventListener('click', async event => {
    try { await loadingButton(event.currentTarget, () => signOut(auth), 'Signing out'); }
    finally { currentUser = null; dashboardData = null; showLogin(); }
  });
}

function bindForms() {
  const productForm = document.querySelector('[data-product-settings-form]');
  productForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!productForm.reportValidity()) return;
    const button = productForm.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(productForm).entries());
    runAction(button, async () => { const result = await api({ action: 'update-settings', ...values }); bannerMessage(result.message); await loadDashboard(false); }, 'Saving product');
  });
  const deliveryForm = document.querySelector('[data-delivery-settings-form]');
  deliveryForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!deliveryForm.reportValidity()) return;
    const days = [...deliveryForm.querySelectorAll('[data-admin-dispatch-day]:checked')].map(input => Number(input.value));
    if (!days.length) { bannerMessage('Select at least one delivery day.', 'error'); return; }
    const button = deliveryForm.querySelector('button[type="submit"]');
    runAction(button, async () => { const result = await api({ action: 'update-delivery-settings', dispatchDays: days, estimatedDeliveryDays: deliveryForm.elements.estimatedDeliveryDays.value }); bannerMessage(result.message); await loadDashboard(false); }, 'Saving delivery settings');
  });
  const accountForm = document.querySelector('[data-admin-account-form]');
  accountForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!accountForm.reportValidity() || !currentUser) return;
    const currentPassword = String(accountForm.elements.currentPassword.value || '');
    const newEmail = String(accountForm.elements.newEmail.value || '').trim();
    const newPassword = String(accountForm.elements.newPassword.value || '');
    const confirmPassword = String(accountForm.elements.confirmPassword.value || '');
    if (!newEmail && !newPassword) { bannerMessage('Enter a new email address or password to make a change.', 'error'); return; }
    if (newEmail && newEmail.toLowerCase() === String(currentUser.email || '').toLowerCase() && !newPassword) { bannerMessage('Your new email is the same as your current email.', 'error'); return; }
    if (newPassword && newPassword !== confirmPassword) { bannerMessage('The new password and confirmation do not match.', 'error'); accountForm.elements.confirmPassword.focus(); return; }
    if (newPassword && newPassword.length < 6) { bannerMessage('Use at least 6 characters for the new password.', 'error'); return; }
    const button = accountForm.querySelector('button[type="submit"]');
    runAction(button, async () => {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      if (newEmail && newEmail.toLowerCase() !== String(currentUser.email || '').toLowerCase()) await updateEmail(currentUser, newEmail);
      if (newPassword) await updatePassword(currentUser, newPassword);
      await currentUser.getIdToken(true);
      accountForm.reset();
      fillAccountForm();
      const account = document.querySelector('[data-admin-email]');
      if (account) account.textContent = currentUser.email || 'Admin account';
      bannerMessage('Your admin account settings have been updated.');
      await loadDashboard(false);
    }, 'Updating account');
  });
  
  const emailForm = document.querySelector('[data-admin-email-form]');
  emailForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!emailForm.reportValidity()) return;
    const values = Object.fromEntries(new FormData(emailForm).entries());
    values.toSubscribers = emailForm.elements.toSubscribers.checked;
    if (values.toSubscribers && !window.confirm('Send this email to every active subscriber?')) return;
    if (!values.toSubscribers && !values.to) { bannerMessage('Add a recipient email or select all active subscribers.', 'error'); return; }
    const button = emailForm.querySelector('button[type="submit"]');
    runAction(button, async () => { const result = await api({ action: 'send-email', ...values }); bannerMessage(result.message); emailForm.reset(); await loadDashboard(false); }, 'Sending emails');
  });
}

function init() {
  if (loginForm) loginForm.addEventListener('submit', submitLogin);
  bindNavigation(); bindForms();
  try {
    if (!config.apiKey || String(config.apiKey).includes('REPLACE')) { showLogin(); return; }
    const app = initializeApp(config);
    auth = getAuth(app);
    onAuthStateChanged(auth, async user => {
      currentUser = user;
      if (!user) { showLogin(); return; }
      showApp();
      await loadDashboard(false);
    });
  } catch (error) {
    if (loginError) { loginError.textContent = error.message || 'Firebase could not be initialised.'; loginError.hidden = false; }
    showLogin();
  }
}

init();
