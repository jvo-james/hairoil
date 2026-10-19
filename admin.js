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
  reviews: ['Reviews', 'Moderate customer reviews before publishing.'],
  messages: ['Messages', 'Keep track of questions and follow-ups.'],
  subscribers: ['Subscribers', 'Your growing community, in one place.'],
  purchases: ['Purchases', 'A record of verified payments.'],
  email: ['Email centre', 'Send a note with the Hair Confidante look.'],
  delivery: ['Delivery settings', 'Manage the expected delivery window and delivery days.'],
  settings: ['Account settings', 'Update your administrator sign-in details.']
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
  closeAdminSidebar();
  document.querySelectorAll('[data-admin-nav]').forEach(button => button.classList.toggle('is-active', button.dataset.adminNav === section));
  document.querySelectorAll('[data-admin-section]').forEach(panel => panel.classList.toggle('is-active', panel.dataset.adminSection === section));
  const title = document.querySelector('[data-admin-page-title]');
  const subtitle = document.querySelector('[data-admin-page-subtitle]');
  if (title) title.textContent = titleMap[section][0];
  if (subtitle) subtitle.textContent = titleMap[section][1];
  if (section === 'orders') renderOrders();
  if (section === 'product') fillProductForm();
  if (section === 'delivery') fillDeliveryForm();
  if (section === 'settings') fillAccountSettings();
  if (section === 'reviews') renderReviews();
  if (section === 'messages') renderMessages();
  if (section === 'subscribers') renderSubscribers();
  if (section === 'purchases') renderPurchases();
  if (section === 'email') renderEmailHistory();
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
  if (target) target.innerHTML = table(['Order', 'Customer', 'Total', 'Status', 'Placed'], orders.map(order => `<tr><td><strong>${esc(order.orderNumber)}</strong><small>${esc(order.mode || 'retail')}</small></td><td><strong>${esc(order.name || 'Customer')}</strong><small>${esc(order.email || '')}</small></td><td><strong>${gh(order.total)}</strong><small>Product subtotal · ${Number(order.quantity || 1)} bottle${Number(order.quantity) === 1 ? '' : 's'}</small>${Number(order.processingFee || 0) ? `<small>Processing fee: ${gh(order.processingFee)}</small>` : ''}</td><td>${statusPill(order.status)}</td><td>${esc(shortDate(order.createdAt))}</td></tr>`));
}

