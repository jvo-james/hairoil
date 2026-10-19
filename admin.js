import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const config = window.HC_FIREBASE_CONFIG || {};
const loginScreen = document.querySelector('[data-admin-login-screen]');
const appScreen = document.querySelector('[data-admin-app]');
const loginForm = document.querySelector('[data-admin-login]');
const loginError = document.querySelector('[data-admin-login-error]');
const banner = document.querySelector('[data-admin-banner]');
const adminLoading = document.querySelector('[data-admin-loading]');
const adminLoadingTitle = document.querySelector('[data-admin-loading-title]');
let loadedSections = new Set();
const sectionTasks = new Map();
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

function showAdminLoader(message = 'Preparing your workspace') {
  if (adminLoadingTitle) adminLoadingTitle.textContent = message;
  if (adminLoading) { adminLoading.hidden = false; adminLoading.setAttribute('aria-hidden', 'false'); }
  document.body.classList.add('admin-data-loading');
}
function hideAdminLoader() {
  if (adminLoading) { adminLoading.hidden = true; adminLoading.setAttribute('aria-hidden', 'true'); }
  document.body.classList.remove('admin-data-loading');
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
  if (['reviews', 'messages', 'subscribers', 'email'].includes(section)) void ensureSectionData(section);
  if (section === 'purchases') renderPurchases();
  if (section === 'settings') fillAccountForm();
  closeMobileSidebar();
  const main = document.querySelector('.admin-main');
  if (main && window.matchMedia('(max-width: 760px)').matches) main.scrollTo({ top: 0, behavior: 'smooth' });
}

async function ensureSectionData(section) {
  const config = {
    reviews: { key: 'reviews', target: '[data-reviews-table]', render: renderReviews, label: 'reviews' },
    messages: { key: 'messages', target: '[data-messages-table]', render: renderMessages, label: 'messages' },
    subscribers: { key: 'subscribers', target: '[data-subscribers-table]', render: renderSubscribers, label: 'subscribers' },
    email: { key: 'emailCampaigns', target: '[data-email-history]', render: renderEmailHistory, label: 'email activity' }
  }[section];
  if (!config || loadedSections.has(section) || !dashboardData) return;
  if (sectionTasks.has(section)) return sectionTasks.get(section);
  const target = document.querySelector(config.target);
  if (target) target.innerHTML = '<div class="admin-loading-inline">Loading ' + esc(config.label) + '</div>';
  const task = (async () => {
    try {
      const result = await api({ action: 'section-data', section });
      if (!currentUser || !dashboardData) return;
      const incomingItems = Array.isArray(result.items) ? result.items : [];
      // Preserve a just-created campaign if its list request began before sending completed.
      if (section === 'email') {
        const currentItems = dashboardData.emailCampaigns || [];
        const seen = new Set(currentItems.map(item => item.id || `${item.subject}|${item.createdAt}`));
        dashboardData.emailCampaigns = [...currentItems, ...incomingItems.filter(item => !seen.has(item.id || `${item.subject}|${item.createdAt}`))]
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 8);
      } else dashboardData[config.key] = incomingItems;
      loadedSections.add(section);
      config.render();
    } catch (error) {
      if (target) target.innerHTML = emptyTable('This section could not be loaded. Please try again.');
      bannerMessage(error.message || 'This section could not be loaded.', 'error');
    } finally {
      if (sectionTasks.get(section) === task) sectionTasks.delete(section);
    }
  })();
  sectionTasks.set(section, task);
  return task;
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
  const quantity = Math.max(1, Number(order.quantity || 1));
  const productSubtotal = Number(order.total || 0);
  const unitPrice = Number(order.unitPrice ?? (productSubtotal / quantity));
  const processingFee = Number(order.processingFee ?? (Math.round(productSubtotal * 0.0295 * 100) / 100));
  const checkoutTotal = Number(order.chargeTotal ?? (productSubtotal + processingFee));
  const orderType = String(order.mode || 'retail').toLowerCase() === 'wholesale' ? 'Wholesale' : 'Retail';
  const statusLabels = {
    awaiting_payment: 'Awaiting payment', preparing: 'Preparing', ready: 'Ready',
    dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled'
  };
  const orderStatus = String(order.status || 'awaiting_payment');
  const safeStatusClass = orderStatus.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const orderStatusLabel = statusLabels[orderStatus] || orderStatus.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const statusOptionsList = ['preparing', 'ready', 'dispatched', 'delivered', 'cancelled'];
  if (orderStatus && !statusOptionsList.includes(orderStatus)) statusOptionsList.unshift(orderStatus);
  const statusOptions = statusOptionsList.map(status => {
    const label = statusLabels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
    return `<option value="${esc(status)}" ${orderStatus === status ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');

  const deliveredAt = order.deliveredAt || (order.history || []).find(item => item.status === 'delivered')?.at;
  const cancelledAt = (order.history || []).find(item => item.status === 'cancelled')?.at;
  const deliveryLabel = orderStatus === 'delivered' ? 'Delivered on' : orderStatus === 'cancelled' ? 'Cancelled' : 'Expected delivery';
  const deliveryValue = orderStatus === 'delivered'
    ? (deliveredAt ? shortDate(deliveredAt) : 'Delivered')
    : orderStatus === 'cancelled'
      ? (cancelledAt ? shortDate(cancelledAt) : 'Order cancelled')
      : shortDate(expectedDateFallback(order));
  const paymentLabel = paid ? 'Verified' : String(order.paymentStatus || '').toLowerCase() === 'failed' ? 'Failed' : 'Pending';
  const paymentClass = paid ? 'is-paid' : paymentLabel === 'Failed' ? 'is-failed' : 'is-pending';
  const country = order.country || (String(order.countryCode || '').toUpperCase() === 'GH' ? 'Ghana' : order.countryCode) || 'Not provided';
  const addressLine = String(order.address || '').trim();
  const display = value => esc(String(value ?? '').trim() || 'Not provided');
  const note = String(order.note || '').trim();
  const statusControl = paid
    ? `<label class="admin-order-status-control"><span>New status</span><select name="status" aria-label="New order status" required>${statusOptions}</select></label><p class="admin-order-status-help"><i class="fa-regular fa-paper-plane"></i> The customer will be notified when a status update email applies.</p>`
    : `<div class="admin-order-payment-pending"><span class="admin-order-payment-pending-icon"><i class="fa-solid fa-lock"></i></span><div><strong>Payment confirmation pending</strong><p>Status updates will be available when payment is confirmed.</p></div></div>`;

  drawer.innerHTML = `
    <header class="admin-order-drawer-head admin-order-head-details">
      <div class="admin-order-head-copy">
        <span class="admin-drawer-eyebrow">ORDER DETAILS · ${esc(shortDate(order.createdAt))}</span>
        <h2>${esc(order.orderNumber || 'Order')}</h2>
        <p>Placed ${esc(shortDate(order.createdAt))} <span>·</span> ${esc(orderType)} order</p>
      </div>
      <button type="button" data-close-order-drawer aria-label="Close order details"><i class="fa-solid fa-xmark"></i></button>
    </header>
    <div class="admin-order-drawer-body">
      <form data-order-status-form class="admin-order-status-form">
        <section class="admin-order-overview" aria-label="Order overview">
          <div class="admin-order-overview-cell">
            <span class="admin-order-overview-label">Order status</span>
            <strong><span class="admin-order-status-pill is-${esc(safeStatusClass)}">${esc(orderStatusLabel)}</span></strong>
          </div>
          <div class="admin-order-overview-cell">
            <span class="admin-order-overview-label">Payment</span>
            <strong class="admin-order-payment-pill ${paymentClass}"><i class="fa-solid ${paid ? 'fa-circle-check' : paymentLabel === 'Failed' ? 'fa-circle-exclamation' : 'fa-clock'}"></i>${esc(paymentLabel)}</strong>
          </div>
          <div class="admin-order-overview-cell admin-order-overview-delivery">
            <span class="admin-order-overview-label">${esc(deliveryLabel)}</span>
            <strong>${esc(deliveryValue)}</strong>
          </div>
        </section>

        <section class="admin-order-detail-section">
          <div class="admin-order-section-heading"><span class="admin-order-section-icon"><i class="fa-solid fa-user"></i></span><div><h3>Customer</h3><p>Contact information from checkout</p></div></div>
          <div class="admin-order-detail-grid">
            <div class="admin-order-detail-card"><span class="admin-order-detail-label">Full name</span><strong>${display(order.name || 'Customer')}</strong></div>
            <div class="admin-order-detail-card"><span class="admin-order-detail-label">Email address</span><strong class="admin-order-breakable">${display(order.email)}</strong></div>
            <div class="admin-order-detail-card"><span class="admin-order-detail-label">Phone number</span><strong>${display(order.phone)}</strong></div>
          </div>
        </section>

        <section class="admin-order-detail-section">
          <div class="admin-order-section-heading"><span class="admin-order-section-icon"><i class="fa-solid fa-location-dot"></i></span><div><h3>Delivery address</h3><p>Where the order should be delivered</p></div></div>
          <div class="admin-order-address-card"><span class="admin-order-address-icon"><i class="fa-solid fa-house"></i></span><div><span class="admin-order-detail-label">Street address</span><strong>${display(addressLine)}</strong></div></div>
          <div class="admin-order-detail-grid admin-order-locality-grid">
            <div class="admin-order-detail-card"><span class="admin-order-detail-label">City / town</span><strong>${display(order.city)}</strong></div>
            <div class="admin-order-detail-card"><span class="admin-order-detail-label">Region</span><strong>${display(order.region)}</strong></div>
            ${String(order.postalCode || '').trim() ? `<div class="admin-order-detail-card"><span class="admin-order-detail-label">Postal code</span><strong>${display(order.postalCode)}</strong></div>` : ''}
            <div class="admin-order-detail-card"><span class="admin-order-detail-label">Country</span><strong>${display(country)}</strong></div>
          </div>
        </section>

        <section class="admin-order-detail-section">
          <div class="admin-order-section-heading"><span class="admin-order-section-icon"><i class="fa-solid fa-bag-shopping"></i></span><div><h3>Order summary</h3><p>Items and payment breakdown</p></div></div>
          <article class="admin-order-product-card">
            <span class="admin-order-product-icon"><i class="fa-solid fa-droplet"></i></span>
            <div class="admin-order-product-copy"><strong>${display(order.productName || 'Hair Confidante Hair Oil')}</strong><span>${quantity} bottle${quantity === 1 ? '' : 's'} · ${esc(orderType)} order</span><small>${gh(unitPrice)} per bottle</small></div>
          </article>
          <div class="admin-order-price-breakdown">
            <div class="admin-order-price-row"><span>Product subtotal</span><strong>${gh(productSubtotal)}</strong></div>
            <div class="admin-order-price-row"><span>Processing fee</span><strong>${gh(processingFee)}</strong></div>
            <div class="admin-order-price-row admin-order-price-final"><span>Customer checkout total</span><strong>${gh(checkoutTotal)}</strong></div>
          </div>
        </section>

        <section class="admin-order-detail-section admin-order-note-section">
          <div class="admin-order-section-heading"><span class="admin-order-section-icon"><i class="fa-regular fa-message"></i></span><div><h3>Customer note</h3><p>Special instructions shared at checkout</p></div></div>
          <div class="admin-order-note"><i class="fa-solid fa-quote-left"></i><p>${note ? esc(note) : 'No special instructions were added to this order.'}</p></div>
        </section>

        <section class="admin-order-detail-section admin-order-fulfilment-section">
          <div class="admin-order-section-heading"><span class="admin-order-section-icon"><i class="fa-solid fa-truck-fast"></i></span><div><h3>Fulfilment</h3><p>Keep the order progress up to date</p></div></div>
          ${orderStatus === 'delivered' && deliveredAt ? `<div class="admin-order-delivered-record"><i class="fa-solid fa-circle-check"></i><span>Delivered on <strong>${esc(shortDate(deliveredAt))}</strong></span></div>` : ''}
          ${statusControl}
        </section>

        <footer class="admin-drawer-footer admin-order-detail-footer">
          <button type="button" class="button button-outline" data-close-order-drawer>Close</button>
          ${paid ? '<button type="submit" class="button button-dark"><span>Update status</span><i class="fa-solid fa-check"></i></button>' : ''}
        </footer>
      </form>
    </div>`;

  drawer.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.hidden = false;
  document.body.classList.add('has-admin-order-drawer');
  drawer.querySelectorAll('[data-close-order-drawer]').forEach(button => button.addEventListener('click', closeOrderDrawer));
  drawer.querySelector('[data-order-status-form]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!paid || !form.elements.status) {
      bannerMessage('Order status updates are available after payment is confirmed.', 'error');
      return;
    }
    if (!form.reportValidity()) return;
    const nextStatus = form.elements.status.value;
    if (nextStatus === orderStatus) {
      bannerMessage('The order is already set to that status.');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    try {
      await loadingButton(button, async () => {
        const result = await api({ action: 'update-order-status', orderNumber: order.orderNumber, status: nextStatus });
        bannerMessage(result.message);
        const orderIndex = (dashboardData?.orders || []).findIndex(item => item.orderNumber === order.orderNumber);
        if (orderIndex >= 0) dashboardData.orders[orderIndex] = { ...dashboardData.orders[orderIndex], ...(result.order || {}), status: nextStatus };
        dashboardData.purchases = (dashboardData?.orders || []).filter(item => item.paymentStatus === 'success');
        renderMetrics(); renderOrders(); renderPurchases();
        closeOrderDrawer();
      }, 'Updating status');
    } catch (error) {
      bannerMessage(error.message, 'error');
    }
  });
  drawer.querySelector('[data-close-order-drawer]')?.focus({ preventScroll: true });
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
    const review = (dashboardData?.reviews || []).find(item => item.id === button.dataset.reviewToggle);
    if (review) { review.published = published; review.moderationStatus = published ? 'approved' : 'hidden'; }
    bannerMessage(result.message); renderReviews();
  }, published ? 'Publishing' : 'Hiding')));
  target.querySelectorAll('[data-review-delete]').forEach(button => button.addEventListener('click', () => {
    if (!window.confirm('Delete this review permanently?')) return;
    runAction(button, async () => { const result = await api({ action: 'delete-review', id: button.dataset.reviewDelete }); dashboardData.reviews = (dashboardData.reviews || []).filter(item => item.id !== button.dataset.reviewDelete); bannerMessage(result.message); renderReviews(); }, 'Deleting');
  }));
}

function renderMessages() {
  const target = document.querySelector('[data-messages-table]');
  if (!target) return;
  const filter = document.querySelector('[data-message-filter]')?.value || 'unread';
  const messages = (dashboardData?.messages || []).filter(message => filter === 'all' || message.status === filter || (filter === 'unread' && !['read','archived'].includes(message.status)));
  const rows = messages.map(message => `<tr><td><strong>${esc(message.name)}</strong><small>${esc(message.email)}</small><small>${esc(message.phone || 'No phone number')}</small></td><td><div class="admin-message-preview" style="white-space:normal">${esc(message.message)}</div><small>${esc(dateText(message.createdAt))}</small></td><td>${statusPill(message.status || 'unread')}</td><td><div class="table-actions"><button class="table-action" type="button" data-reply-message="${esc(message.id)}">Reply</button>${message.status === 'read' ? `<button class="table-action" type="button" data-message-state="${esc(message.id)}" data-state="archived">Archive</button>` : `<button class="table-action" type="button" data-message-state="${esc(message.id)}" data-state="read">Mark read</button>`}<button class="table-action is-danger" type="button" data-message-delete="${esc(message.id)}">Delete</button></div></td></tr>`);
  target.innerHTML = table(['From', 'Message', 'Status', 'Actions'], rows, 880);
  target.querySelectorAll('[data-message-state]').forEach(button => button.addEventListener('click', () => runAction(button, async () => { const result = await api({ action: 'message-status', id: button.dataset.messageState, status: button.dataset.state }); const message = (dashboardData?.messages || []).find(item => item.id === button.dataset.messageState); if (message) message.status = button.dataset.state; bannerMessage(result.message); renderMessages(); }, 'Saving')));
  target.querySelectorAll('[data-message-delete]').forEach(button => button.addEventListener('click', () => { if (!window.confirm('Delete this message permanently?')) return; runAction(button, async () => { const result = await api({ action: 'delete-message', id: button.dataset.messageDelete }); dashboardData.messages = (dashboardData.messages || []).filter(item => item.id !== button.dataset.messageDelete); bannerMessage(result.message); renderMessages(); }, 'Deleting'); }));
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
  target.querySelectorAll('[data-sub-status]').forEach(button => button.addEventListener('click', () => runAction(button, async () => { const nextStatus = button.dataset.state; const subscriber = (dashboardData?.subscribers || []).find(item => item.id === button.dataset.subStatus); const previousStatus = subscriber?.status || 'subscribed'; const result = await api({ action: 'subscriber-status', id: button.dataset.subStatus, status: nextStatus }); if (subscriber) subscriber.status = nextStatus; if (previousStatus !== nextStatus && dashboardData?.metrics) dashboardData.metrics.subscribers = Math.max(0, Number(dashboardData.metrics.subscribers || 0) + (nextStatus === 'subscribed' ? 1 : -1)); bannerMessage(result.message); renderSubscribers(); renderMetrics(); }, 'Updating')));
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
      loadedSections = new Set();
      sectionTasks.clear();
      renderMetrics(); renderOrders(); fillProductForm(); fillDeliveryForm(); renderPurchases(); fillAccountForm();
      if (['reviews', 'messages', 'subscribers', 'email'].includes(activeSection)) void ensureSectionData(activeSection);
      if (showNotice) bannerMessage('Workspace is up to date.');
      return data;
    } catch (error) {
      if (!dashboardData || /admin access|sign in|expired/i.test(error.message)) {
        showLogin();
        if (loginError) { loginError.textContent = error.message || 'The workspace could not be loaded. Please try again.'; loginError.hidden = false; }
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
  showAdminLoader('Signing in securely');
  try {
    await loadingButton(button, async () => {
      const credential = await signInWithEmailAndPassword(auth, String(form.get('email')).trim(), String(form.get('password')));
      currentUser = credential.user;
      const loadedDashboard = await loadDashboard(false);
      if (!loadedDashboard) {
        const detail = String(loginError?.textContent || '').trim();
        if (/this account does not have admin access/i.test(detail)) {
          throw new Error('Your Firebase sign-in succeeded, but this email is not authorized for the admin workspace. Add the exact sign-in email to ADMIN_EMAILS in Netlify, make sure the variable is available to Functions, then redeploy.');
        }
        throw new Error(detail || 'The admin workspace could not be loaded. Check the Netlify function logs for the underlying error.');
      }
      loginForm.reset(); bannerMessage('You are signed in.');
    }, 'Checking credentials');
  } catch (error) {
    try { if (auth.currentUser) await signOut(auth); } catch { /* no action */ }
    currentUser = null;
    loginError.textContent = error.message || 'We could not sign you in.'; loginError.hidden = false;
  } finally {
    hideAdminLoader();
  }
}

function bindNavigation() {
  document.querySelectorAll('[data-admin-nav]').forEach(button => button.addEventListener('click', () => setSection(button.dataset.adminNav)));
  document.querySelector('[data-admin-mobile-toggle]')?.addEventListener('click', () => toggleMobileSidebar());
  document.querySelector('[data-admin-sidebar-backdrop]')?.addEventListener('click', closeMobileSidebar);
  document.querySelector('[data-admin-order-backdrop]')?.addEventListener('click', closeOrderDrawer);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMobileSidebar(); closeOrderDrawer(); } });
  document.querySelectorAll('[data-admin-go]').forEach(button => button.addEventListener('click', () => setSection(button.dataset.adminGo)));
  document.querySelector('[data-admin-refresh]')?.addEventListener('click', async event => runAction(event.currentTarget, async () => { showAdminLoader('Refreshing your workspace'); try { return await loadDashboard(false); } finally { hideAdminLoader(); } }, 'Refreshing'));
  document.querySelector('[data-order-search]')?.addEventListener('input', renderOrders);
  document.querySelector('[data-order-filter]')?.addEventListener('change', renderOrders);
  document.querySelector('[data-review-filter]')?.addEventListener('change', renderReviews);
  document.querySelector('[data-message-filter]')?.addEventListener('change', renderMessages);
  document.querySelector('[data-admin-signout]')?.addEventListener('click', async event => {
    showAdminLoader('Signing out securely');
    try {
      await loadingButton(event.currentTarget, () => signOut(auth), 'Signing out');
      currentUser = null; dashboardData = null; loadedSections.clear(); sectionTasks.clear();
      showLogin();
    } catch (error) {
      bannerMessage(error.message || 'Could not sign out. Please try again.', 'error');
    } finally { hideAdminLoader(); }
  });
}

function bindForms() {
  const productForm = document.querySelector('[data-product-settings-form]');
  productForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!productForm.reportValidity()) return;
    const button = productForm.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(productForm).entries());
    runAction(button, async () => { const result = await api({ action: 'update-settings', ...values }); if (result.settings && dashboardData) dashboardData.settings = { ...dashboardData.settings, ...result.settings }; fillProductForm(); bannerMessage(result.message); }, 'Saving product');
  });
  const deliveryForm = document.querySelector('[data-delivery-settings-form]');
  deliveryForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!deliveryForm.reportValidity()) return;
    const days = [...deliveryForm.querySelectorAll('[data-admin-dispatch-day]:checked')].map(input => Number(input.value));
    if (!days.length) { bannerMessage('Select at least one delivery day.', 'error'); return; }
    const button = deliveryForm.querySelector('button[type="submit"]');
    runAction(button, async () => { const result = await api({ action: 'update-delivery-settings', dispatchDays: days, estimatedDeliveryDays: deliveryForm.elements.estimatedDeliveryDays.value }); if (result.settings && dashboardData) dashboardData.settings = { ...dashboardData.settings, ...result.settings }; fillDeliveryForm(); bannerMessage(result.message); }, 'Saving delivery settings');
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
      if (dashboardData?.admin) dashboardData.admin.email = currentUser.email || dashboardData.admin.email;
      bannerMessage('Your admin account settings have been updated.');
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
    runAction(button, async () => { const result = await api({ action: 'send-email', ...values }); if (result.campaign && dashboardData) { dashboardData.emailCampaigns = [result.campaign, ...(dashboardData.emailCampaigns || [])].slice(0, 8); if (loadedSections.has('email')) renderEmailHistory(); } bannerMessage(result.message); emailForm.reset(); }, 'Sending emails');
  });
}

function init() {
  if (loginForm) loginForm.addEventListener('submit', submitLogin);
  bindNavigation(); bindForms();
  showAdminLoader('Preparing your workspace');
  try {
    if (!config.apiKey || String(config.apiKey).includes('REPLACE')) {
      showLogin();
      if (loginError) { loginError.textContent = 'Add your Firebase web configuration to firebase-config.js before signing in.'; loginError.hidden = false; }
      hideAdminLoader();
      return;
    }
    const app = initializeApp(config);
    auth = getAuth(app);
    onAuthStateChanged(auth, async user => {
      showAdminLoader(user ? 'Loading your workspace' : 'Preparing sign-in');
      currentUser = user;
      if (!user) {
        dashboardData = null; loadedSections.clear(); sectionTasks.clear();
        showLogin();
        hideAdminLoader();
        return;
      }
      try { await loadDashboard(false); }
      finally { hideAdminLoader(); }
    });
  } catch (error) {
    if (loginError) { loginError.textContent = error.message || 'Firebase could not be initialised.'; loginError.hidden = false; }
    showLogin();
    hideAdminLoader();
  }
}

init();