function renderOrders() {
  const target = document.querySelector('[data-orders-table]');
  if (!target) return;
  const search = String(document.querySelector('[data-order-search]')?.value || '').toLowerCase().trim();
  const filter = document.querySelector('[data-order-filter]')?.value || 'all';
  const orders = (dashboardData?.orders || []).filter(order => {
    const text = `${order.orderNumber} ${order.name} ${order.email} ${order.phone} ${order.city || ''} ${order.region || ''}`.toLowerCase();
    return (!search || text.includes(search)) && (filter === 'all' || order.status === filter);
  });
  if (!orders.length) { target.innerHTML = emptyTable('No orders match this view.'); return; }
  const rows = orders.map(order => {
    const paid = order.paymentStatus === 'success';
    const fee = Number(order.processingFee || 0);
    
    const statusOptions = ['preparing','ready','dispatched','delivered','cancelled'].map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status[0].toUpperCase() + status.slice(1)}</option>`).join('');
    const dateStatus = order.status === 'delivered' ? `Delivered ${esc(shortDate(order.deliveredAt || '') )}` : order.expectedDeliveryDate && order.status !== 'cancelled' ? `ETA ${esc(shortDate(order.expectedDeliveryDate))}` : '';
    return `<tr class="admin-order-row" data-order-row="${esc(order.orderNumber)}"><td><button type="button" class="order-open-button" data-order-open="${esc(order.orderNumber)}"><strong>${esc(order.orderNumber)}</strong><small>${esc(order.mode || 'retail')} · ${esc(shortDate(order.createdAt))}</small><small>View full details <i class="fa-solid fa-arrow-up-right-from-square"></i></small></button></td><td><strong>${esc(order.name)}</strong><small>${esc(order.email)}<br>${esc(order.phone || '')}</small><small>${esc([order.address,order.city,order.region,order.country].filter(Boolean).join(', '))}</small></td><td><strong>${gh(order.total)}</strong><small>Product subtotal</small>${fee > 0 ? `<small>Processing fee: ${gh(fee)}</small>` : ''}<small>${Number(order.quantity || 1)} bottle${Number(order.quantity) === 1 ? '' : 's'}</small></td><td>${statusPill(order.status)}<small>${paid ? 'Paystack verified' : esc(order.paymentStatus || 'Unpaid')}</small><small>${dateStatus}</small></td><td>${paid ? `<div class="table-actions"><select aria-label="New status for ${esc(order.orderNumber)}" data-status-select="${esc(order.orderNumber)}">${statusOptions}</select><button type="button" class="table-action" data-save-status="${esc(order.orderNumber)}">Save</button></div>` : '<small>Payment not confirmed</small>'}</td></tr>`;
  });
  target.innerHTML = table(['Order', 'Customer & delivery', 'Product subtotal', 'Status & delivery', 'Quick status'], rows, 1060);
  target.querySelectorAll('[data-order-open]').forEach(button => button.addEventListener('click', () => openOrderDrawer(button.dataset.orderOpen)));
  target.querySelectorAll('[data-order-row]').forEach(row => row.addEventListener('click', event => { if (event.target.closest('button, select, input, a, textarea, label')) return; openOrderDrawer(row.dataset.orderRow); }));
  target.querySelectorAll('[data-save-status]').forEach(button => button.addEventListener('click', async () => {
    const orderNumber = button.dataset.saveStatus;
    const status = target.querySelector(`[data-status-select="${CSS.escape(orderNumber)}"]`)?.value;
    try { const result = await loadingButton(button, () => api({ action: 'update-order-status', orderNumber, status }), 'Updating'); bannerMessage(result.message); await loadDashboard(false); if (document.querySelector('[data-order-drawer]')?.classList.contains('is-open')) openOrderDrawer(orderNumber); }
    catch (error) { bannerMessage(error.message, 'error'); }
  }));
}

let openDrawerOrderNumber = null;
function openOrderDrawer(orderNumber) {
  const drawer = document.querySelector('[data-order-drawer]');
  const order = (dashboardData?.orders || []).find(item => item.orderNumber === orderNumber);
  if (!drawer || !order) return;
  openDrawerOrderNumber = orderNumber;
  const title = drawer.querySelector('#order-drawer-title');
  if (title) title.innerHTML = `Order <em>${esc(order.orderNumber)}</em>`;
  const subtitle = drawer.querySelector('[data-order-drawer-subtitle]');
  if (subtitle) subtitle.textContent = `${order.status || 'Order'} · placed ${dateText(order.createdAt)}`;
  const summary = drawer.querySelector('[data-order-drawer-summary]');
  const fee = Number(order.processingFee || 0); 
  const deliveryDateSummary = order.status === 'delivered' && order.deliveredAt
    ? `<div class="drawer-delivery-date is-delivered"><span><i class="fa-solid fa-circle-check"></i> Delivered on</span><strong>${esc(dateText(order.deliveredAt))}</strong></div>`
    : order.status !== 'cancelled' && order.expectedDeliveryDate
      ? `<div class="drawer-delivery-date"><span><i class="fa-solid fa-calendar-check"></i> Expected delivery</span><strong>${esc(shortDate(order.expectedDeliveryDate))}</strong></div>` : '';
  if (summary) summary.innerHTML = `<div class="drawer-order-summary"><div class="drawer-order-summary-top"><span class="drawer-order-icon"><i class="fa-solid fa-box-open"></i></span><div><small>ITEMS ORDERED</small><strong>${esc(order.productName || 'Hair Confidante Hair Oil')}</strong><span>${Number(order.quantity || 1)} bottle${Number(order.quantity) === 1 ? '' : 's'} · ${esc(order.mode || 'retail')}</span></div>${statusPill(order.status)}</div>${deliveryDateSummary}<div class="drawer-financial-line"><span>Product subtotal</span><strong>${gh(order.total)}</strong></div>${fee ? `<div class="drawer-financial-line drawer-fee-line"><span>Processing fee</span><strong>${gh(fee)}</strong></div>` : ''}<div class="drawer-order-reference"><span>PAYMENT STATUS</span><strong>${esc(order.paymentStatus || 'Not available')}${order.paymentChannel ? ` · ${esc(order.paymentChannel)}` : ''}</strong></div><div class="drawer-order-reference"><span>PAYMENT REFERENCE</span><strong>${esc(order.paymentReference || 'Not available')}</strong></div><div class="drawer-order-reference"><span>ORDER PLACED</span><strong>${esc(dateText(order.createdAt))}</strong></div></div>`;
  const form = drawer.querySelector('[data-order-drawer-form]');
  if (form) {
    ['name','email','phone','country','countryCode','region','city','postalCode','address','note'].forEach(key => { if (form.elements[key]) form.elements[key].value = order[key] || ''; });
    if (form.elements.expectedDeliveryDate) form.elements.expectedDeliveryDate.value = order.expectedDeliveryDate ? String(order.expectedDeliveryDate).slice(0,10) : '';
    if (form.elements.status) { form.elements.status.value = order.status || 'awaiting_payment'; form.elements.status.disabled = order.paymentStatus !== 'success'; }
    const alert = form.querySelector('[data-order-drawer-alert]'); if (alert) alert.hidden = true;
  }
  drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden','false'); document.body.classList.add('admin-drawer-open');
  setTimeout(() => form?.elements.name?.focus({preventScroll:true}),100);
}
function closeOrderDrawer() { const drawer=document.querySelector('[data-order-drawer]'); drawer?.classList.remove('is-open'); drawer?.setAttribute('aria-hidden','true'); document.body.classList.remove('admin-drawer-open'); openDrawerOrderNumber=null; }
function fillDeliveryForm() {
  const form=document.querySelector('[data-delivery-settings-form]'); const settings=dashboardData?.settings; if(!form||!settings)return;
  form.elements.estimatedDeliveryDays.value=String(settings.estimatedDeliveryDays || 3);
  const days=Array.isArray(settings.dispatchDays)?settings.dispatchDays.map(Number):[1,2,3,4,5,6];
  form.querySelectorAll('[data-admin-dispatch-day]').forEach(input=>input.checked=days.includes(Number(input.value)));
}
function fillAccountSettings() { const node=document.querySelector('[data-account-current-email]'); if(node)node.textContent=currentUser?.email || dashboardData?.admin?.email || 'Admin account'; }
function closeAdminSidebar() { const sidebar=document.querySelector('.admin-sidebar'); const backdrop=document.querySelector('[data-admin-sidebar-backdrop]'); sidebar?.classList.remove('is-open'); sidebar?.setAttribute('aria-hidden','true'); document.body.classList.remove('admin-nav-open'); if(backdrop)backdrop.hidden=true; const toggle=document.querySelector('[data-admin-menu-toggle]'); toggle?.setAttribute('aria-expanded','false'); }
function toggleAdminSidebar(force) { const sidebar=document.querySelector('.admin-sidebar'); const backdrop=document.querySelector('[data-admin-sidebar-backdrop]'); if(!sidebar||!backdrop)return; const open=force ?? !sidebar.classList.contains('is-open'); sidebar.classList.toggle('is-open',open); sidebar.setAttribute('aria-hidden',String(!open)); backdrop.hidden=!open; document.body.classList.toggle('admin-nav-open',open); document.querySelector('[data-admin-menu-toggle]')?.setAttribute('aria-expanded',String(open)); }

function fillProductForm() {
  const form = document.querySelector('[data-product-settings-form]');
  if (!form || !dashboardData?.settings) return;
  const settings = dashboardData.settings;
  for (const key of ['productName','productDescription','retailPrice','wholesalePrice','wholesaleMinQty','inventory','productImageUrl']) {
    if (form.elements[key]) form.elements[key].value = settings[key] ?? '';
  }
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
  const rows = purchases.map(order => `<tr><td><strong>${esc(order.orderNumber)}</strong><small>${esc(dateText(order.paidAt || order.createdAt))}</small></td><td><strong>${esc(order.name)}</strong><small>${esc(order.email)}</small></td><td><strong>${esc(order.productName)}</strong><small>${Number(order.quantity)} bottle${Number(order.quantity) === 1 ? '' : 's'} · ${esc(order.mode)}</small></td><td><strong>${gh(order.total)}</strong><small>Product subtotal</small>${Number(order.processingFee || 0) ? `<small>Processing fee: ${gh(order.processingFee)}</small>` : ''}<small>${esc(order.paymentChannel || 'Paystack')}</small></td><td>${statusPill(order.status)}</td></tr>`);
  target.innerHTML = table(['Order', 'Customer', 'Items', 'Paid', 'Fulfilment'], rows, 820);
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
      renderMetrics(); renderOrders(); fillProductForm(); fillDeliveryForm(); fillAccountSettings(); renderReviews(); renderMessages(); renderSubscribers(); renderPurchases(); renderEmailHistory();
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
  document.querySelectorAll('[data-admin-go]').forEach(button => button.addEventListener('click', () => setSection(button.dataset.adminGo)));
  document.querySelector('[data-admin-menu-toggle]')?.addEventListener('click', () => toggleAdminSidebar());
  document.querySelector('[data-admin-sidebar-backdrop]')?.addEventListener('click', closeAdminSidebar);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeAdminSidebar(); closeOrderDrawer(); } });
  document.querySelectorAll('[data-close-order-drawer]').forEach(button => button.addEventListener('click', closeOrderDrawer));
  document.querySelector('[data-order-drawer]')?.addEventListener('click', event => { if (event.target === event.currentTarget) closeOrderDrawer(); });
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
  const emailForm = document.querySelector('[data-admin-email-form]');
  emailForm?.addEventListener('submit', event => {
    event.preventDefault(); if (!emailForm.reportValidity()) return;
    const values = Object.fromEntries(new FormData(emailForm).entries()); values.toSubscribers = emailForm.elements.toSubscribers.checked;
    if (values.toSubscribers && !window.confirm('Send this email to every active subscriber?')) return;
    if (!values.toSubscribers && !values.to) { bannerMessage('Add a recipient email or select all active subscribers.', 'error'); return; }
    const button = emailForm.querySelector('button[type="submit"]');
    runAction(button, async () => { const result = await api({ action: 'send-email', ...values }); bannerMessage(result.message); emailForm.reset(); await loadDashboard(false); }, 'Sending emails');
  });
  const deliveryForm=document.querySelector('[data-delivery-settings-form]');
  deliveryForm?.addEventListener('submit', event => { event.preventDefault(); if(!deliveryForm.reportValidity())return; const days=[...deliveryForm.querySelectorAll('[data-admin-dispatch-day]:checked')].map(x=>Number(x.value)); if(!days.length){bannerMessage('Select at least one delivery day.','error');return;} const button=deliveryForm.querySelector('button[type="submit"]'); runAction(button,async()=>{const result=await api({action:'update-delivery-settings',dispatchDays:days,estimatedDeliveryDays:deliveryForm.elements.estimatedDeliveryDays.value});bannerMessage(result.message);await loadDashboard(false);},'Saving delivery settings'); });
  const orderForm=document.querySelector('[data-order-drawer-form]');
  orderForm?.addEventListener('submit', event => { event.preventDefault(); const alert=orderForm.querySelector('[data-order-drawer-alert]'); alert.hidden=true; if(!orderForm.reportValidity())return; const values=Object.fromEntries(new FormData(orderForm).entries()); const orderNumber=openDrawerOrderNumber; if(!orderNumber)return; const button=orderForm.querySelector('button[type="submit"]'); runAction(button,async()=>{const order=(dashboardData?.orders||[]).find(o=>o.orderNumber===orderNumber); const detailPayload={action:'update-order-details',orderNumber,...values}; delete detailPayload.status; await api(detailPayload); if(order && values.status && values.status!==order.status){await api({action:'update-order-status',orderNumber,status:values.status});} bannerMessage('Order details saved.'); await loadDashboard(false); closeOrderDrawer();},'Saving order'); });
  const accountForm=document.querySelector('[data-admin-account-form]');
  accountForm?.addEventListener('submit', event => { event.preventDefault(); const alert=accountForm.querySelector('[data-account-settings-alert]'); alert.hidden=true; if(!accountForm.reportValidity())return; const newEmail=String(accountForm.elements.newEmail.value||'').trim(); const newPassword=String(accountForm.elements.newPassword.value||''); const confirmPassword=String(accountForm.elements.confirmPassword.value||''); const currentPassword=String(accountForm.elements.currentPassword.value||''); if(!newEmail&&!newPassword){alert.textContent='Enter a new email address or a new password.';alert.hidden=false;return;} if(newPassword.length && newPassword!==confirmPassword){alert.textContent='The new passwords do not match.';alert.hidden=false;return;} if(newPassword.length && newPassword.length<8){alert.textContent='Use at least 8 characters for the new password.';alert.hidden=false;return;} const button=accountForm.querySelector('button[type="submit"]'); runAction(button,async()=>{ if(!currentUser?.email)throw new Error('Please sign in again.'); await reauthenticateWithCredential(currentUser,EmailAuthProvider.credential(currentUser.email,currentPassword)); if(newPassword)await updatePassword(currentUser,newPassword); if(newEmail && newEmail.toLowerCase()!==currentUser.email.toLowerCase())await updateEmail(currentUser,newEmail); const changedEmail=Boolean(newEmail && newEmail.toLowerCase()!==dashboardData?.admin?.email?.toLowerCase()); await currentUser.getIdToken(true); accountForm.reset(); fillAccountSettings(); if(changedEmail){bannerMessage('Email updated. Now update ADMIN_EMAILS in Netlify to the new email before signing in again.');}else bannerMessage('Account settings updated.'); },'Updating account').catch(error=>{alert.textContent=error.message || 'Account settings could not be updated.';alert.hidden=false;}); });
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
