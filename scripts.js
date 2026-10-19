(() => {
  'use strict';
  const IMAGES = window.HC_IMAGES || {};
  const SETTINGS_DEFAULTS = { productName: 'Hair Confidante Hair Oil', productDescription: 'A unisex hair oil designed for regular hair and scalp care. Apply a small amount along the scalp in sections and massage gently with your fingertips.', retailPrice: 70, wholesalePrice: 60, wholesaleMinQty: 10, bottleSize: '100 mL', productImageUrl: '' };
  let settings = { ...SETTINGS_DEFAULTS };
  let activeReviewRating = 0;
  let trackLastResult = null;
  let stepsTimer = null;
  let storyTimer = null;
  let activeStep = 0;
  let activeStory = 0;
  let stepsTouchStart = null;
  let storyTouchStart = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = () => window.matchMedia('(max-width: 760px)').matches;
  const money = value => `GH₵${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const endpoint = name => `/.netlify/functions/${name}`;

  async function api(name, options = {}) {
    const config = { method: options.method || 'GET', headers: { Accept: 'application/json', ...(options.headers || {}) } };
    if (options.body !== undefined) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }
    const response = await fetch(endpoint(name), config);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
    return payload;
  }

  function notify(message, kind = 'success') {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      document.body.append(region);
    }
    region.innerHTML = `<div class="toast ${kind === 'error' ? 'is-error' : ''}"><i class="fa-solid ${kind === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}" aria-hidden="true"></i><span>${escapeHTML(message)}</span></div>`;
    clearTimeout(region._timer);
    region._timer = setTimeout(() => { region.innerHTML = ''; }, 4800);
  }

  function showButtonLoading(button, loadingLabel = 'Please wait') {
    if (!button || button.classList.contains('is-loading')) return false;
    button.dataset.loadingOriginal = button.innerHTML;
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `<span class="button-spinner"><span class="spinner ${button.classList.contains('button-light') ? 'spinner-dark' : 'spinner-light'}"></span><span>${escapeHTML(loadingLabel)}</span></span>`;
    return true;
  }

  function restoreButtonLoading(button) {
    if (!button) return;
    if (button.dataset.loadingOriginal !== undefined) {
      button.innerHTML = button.dataset.loadingOriginal;
      delete button.dataset.loadingOriginal;
    }
    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
  }

  // If checkout navigates away and the browser later restores this page from
  // its back/forward cache, clear any navigation spinner left in the restored DOM.
  window.addEventListener('pageshow', () => {
    document.querySelectorAll('button[data-loading-original], button.is-loading').forEach(restoreButtonLoading);
  });

  async function withButtonLoading(button, task, loadingLabel = 'Please wait') {
    if (!showButtonLoading(button, loadingLabel)) return;
    try { return await task(); }
    finally { restoreButtonLoading(button); }
  }

  function setBodyOverlay(isOpen) {
    document.body.classList.toggle('has-overlay', isOpen);
  }

  function headerMarkup() {
    const homeClass = document.body.dataset.page === 'home' ? ' site-header-home' : '';
    return `<header class="site-header${homeClass}"><div class="header-inner">
      <div class="header-side header-side-left"><button class="menu-trigger" type="button" data-open-menu aria-label="Open navigation menu" aria-expanded="false"><span class="menu-bars" aria-hidden="true"><span></span><span></span></span><span class="menu-label">Menu</span></button></div>
      <a class="brand-lockup header-brand-lockup" href="index.html" aria-label="Hair Confidante by MB home"><img class="header-logo-img" src="${escapeHTML(IMAGES.logoMark || IMAGES.logo || 'images/logo.jpg')}" alt="" width="42" height="42"><span class="header-brand-copy"><span class="brand-name">HAIR CONFIDANTE</span><span class="brand-by">by MB</span></span></a>
      <nav class="header-desktop-nav" aria-label="Main navigation"><a href="index.html" data-header-link="home">Home</a><a href="product.html" data-header-link="product">Hair oil</a><a href="wholesale.html" data-header-link="wholesale">Wholesale</a></nav>
      <div class="header-side header-side-right"><button class="track-trigger" type="button" data-open-track aria-label="Track order" title="Track order"><i class="fa-solid fa-box" aria-hidden="true"></i></button></div>
    </div></header>`;
  }

  function footerMarkup() {
    return `<footer class="site-footer"><div class="page-shell">
      <div class="footer-top"><div class="footer-brand"><a class="brand-lockup" href="index.html" aria-label="Hair Confidante by MB home" style="align-items:flex-start;text-align:left"><span class="brand-name">HAIR CONFIDANTE</span><span class="brand-by">by MB</span></a><p>Hair and scalp oil for everyday use, available in retail and wholesale quantities.</p><div class="footer-socials"><a href="https://www.instagram.com/_michellebediako/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a><a href="https://www.tiktok.com/@_michellebediako" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><i class="fa-brands fa-tiktok"></i></a><a href="https://www.snapchat.com/add/i.michyy" target="_blank" rel="noopener noreferrer" aria-label="Snapchat"><i class="fa-brands fa-snapchat"></i></a><a href="https://www.youtube.com/@michellebediakoo" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><i class="fa-brands fa-youtube"></i></a></div></div>
      <div class="footer-newsletter"><p class="eyebrow">NEWS & PRODUCT UPDATES</p><h3>Product updates.</h3><p>Receive product news, availability updates and brand announcements.</p><form class="newsletter-form" data-newsletter-form novalidate><input type="email" name="email" placeholder="Your email address" aria-label="Your email address" maxlength="160" required><input class="honeypot" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">Sign me up <i class="fa-solid fa-arrow-right"></i></button></form></div></div>
      <nav class="footer-links" aria-label="Footer navigation"><a href="product.html">Shop Hair Oil</a><a href="wholesale.html">Wholesale</a><a href="index.html#how-to-use">How to use</a><a href="index.html#instagram">Instagram</a><a href="tel:0593231032">059 323 1032</a><button type="button" class="footer-contact-link" data-open-contact>Contact</button></nav>
      <div class="footer-bottom"><span>© <span data-current-year>${new Date().getFullYear()}</span> Hair Confidante by MB. Made with care.</span><span class="footer-credit"><span class="footer-credit-label">WEBSITE BY</span><a href="https://www.snapchat.com/add/jvo_james" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-code" aria-hidden="true"></i> jvo_james <i class="fa-solid fa-arrow-up-right-from-square footer-credit-arrow" aria-hidden="true"></i></a></span><span class="footer-socials"><a href="https://www.snapchat.com/add/jvo_james" target="_blank" rel="noopener noreferrer" aria-label="Website creator on Snapchat"><i class="fa-brands fa-snapchat"></i></a></span></div>
    </div></footer>`;
  }

  function overlayMarkup() {
    return `<div class="overlay-backdrop" data-overlay-backdrop></div>
      <aside class="site-drawer site-drawer-menu" data-menu-drawer aria-label="Site navigation" aria-hidden="true"><div class="drawer-top"><div class="drawer-brand"><strong>HAIR CONFIDANTE</strong><small>by MB</small></div><button type="button" class="icon-button" data-close-overlays aria-label="Close menu"><i class="fa-solid fa-xmark"></i></button></div><p class="drawer-kicker">FIND YOUR WAY</p><nav class="menu-links"><a href="index.html">Home <i class="fa-solid fa-arrow-up-right-from-square"></i></a><a href="product.html">Hair oil <i class="fa-solid fa-arrow-up-right-from-square"></i></a><a href="wholesale.html">Wholesale <span>FOR BUSINESS</span></a><button type="button" class="menu-track-link" data-open-track>Track order <i class="fa-solid fa-box" aria-hidden="true"></i></button><a href="index.html#how-to-use">How to use <i class="fa-solid fa-arrow-up-right-from-square"></i></a><a href="index.html#instagram">Instagram <i class="fa-solid fa-arrow-up-right-from-square"></i></a></nav><div class="drawer-footer">Questions? Call <a href="tel:0593231032">059 323 1032</a></div></aside>
      <aside class="site-drawer site-drawer-track" data-track-drawer aria-label="Track your order" aria-hidden="true"><div class="drawer-top"><div class="drawer-brand"><strong>ORDER TRACKER</strong><small>Track your order status.</small></div><button type="button" class="icon-button" data-close-overlays aria-label="Close order tracker"><i class="fa-solid fa-xmark"></i></button></div><div class="track-drawer-heading"><p class="eyebrow">ORDER TRACKING</p><h2>Where is your<br><em>order?</em></h2><p>Enter the order number from your email and the email address used at checkout.</p></div><form class="track-form" data-track-form novalidate><label><span>Order number</span><input name="orderNumber" type="text" placeholder="HC-00001" autocapitalize="characters" maxlength="30" required></label><label><span>Email address</span><input name="email" type="email" placeholder="you@example.com" maxlength="160" required></label><button class="button button-dark button-full" type="submit"><span>Find my order</span><i class="fa-solid fa-arrow-right"></i></button><div class="checkout-alert" data-track-error role="status" hidden></div></form><div class="track-results" data-track-results hidden></div></aside>
      <div class="modal-wrap" data-review-modal aria-hidden="true"><div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="review-modal-title"><div class="modal-head"><div><p class="eyebrow">A NOTE FROM YOU</p><h2 id="review-modal-title">Leave a review.</h2></div><button type="button" class="icon-button" data-close-review aria-label="Close review form"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><form class="review-form" data-review-form novalidate><div><div class="rating-prompt"><span>Your rating</span><span class="rating-helper" data-rating-helper>Choose a star rating</span></div><div class="rating-stars" role="radiogroup" aria-label="Rate the product" data-rating-stars>${[1,2,3,4,5].map(n=>`<button type="button" role="radio" aria-checked="false" data-rating="${n}" aria-label="${n} star${n===1?'':'s'}">★</button>`).join('')}</div><input type="hidden" name="rating" value=""></div><label><span>Your name</span><input type="text" name="name" autocomplete="name" minlength="2" maxlength="70" placeholder="How should we credit you?" required></label><label><span>Email address</span><input type="email" name="email" autocomplete="email" maxlength="160" placeholder="We will not publish this" required></label><label><span>Your experience</span><textarea name="review" rows="4" minlength="12" maxlength="1200" placeholder="Tell us what you noticed after using the oil..." required></textarea></label><input class="honeypot" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit" class="button button-dark button-full"><span>Send my review</span><i class="fa-solid fa-arrow-right"></i></button><p style="margin:0;color:var(--ink-faint);font-size:10px">Reviews are checked before they appear. Share your own honest experience.</p></form><div class="review-success" data-review-success hidden><span class="success-icon"><i class="fa-solid fa-check"></i></span><h3>That means a lot.</h3><p style="color:var(--ink-soft);font-size:12px">Your review has been received and is waiting for approval.</p><button type="button" class="button button-dark" data-close-review>Lovely, thanks</button></div></div></div></div>
      <div class="modal-wrap" data-contact-modal aria-hidden="true"><div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title"><div class="modal-head"><div><p class="eyebrow">WE ARE LISTENING</p><h2 id="contact-modal-title">Send a note.</h2></div><button type="button" class="icon-button" data-close-contact aria-label="Close contact form"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><form class="review-form" data-contact-form novalidate><label><span>Your name</span><input type="text" name="name" autocomplete="name" minlength="2" maxlength="70" required></label><label><span>Email address</span><input type="email" name="email" autocomplete="email" maxlength="160" required></label><label><span>Phone number <small>Optional</small></span><input type="tel" name="phone" autocomplete="tel" maxlength="25"></label><label><span>Your message</span><textarea name="message" rows="4" minlength="10" maxlength="2000" required></textarea></label><input class="honeypot" type="text" name="company_site" tabindex="-1" autocomplete="off" aria-hidden="true"><div class="checkout-alert" data-contact-error role="status" hidden></div><button type="submit" class="button button-dark button-full"><span>Send message</span><i class="fa-solid fa-arrow-right"></i></button></form></div></div></div>`;
  }

  function initHeaderScroll(header) {
    if (!header) return;
    let lastY = Math.max(0, window.scrollY);
    let rafPending = false;
    const update = () => {
      const y = Math.max(0, window.scrollY);
      header.classList.toggle('is-scrolled', y > 24);
      if (y < 10) header.classList.remove('is-hidden');
      else if (y > lastY + 5 && y > 90) header.classList.add('is-hidden');
      else if (y < lastY - 3) header.classList.remove('is-hidden');
      lastY = y;
      rafPending = false;
    };
    window.addEventListener('scroll', () => {
      if (rafPending) return;
      rafPending = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  function initialiseSharedShell() {
    const headerTarget = document.querySelector('[data-site-header]');
    if (headerTarget) headerTarget.innerHTML = headerMarkup();
    initHeaderScroll(headerTarget?.querySelector('.site-header'));
    const footerTarget = document.querySelector('[data-site-footer]');
    if (footerTarget) footerTarget.innerHTML = footerMarkup();
    if (!document.querySelector('[data-menu-drawer]')) document.body.insertAdjacentHTML('beforeend', overlayMarkup());
    document.querySelectorAll('[data-img]').forEach(img => {
      const key = img.getAttribute('data-img');
      const src = IMAGES[key];
      if (src) img.src = src;
      img.loading ||= 'lazy';
    });
    const isHome = document.body.dataset.page === 'home';
    const hero = document.querySelector('.hero-home[data-image="hero"]');
    if (hero && IMAGES.hero) hero.style.backgroundImage = `url("${IMAGES.hero}")`;
    document.querySelectorAll('[data-current-year]').forEach(el => el.textContent = new Date().getFullYear());
    const backdrop = document.querySelector('[data-overlay-backdrop]');
    const menu = document.querySelector('[data-menu-drawer]');
    const track = document.querySelector('[data-track-drawer]');
    function closeDrawers() {
      backdrop?.classList.remove('is-open');
      menu?.classList.remove('is-open'); track?.classList.remove('is-open');
      menu?.setAttribute('aria-hidden', 'true'); track?.setAttribute('aria-hidden', 'true');
      document.querySelector('[data-open-menu]')?.setAttribute('aria-expanded', 'false');
      setBodyOverlay(false);
    }
    function openDrawer(which) {
      closeDrawers();
      backdrop?.classList.add('is-open');
      const drawer = which === 'menu' ? menu : track;
      drawer?.classList.add('is-open'); drawer?.setAttribute('aria-hidden', 'false');
      if (which === 'menu') document.querySelector('[data-open-menu]')?.setAttribute('aria-expanded', 'true');
      setBodyOverlay(true);
      setTimeout(() => drawer?.querySelector('input,button:not([data-close-overlays])')?.focus({ preventScroll: true }), 160);
    }
    document.querySelector('[data-open-menu]')?.addEventListener('click', () => openDrawer('menu'));
    document.querySelectorAll('[data-open-track]').forEach(button => button.addEventListener('click', () => { closeReviewModal(); closeContactModal(); openDrawer('track'); }));
    document.querySelectorAll('[data-close-overlays]').forEach(button => button.addEventListener('click', closeDrawers));
    backdrop?.addEventListener('click', closeDrawers);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeDrawers(); closeReviewModal(); closeContactModal(); } });
    document.querySelectorAll('.menu-links a').forEach(link => link.addEventListener('click', closeDrawers));
    window.HC_UI = { closeDrawers, openDrawer, notify, api, withButtonLoading };
    initReviewModal();
    initContactModal();
    initTrackForm();
    initNewsletter();
    if (isHome) { initStepsCarousel(); initStorySlider(); initBeforeAfter(); initInstagram(); }
  }

  function modalToggle(modal, open) {
    if (!modal) return;
    modal.classList.toggle('is-open', open);
    modal.setAttribute('aria-hidden', String(!open));
    setBodyOverlay(open || Boolean(document.querySelector('.site-drawer.is-open')) || Boolean(document.querySelector('.modal-wrap.is-open')));
  }
  function closeReviewModal() { const modal = document.querySelector('[data-review-modal]'); if (modal) modalToggle(modal, false); }
  function closeContactModal() { const modal = document.querySelector('[data-contact-modal]'); if (modal) modalToggle(modal, false); }

  function initReviewModal() {
    const modal = document.querySelector('[data-review-modal]');
    const form = document.querySelector('[data-review-form]');
    if (!modal || !form) return;
    document.querySelectorAll('[data-open-review]').forEach(button => button.addEventListener('click', () => {
      activeReviewRating = 0;
      form.reset(); updateRatingStars(0);
      modal.querySelector('[data-review-success]').hidden = true;
      form.hidden = false;
      modalToggle(modal, true);
      setTimeout(() => form.querySelector('button[data-rating]')?.focus({ preventScroll: true }), 80);
    }));
    modal.querySelectorAll('[data-close-review]').forEach(button => button.addEventListener('click', closeReviewModal));
    modal.addEventListener('click', event => { if (event.target === modal) closeReviewModal(); });
    const starButtons = [...modal.querySelectorAll('[data-rating]')];
    starButtons.forEach(button => {
      button.addEventListener('mouseenter', () => updateRatingStars(Number(button.dataset.rating), true));
      button.addEventListener('focus', () => updateRatingStars(Number(button.dataset.rating), true));
      button.addEventListener('click', () => { activeReviewRating = Number(button.dataset.rating); updateRatingStars(activeReviewRating); });
      button.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault(); const current = Number(button.dataset.rating); const next = Math.min(5, Math.max(1, current + (event.key === 'ArrowRight' ? 1 : -1)));
          modal.querySelector(`[data-rating="${next}"]`)?.focus(); activeReviewRating = next; updateRatingStars(activeReviewRating);
        }
      });
    });
    modal.querySelector('[data-rating-stars]')?.addEventListener('mouseleave', () => updateRatingStars(activeReviewRating));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (!form.reportValidity()) return;
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries()); payload.rating = activeReviewRating;
      if (!activeReviewRating) { notify('Choose a star rating first.', 'error'); return; }
      if (String(payload.review || '').trim().length < 12) { notify('Write a little more about your experience.', 'error'); return; }
      try {
        await withButtonLoading(button, () => api('submit-review', { method: 'POST', body: payload }), 'Sending your review');
        form.hidden = true; modal.querySelector('[data-review-success]').hidden = false;
        loadPublicData();
      } catch (error) { notify(error.message, 'error'); }
    });
  }

  function updateRatingStars(rating, preview = false) {
    const modal = document.querySelector('[data-review-modal]');
    if (!modal) return;
    modal.querySelectorAll('[data-rating]').forEach(button => {
      const value = Number(button.dataset.rating);
      button.classList.toggle('is-selected', value <= (preview ? rating : activeReviewRating));
      button.classList.toggle('is-hovered', preview && value <= rating);
      button.setAttribute('aria-checked', String(!preview && value === activeReviewRating));
    });
    const helper = modal.querySelector('[data-rating-helper]');
    const labels = ['Choose a star rating', 'Not for me', 'Could be better', 'It was okay', 'Really liked it', 'Loved it'];
    if (helper) helper.textContent = labels[preview ? rating : activeReviewRating] || labels[0];
    modal.querySelector('input[name="rating"]').value = activeReviewRating ? String(activeReviewRating) : '';
  }

  function initContactModal() {
    const modal = document.querySelector('[data-contact-modal]');
    const form = document.querySelector('[data-contact-form]');
    if (!modal || !form) return;
    document.querySelectorAll('[data-open-contact]').forEach(button => button.addEventListener('click', () => { modalToggle(modal, true); setTimeout(() => form.querySelector('input')?.focus({ preventScroll: true }), 80); }));
    modal.querySelectorAll('[data-close-contact]').forEach(button => button.addEventListener('click', closeContactModal));
    modal.addEventListener('click', event => { if (event.target === modal) closeContactModal(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('button[type="submit"]');
      const alert = form.querySelector('[data-contact-error]'); alert.hidden = true;
      try {
        const result = await withButtonLoading(button, () => api('contact-message', { method: 'POST', body: Object.fromEntries(new FormData(form).entries()) }), 'Sending your note');
        form.reset(); closeContactModal(); notify(result.message || 'Your note has been sent.');
      } catch (error) { alert.textContent = error.message; alert.hidden = false; }
    });
  }

  function initTrackForm() {
    const form = document.querySelector('[data-track-form]');
    if (!form) return;
    const results = document.querySelector('[data-track-results]');
    const errorBox = document.querySelector('[data-track-error]');
    form.querySelector('[name="orderNumber"]')?.addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/\s/g, ''); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      errorBox.hidden = true; results.hidden = true; results.innerHTML = '';
      const button = form.querySelector('button[type="submit"]');
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const result = await withButtonLoading(button, () => api('track-order', { method: 'POST', body: payload }), 'Finding your order');
        trackLastResult = result.order;
        renderTrackResult(result.order);
      } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
    });
  }

  function renderTrackResult(order) {
    const form = document.querySelector('[data-track-form]');
    const results = document.querySelector('[data-track-results]');
    const errorBox = document.querySelector('[data-track-error]');
    if (!form || !results) return;
    form.hidden = true; errorBox.hidden = true; results.hidden = false;
    const statuses = ['preparing', 'ready', 'dispatched', 'delivered'];
    const labels = { preparing: 'Preparing', ready: 'Ready', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled', awaiting_payment: 'Awaiting payment' };
    const currentIndex = statuses.indexOf(order.status);
    const timeline = order.status === 'cancelled'
      ? `<div class="track-timeline-item is-complete"><i class="fa-solid fa-circle-xmark"></i><div><strong>Cancelled</strong><br><span>Your order has been cancelled.</span></div></div>`
      : statuses.map((status, index) => `<div class="track-timeline-item ${currentIndex >= index ? 'is-complete' : ''}"><i class="${currentIndex >= index ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i><div><strong>${labels[status]}</strong>${findStatusDate(order.history, status) ? `<br><span>${formatDate(findStatusDate(order.history, status))}</span>` : ''}</div></div>`).join('');
    const paidAmount = order.amountPaid ?? order.chargeTotal ?? (Number(order.total || 0) + Number(order.processingFee || 0));
    const deliveryDate = order.status === 'delivered' ? (order.deliveredAt || findStatusDate(order.history, 'delivered')) : order.expectedDeliveryDate;
    const deliveryLabel = order.status === 'delivered' ? 'Delivered on' : order.status === 'cancelled' ? 'Delivery' : 'Expected delivery';
    const deliveryValue = order.status === 'cancelled' ? 'Order cancelled' : deliveryDate ? formatDate(deliveryDate) : 'To be confirmed';
    results.innerHTML = `<div class="track-results-top"><div><span style="display:block;color:var(--ink-faint);font-size:10px;letter-spacing:.12em">ORDER NUMBER</span><strong>${escapeHTML(order.orderNumber)}</strong></div><span class="status-pill">${escapeHTML(labels[order.status] || order.status)}</span></div><div class="track-summary-lines"><div><span>Product</span><strong>${escapeHTML(order.productName)}</strong></div><div><span>Quantity</span><strong>${Number(order.quantity)} bottle${Number(order.quantity) === 1 ? '' : 's'}</strong></div><div><span>Product subtotal</span><strong>${money(order.total)}</strong></div>${Number(order.processingFee || 0) > 0 ? `<div><span>Processing fee</span><strong>${money(order.processingFee)}</strong></div>` : ''}<div><span>Total paid</span><strong>${money(paidAmount)}</strong></div><div><span>Order placed</span><strong>${formatDate(order.createdAt)}</strong></div><div class="track-delivery-date"><span>${deliveryLabel}</span><strong>${deliveryValue}</strong></div></div><div class="track-timeline">${timeline}</div><button type="button" class="track-back" data-track-back><i class="fa-solid fa-arrow-left"></i> Track another order</button>`;
    results.querySelector('[data-track-back]')?.addEventListener('click', () => {
      form.hidden = false; results.hidden = true; results.innerHTML = ''; form.reset(); trackLastResult = null; form.querySelector('input[name="orderNumber"]')?.focus();
    });
  }

  function findStatusDate(history, status) { return (history || []).find(item => item.status === status)?.at || null; }
  function formatDate(value) { if (!value) return 'Just now'; const d = new Date(value); if (Number.isNaN(d.getTime())) return ''; return d.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }); }

  function initNewsletter() {
    document.querySelectorAll('[data-newsletter-form]').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('button[type="submit"]');
      const email = String(new FormData(form).get('email') || '').trim();
      try {
        const result = await withButtonLoading(button, () => api('subscribe', { method: 'POST', body: { email, name: '', website: new FormData(form).get('website') } }), 'Adding you');
        form.reset(); notify(result.message || 'You are on the list.');
      } catch (error) { notify(error.message, 'error'); }
    }));
  }

  async function loadPublicData() {
    try {
      const data = await api('get-public-data');
      settings = { ...SETTINGS_DEFAULTS, ...(data.settings || {}) };
      if (settings.productImageUrl && /^https?:\/\//i.test(settings.productImageUrl)) {
        document.querySelectorAll('[data-img="product"], [data-img="productHero"]').forEach(img => { img.src = settings.productImageUrl; });
      }
      document.querySelectorAll('[data-product-name]').forEach(el => { el.textContent = settings.productName || SETTINGS_DEFAULTS.productName; });
      document.querySelectorAll('[data-product-description]').forEach(el => { el.textContent = settings.productDescription || SETTINGS_DEFAULTS.productDescription; });
      document.querySelectorAll('[data-retail-price]').forEach(el => el.textContent = money(settings.retailPrice).replace('.00', ''));
      document.querySelectorAll('[data-wholesale-price]').forEach(el => el.textContent = Number(settings.wholesalePrice).toLocaleString('en-GH', { maximumFractionDigits: 2 }));
      document.querySelectorAll('[data-wholesale-quantity]').forEach(input => { input.min = String(settings.wholesaleMinQty); if (Number(input.value) < settings.wholesaleMinQty) input.value = String(settings.wholesaleMinQty); });
      document.querySelectorAll('[data-wholesale-form]').forEach(form => updateWholesaleCalculator(form));
      const stockTracked = settings.inventory !== null && settings.inventory !== undefined && Number.isFinite(Number(settings.inventory));
      const stock = stockTracked ? Math.max(0, Number(settings.inventory)) : null;
      const stockNote = document.querySelector('[data-inventory-note]');
      const retailBuy = document.querySelector('[data-buy-retail]');
      const wholesaleBuy = document.querySelector('[data-wholesale-form] button[type="submit"]');
      if (stockNote) {
        stockNote.hidden = !stockTracked;
        stockNote.classList.toggle('is-out', stock === 0);
        stockNote.textContent = stock === 0 ? 'Currently unavailable. Please check back soon.' : stockTracked && stock <= 5 ? `Only ${stock} bottle${stock === 1 ? '' : 's'} currently available.` : stockTracked ? `${stock} bottles currently available.` : '';
      }
      if (retailBuy && stockTracked && stock < 1) { retailBuy.disabled = true; retailBuy.innerHTML = '<span>Currently unavailable</span>'; }
      else if (retailBuy) retailBuy.disabled = false;
      if (wholesaleBuy && stockTracked && stock < Number(settings.wholesaleMinQty || 10)) { wholesaleBuy.disabled = true; wholesaleBuy.innerHTML = '<span>Wholesale unavailable</span>'; }
      else if (wholesaleBuy) wholesaleBuy.disabled = false;
      updateCheckoutSummary();
      renderReviews(data.reviews || []);
    } catch { renderReviews([]); }
  }

  function renderReviews(reviews) {
    document.querySelectorAll('[data-reviews-section]').forEach(section => {
      const list = section.querySelector('[data-reviews-list]');
      const avgEl = section.querySelector('[data-review-average]');
      const countEl = section.querySelector('[data-review-count]');
      const summaryStars = section.querySelector('[data-summary-stars]');
      const total = reviews.length;
      const avg = total ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total : 0;
      if (avgEl) avgEl.textContent = total ? avg.toFixed(1) : '0.0';
      if (countEl) countEl.textContent = total ? `${total} published review${total === 1 ? '' : 's'}` : 'No published reviews yet';
      if (summaryStars) summaryStars.textContent = `${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}`;
      if (!list) return;
      if (!total) {
        list.innerHTML = `<div class="reviews-empty"><span class="reviews-empty-icon"><i class="fa-regular fa-message"></i></span><strong>The first note could be yours.</strong><p>Share your experience after trying the product.</p></div>`;
        return;
      }
      list.innerHTML = reviews.slice(0, 12).map(review => `<article class="review-card"><div class="review-card-top"><div><h3>${escapeHTML(review.name || 'Customer')}</h3><span class="review-date">${formatDate(review.createdAt)}</span></div><span class="status-pill" style="font-size:7px">Published</span></div><div class="stars-display" aria-label="${Number(review.rating)} out of 5 stars">${'★'.repeat(Number(review.rating))}${'☆'.repeat(5 - Number(review.rating))}</div><p>${escapeHTML(review.review)}</p><div class="review-verified"><i class="fa-solid fa-circle-check"></i> Community review</div></article>`).join('');
    });
  }

  function initStepsCarousel() {
    const carousel = document.querySelector('[data-steps-carousel]');
    if (!carousel) return;
    const track = carousel.querySelector('.steps-track');
    const cards = [...carousel.querySelectorAll('.step-card')];
    const dots = [...carousel.querySelectorAll('[data-step-dot]')];
    const progress = carousel.querySelector('[data-steps-progress]');
    const count = carousel.querySelector('[data-steps-count]');
    let inView = false;
    function goTo(index) {
      activeStep = (index + cards.length) % cards.length;
      cards.forEach((card, i) => card.classList.toggle('is-active', i === activeStep));
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeStep));
      if (count) count.textContent = `${activeStep + 1} / ${cards.length}`;
      if (progress) progress.style.width = `${((activeStep + 1) / cards.length) * 100}%`;
      if (isSmall()) {
        const offset = cards[activeStep].offsetLeft - track.offsetLeft;
        track.style.transform = `translateX(${-offset}px)`;
      } else track.style.transform = '';
    }
    const scheduleAuto = () => {
      clearInterval(stepsTimer);
      if (inView && isSmall() && !reduceMotion && !document.hidden) stepsTimer = setInterval(() => goTo(activeStep + 1), 4800);
    };
    dots.forEach(dot => dot.addEventListener('click', () => { goTo(Number(dot.dataset.stepDot)); scheduleAuto(); }));
    carousel.querySelector('[data-step-prev]')?.addEventListener('click', () => { goTo(activeStep - 1); scheduleAuto(); });
    carousel.querySelector('[data-step-next]')?.addEventListener('click', () => { goTo(activeStep + 1); scheduleAuto(); });
    carousel.addEventListener('touchstart', event => { stepsTouchStart = event.changedTouches[0].clientX; }, { passive: true });
    carousel.addEventListener('touchend', event => {
      if (stepsTouchStart == null) return;
      const delta = event.changedTouches[0].clientX - stepsTouchStart;
      if (Math.abs(delta) > 45) { goTo(activeStep + (delta < 0 ? 1 : -1)); scheduleAuto(); }
      stepsTouchStart = null;
    }, { passive: true });
    carousel.addEventListener('mouseenter', () => clearInterval(stepsTimer));
    carousel.addEventListener('mouseleave', scheduleAuto);
    document.addEventListener('visibilitychange', scheduleAuto);
    window.addEventListener('resize', () => { goTo(activeStep); scheduleAuto(); });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        inView = entries.some(entry => entry.isIntersecting);
        scheduleAuto();
      }, { threshold: 0.28 });
      observer.observe(carousel);
    } else { inView = true; scheduleAuto(); }
    goTo(0);
  }

  function initStorySlider() {
    const slider = document.querySelector('[data-story-slider]');
    if (!slider) return;
    const slides = [...slider.querySelectorAll('[data-story-slide]')];
    const dots = [...slider.querySelectorAll('[data-story-dot]')];
    const captions = ['Every hair story has its own pace.', 'Care looks different from one person to the next.', 'Your routine should feel like yours.'];
    const caption = slider.querySelector('[data-story-caption]');
    function goTo(index) {
      activeStory = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.classList.toggle('is-active', i === activeStory));
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeStory));
      if (caption) caption.textContent = captions[activeStory];
    }
    const restart = () => { clearInterval(storyTimer); if (!reduceMotion && !document.hidden) storyTimer = setInterval(() => goTo(activeStory + 1), 6200); };
    dots.forEach(dot => dot.addEventListener('click', () => { goTo(Number(dot.dataset.storyDot)); restart(); }));
    slider.querySelector('[data-story-prev]')?.addEventListener('click', () => { goTo(activeStory - 1); restart(); });
    slider.querySelector('[data-story-next]')?.addEventListener('click', () => { goTo(activeStory + 1); restart(); });
    slider.addEventListener('touchstart', event => { storyTouchStart = event.changedTouches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', event => { if (storyTouchStart == null) return; const delta = event.changedTouches[0].clientX - storyTouchStart; if (Math.abs(delta) > 45) { goTo(activeStory + (delta < 0 ? 1 : -1)); restart(); } storyTouchStart = null; }, { passive: true });
    slider.addEventListener('mouseenter', () => clearInterval(storyTimer)); slider.addEventListener('mouseleave', restart);
    document.addEventListener('visibilitychange', () => document.hidden ? clearInterval(storyTimer) : restart());
    goTo(0); restart();
  }

  function initBeforeAfter() {
    const section = document.querySelector('[data-before-after]');
    const input = section?.querySelector('[data-before-after-range]');
    if (!section || !input) return;
    const update = () => section.style.setProperty('--compare-position', `${input.value}%`);
    input.addEventListener('input', update);
    update();
  }

  async function initInstagram() {
    const grid = document.querySelector('[data-instagram-grid]');
    const note = document.querySelector('[data-instagram-note]');
    if (!grid) return;
    try {
      const result = await api('instagram-feed');
      if (result.provider === 'elfsight' && /^[a-z0-9-]{16,80}$/i.test(String(result.elfsightWidgetId || ''))) {
        const widgetId = String(result.elfsightWidgetId);
        grid.innerHTML = `<div class="instagram-elfsight-wrap"><div class="elfsight-app-${escapeHTML(widgetId)}" data-elfsight-app-lazy></div></div>`;
        let platform = document.querySelector('script[data-elfsight-platform]');
        if (!platform) {
          platform = document.createElement('script');
          platform.src = 'https://static.elfsight.com/platform/platform.js';
          platform.async = true;
          platform.dataset.elfsightPlatform = 'true';
          document.body.append(platform);
        }
        if (note) note.textContent = 'Recent posts from the connected Instagram account.';
        return;
      }
      if (result.configured && Array.isArray(result.posts) && result.posts.length) {
        grid.innerHTML = result.posts.map(post => `<a class="instagram-card" href="${escapeHTML(post.permalink)}" target="_blank" rel="noopener noreferrer" aria-label="Open Instagram post"><img src="${escapeHTML(post.mediaUrl)}" alt="Instagram post from Hair Confidante" loading="lazy"><span class="instagram-type"><i class="fa-brands fa-instagram"></i></span><span class="instagram-card-overlay"><i class="fa-solid fa-arrow-up-right-from-square"></i><span class="instagram-caption">${escapeHTML(post.caption || 'A little moment from Instagram.')}</span></span></a>`).join('');
        if (note) note.textContent = 'Fresh posts and reels from Instagram. Select an image to open the original post.';
        return;
      }
    } catch { /* The editorial fallback below keeps the section useful during setup. */ }
    const fallback = (IMAGES.instagramFallback || []).slice(0, 6);
    const captions = ['Brand preview image.', 'Beauty editorial image.', 'Hair and scalp care reference.', 'Product-care editorial.', 'Hair Confidante visual preview.', 'Brand imagery preview.'];
    grid.innerHTML = fallback.map((src, index) => `<a class="instagram-card" href="https://www.instagram.com/_michellebediako/" target="_blank" rel="noopener noreferrer" aria-label="Visit Michelle's Instagram"><img src="${escapeHTML(src)}" alt="Editorial beauty photography placeholder" loading="lazy"><span class="instagram-type"><i class="fa-brands fa-instagram"></i></span><span class="instagram-card-overlay"><i class="fa-solid fa-arrow-up-right-from-square"></i><span class="instagram-caption">${captions[index] || 'Beauty, in the everyday.'}</span></span></a>`).join('');
    if (note) note.textContent = 'Editorial preview images are shown until the live Instagram connection is configured.';
  }

  function initProductPurchase() {
    const quantity = document.querySelector('[data-retail-quantity]');
    if (quantity) {
      const clamp = () => { const value = Number(quantity.value); quantity.value = String(Number.isInteger(value) && value >= 1 ? Math.min(value, 1000) : 1); };
      quantity.addEventListener('change', clamp);
      document.querySelector('[data-qty-minus]')?.addEventListener('click', () => { quantity.value = String(Math.max(1, (Number(quantity.value) || 1) - 1)); });
      document.querySelector('[data-qty-plus]')?.addEventListener('click', () => { quantity.value = String(Math.min(1000, (Number(quantity.value) || 1) + 1)); });
    }
    document.querySelector('[data-buy-retail]')?.addEventListener('click', buttonEvent => {
      const button = buttonEvent.currentTarget;
      const selected = Number(quantity?.value || 1);
      const q = Number.isInteger(selected) && selected >= 1 ? Math.min(selected, 1000) : 1;
      if (!showButtonLoading(button, 'Opening checkout')) return;
      window.location.href = `checkout.html?mode=retail&quantity=${q}`;
    });
  }

  function initWholesale() {
    const form = document.querySelector('[data-wholesale-form]');
    const quantity = document.querySelector('[data-wholesale-quantity]');
    if (!form || !quantity) return;
    const minQty = () => Math.max(1, Number(settings.wholesaleMinQty) || 10);
    const clamp = (normalise = true) => {
      let val = Number(quantity.value);
      if (!Number.isInteger(val)) { if (normalise) quantity.value = String(minQty()); updateWholesaleCalculator(form); return; }
      if (normalise) val = Math.max(minQty(), Math.min(1000, val));
      quantity.value = String(val);
      updateWholesaleCalculator(form);
    };
    quantity.addEventListener('input', () => updateWholesaleCalculator(form));
    quantity.addEventListener('change', () => clamp(true));
    form.querySelector('[data-wholesale-minus]')?.addEventListener('click', () => { quantity.value = String(Math.max(minQty(), (parseInt(quantity.value, 10) || minQty()) - 1)); clamp(false); });
    form.querySelector('[data-wholesale-plus]')?.addEventListener('click', () => { quantity.value = String(Math.min(1000, (parseInt(quantity.value, 10) || minQty()) + 1)); clamp(false); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const amount = Number(quantity.value);
      if (!Number.isInteger(amount) || amount < minQty() || amount > 1000) { notify(`Enter a whole number from ${minQty()} to 1000.`, 'error'); quantity.focus(); return; }
      const button = form.querySelector('button[type="submit"]');
      if (!showButtonLoading(button, 'Opening checkout')) return;
      window.location.href = `checkout.html?mode=wholesale&quantity=${amount}`;
    });
    updateWholesaleCalculator(form);
  }

  function updateWholesaleCalculator(form) {
    if (!form) return;
    const quantityInput = form.querySelector('[data-wholesale-quantity]');
    const qty = Number(quantityInput?.value || settings.wholesaleMinQty || 10);
    const whole = Number.isInteger(qty) && qty >= Number(settings.wholesaleMinQty || 10) && qty <= 1000;
    const price = Number(settings.wholesalePrice || 60);
    form.querySelector('[data-wholesale-unit]')?.replaceChildren(document.createTextNode(money(price)));
    form.querySelector('[data-wholesale-display-qty]')?.replaceChildren(document.createTextNode(`${Number.isFinite(qty) ? qty : 0} bottle${qty === 1 ? '' : 's'}`));
    form.querySelector('[data-wholesale-total]')?.replaceChildren(document.createTextNode(money(whole ? price * qty : 0)));
    if (quantityInput) quantityInput.setAttribute('aria-invalid', String(!whole));
  }

  function initCheckout() {
    const form = document.querySelector('[data-checkout-form]');
    if (!form) return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') === 'wholesale' ? 'wholesale' : 'retail';
    let quantity = Number(params.get('quantity') || 1);
    const min = mode === 'wholesale' ? Math.max(1, Number(settings.wholesaleMinQty) || 10) : 1;
    if (!Number.isInteger(quantity) || quantity < min || quantity > 1000) quantity = min;
    window.HC_CHECKOUT_MODE = mode;
    window.HC_CHECKOUT_QUANTITY = quantity;
    const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'mode'; hidden.value = mode; form.append(hidden);
    const countrySelect = form.querySelector('[name="countryCode"]');
    const ghanaGroup = form.querySelector('[data-ghana-region-group]');
    const internationalGroup = form.querySelector('[data-international-region-group]');
    const ghanaRegion = form.querySelector('[name="ghanaRegion"]');
    const internationalRegion = form.querySelector('[name="internationalRegion"]');
    const postalCode = form.querySelector('[name="postalCode"]');
    const postalHelp = form.querySelector('[data-postal-help]');
    const countryNameInput = form.querySelector('[name="country"]');
    function syncDeliveryFields() {
      const selected = countrySelect?.selectedOptions?.[0];
      const isGhana = (countrySelect?.value || 'GH').toUpperCase() === 'GH';
      if (countryNameInput) countryNameInput.value = selected?.dataset.countryName || selected?.textContent || 'Ghana';
      if (ghanaGroup) ghanaGroup.hidden = !isGhana;
      if (internationalGroup) internationalGroup.hidden = isGhana;
      if (ghanaRegion) ghanaRegion.required = isGhana;
      if (internationalRegion) internationalRegion.required = !isGhana;
      if (postalCode) postalCode.required = !isGhana;
      if (postalHelp) postalHelp.textContent = isGhana ? 'Optional in Ghana' : 'Required for international delivery';
      if (isGhana && internationalRegion) internationalRegion.value = '';
      if (!isGhana && ghanaRegion) ghanaRegion.value = '';
    }
    countrySelect?.addEventListener('change', syncDeliveryFields);
    syncDeliveryFields();
    const scheduleEl = document.querySelector('[data-delivery-schedule]');
    if (scheduleEl) scheduleEl.textContent = 'Delivery timing and fee will be confirmed by the team after checkout.';
    updateCheckoutSummary();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const alert = form.querySelector('[data-checkout-alert]'); alert.hidden = true; alert.classList.remove('is-success');
      if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form).entries());
      values.mode = mode; values.quantity = quantity;
      values.region = values.countryCode === 'GH' ? values.ghanaRegion : values.internationalRegion;
      delete values.ghanaRegion; delete values.internationalRegion;
      const button = form.querySelector('button[type="submit"]');
      try {
        const result = await withButtonLoading(button, () => api('create-checkout', { method: 'POST', body: values }), 'Connecting to Paystack');
        if (!result.authorizationUrl || !/^https:\/\/(checkout\.)?paystack\.com\//.test(result.authorizationUrl)) throw new Error('Paystack did not return a valid checkout link. Please try again.');
        window.location.href = result.authorizationUrl;
      } catch (error) {
        alert.textContent = error.message; alert.hidden = false;
        button.focus({ preventScroll: true });
      }
    });
  }

  function updateCheckoutSummary() {
    const totalEl = document.querySelector('[data-checkout-total]');
    if (!totalEl) return;
    const mode = window.HC_CHECKOUT_MODE || (new URLSearchParams(window.location.search).get('mode') === 'wholesale' ? 'wholesale' : 'retail');
    let quantity = window.HC_CHECKOUT_QUANTITY || Number(new URLSearchParams(window.location.search).get('quantity') || 1);
    const min = mode === 'wholesale' ? Math.max(1, Number(settings.wholesaleMinQty) || 10) : 1;
    if (!Number.isInteger(quantity) || quantity < min || quantity > 1000) quantity = min;
    const unit = Number(mode === 'wholesale' ? settings.wholesalePrice : settings.retailPrice);
    const total = Math.round(quantity * unit * 100) / 100;
    const processingFee = Math.round(total * 0.0295 * 100) / 100;
    const amountDue = Math.round((total + processingFee) * 100) / 100;
    const modeLabel = document.querySelector('[data-checkout-mode-label]');
    if (modeLabel) modeLabel.textContent = mode === 'wholesale' ? 'WHOLESALE' : 'RETAIL';
    document.querySelector('[data-checkout-product-name]')?.replaceChildren(document.createTextNode(settings.productName || SETTINGS_DEFAULTS.productName));
    document.querySelector('[data-checkout-unit-info]')?.replaceChildren(document.createTextNode(`${settings.bottleSize || '100 mL'} · ${mode === 'wholesale' ? 'Unlabelled wholesale' : 'Retail bottle'}`));
    document.querySelector('[data-checkout-quantity]')?.replaceChildren(document.createTextNode(`Qty ${quantity}`));
    document.querySelector('[data-checkout-subtotal]')?.replaceChildren(document.createTextNode(money(total)));
    document.querySelector('[data-checkout-fee]')?.replaceChildren(document.createTextNode(money(processingFee)));
    totalEl.textContent = money(amountDue);
    const back = document.querySelector('[data-back-to-product]');
    if (back) back.href = mode === 'wholesale' ? 'wholesale.html' : 'product.html';
    document.querySelector('.checkout-heading h1')?.replaceChildren(...(mode === 'wholesale' ? [document.createTextNode('Wholesale '), Object.assign(document.createElement('em'), { textContent: 'checkout.' })] : [document.createTextNode('Delivery & '), Object.assign(document.createElement('em'), { textContent: 'payment.' })]));
    const scheduleEl = document.querySelector('[data-delivery-schedule]');
    if (scheduleEl) { const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; const days = Array.isArray(settings.dispatchDays) ? settings.dispatchDays.map(Number).filter(n => n >= 0 && n <= 6).sort((a,b) => a-b) : [1,2,3,4,5,6]; const dayCopy = days.map(n => names[n]).join(', '); scheduleEl.textContent = `Typical delivery window: ${Number(settings.estimatedDeliveryDays || 3)} days. Regular delivery days: ${dayCopy || 'to be confirmed'}. The final delivery date and fee will be confirmed after checkout.`; }
  }

  function initConfirmation() {
    const card = document.querySelector('[data-confirmation-card]');
    if (!card) return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    const message = card.querySelector('[data-confirmation-message]');
    const spinnerText = card.querySelector('[data-confirmation-spinner-text]');
    const spinnerWrap = card.querySelector('.confirmation-spinner');
    const details = card.querySelector('[data-confirmation-details]');
    if (!reference) {
      message.textContent = 'We could not find a payment reference in this link. Use the order tracker if you have already paid.';
      spinnerWrap.hidden = true;
      return;
    }
    async function verify() {
      spinnerWrap.hidden = false; spinnerText.textContent = 'Confirming payment securely';
      try {
        const data = await api('verify-payment', { method: 'POST', body: { reference } });
        if (data.verified) {
          spinnerWrap.hidden = true;
          message.textContent = 'Your payment is confirmed. We have received your order and will email you as it moves along.';
          details.hidden = false;
          const order = data.order || { orderNumber: data.orderNumber, status: data.status };
          const moneyText = value => `GH₵${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const dateText = value => value ? new Date(value).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' }) : new Date().toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' });
          const deliveryAddress = [order.address, order.city, order.region, order.postalCode, order.country].filter(Boolean).map(escapeHTML).join(', ');
          details.innerHTML = `
            <div class="confirmation-order-no"><span>ORDER NUMBER</span><strong>${escapeHTML(order.orderNumber || data.orderNumber)}</strong></div>
            <div class="confirmation-detail-row"><span>Payment status</span><strong>Paid · ${escapeHTML(order.status || data.status || 'preparing')}</strong></div>
            <section class="receipt-document" data-receipt-document aria-label="Payment receipt">
              <div class="receipt-brandline"><span class="receipt-monogram">HC</span><div><strong>HAIR CONFIDANTE</strong><small>by MB · PAYMENT RECEIPT</small></div><span class="receipt-paid">PAID</span></div>
              <div class="receipt-heading"><h2>Payment receipt</h2><p>Reference ${escapeHTML(order.paymentReference || reference)}</p></div>
              <div class="receipt-meta"><div><small>ORDER NUMBER</small><strong>${escapeHTML(order.orderNumber || data.orderNumber)}</strong></div><div><small>DATE PAID</small><strong>${escapeHTML(dateText(order.paidAt || order.createdAt))}</strong></div></div>
              <div class="receipt-customer"><div><small>BILLED TO</small><strong>${escapeHTML(order.name || '')}</strong><span>${escapeHTML(order.email || '')}</span><span>${escapeHTML(order.phone || '')}</span></div><div><small>DELIVERY ADDRESS</small><span>${deliveryAddress || 'Provided at checkout'}</span></div></div>
              <div class="receipt-line receipt-items"><span><strong>${escapeHTML(order.productName || 'Hair Confidante Hair Oil')}</strong><small>${escapeHTML(order.mode || 'retail')} · ${Number(order.quantity || 1)} bottle${Number(order.quantity) === 1 ? '' : 's'} × ${moneyText(order.unitPrice)}</small></span><strong>${moneyText(Number(order.quantity || 1) * Number(order.unitPrice || 0))}</strong></div>
              <div class="receipt-line"><span>Product subtotal</span><strong>${moneyText(order.total)}</strong></div>
              <div class="receipt-line"><span>Processing fee</span><strong>${moneyText(order.processingFee || 0)}</strong></div>
              <div class="receipt-line"><span>Delivery fee</span><strong>Not included</strong></div>
              <div class="receipt-total"><span>TOTAL PAID</span><strong>${moneyText(order.amountPaid ?? order.chargeTotal ?? (Number(order.total || 0) + Number(order.processingFee || 0)))}</strong></div>
              <p class="receipt-delivery-note">Delivery is arranged separately. We will contact you with the estimated delivery fee and delivery details.</p>
              <div class="receipt-footerline"><span>Payment method: ${escapeHTML(order.paymentChannel || 'Paystack')}</span><span>Currency: GHS</span></div>
            </section>
            <div class="receipt-actions"><button type="button" class="button button-dark receipt-print-button" data-print-receipt><i class="fa-solid fa-print"></i> Print receipt</button><button type="button" class="button button-outline receipt-download-button" data-download-receipt><i class="fa-solid fa-download"></i> Download receipt</button></div>`;
          const downloadReceipt = () => {
            const receipt = details.querySelector('[data-receipt-document]');
            if (!receipt) return;
            const standalone = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hair Confidante payment receipt</title><style>
              *{box-sizing:border-box}body{margin:0;padding:28px;background:#f2ede5;color:#33212a;font:14px/1.5 Arial,sans-serif}.receipt-document{max-width:760px;margin:0 auto;padding:32px;background:#fffdf8;border:1px solid #ddd4c9}.receipt-brandline{display:flex;align-items:center;gap:11px;padding-bottom:16px;border-bottom:1px solid #e7dfd5}.receipt-monogram{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border:1px solid #b98167;border-radius:50%;font-family:Georgia,serif}.receipt-brandline>div{display:grid;gap:3px}.receipt-brandline>div strong{font-size:10px;letter-spacing:.13em}.receipt-brandline small,.receipt-meta small,.receipt-customer small{color:#857a7d;font-size:8px;font-weight:700;letter-spacing:.1em}.receipt-paid{margin-left:auto;padding:6px 9px;border:1px solid #718366;color:#536b46;font-size:8px;font-weight:800;letter-spacing:.12em}.receipt-heading{padding:19px 0 14px}.receipt-heading h2{margin:0 0 4px;font-size:28px}.receipt-heading p{margin:0;color:#857a7d;font-size:10px;overflow-wrap:anywhere}.receipt-meta,.receipt-customer{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:13px 0;border-bottom:1px solid #e7dfd5}.receipt-meta>div,.receipt-customer>div{display:grid;align-content:start;gap:5px;min-width:0}.receipt-meta strong,.receipt-customer strong,.receipt-customer span{font-size:10px;line-height:1.6;overflow-wrap:anywhere}.receipt-customer span{color:#62565d}.receipt-line{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid #e7dfd5;font-size:11px}.receipt-line>span{display:grid;gap:4px}.receipt-line small{color:#857a7d;font-size:9px}.receipt-line>strong{flex-shrink:0}.receipt-total{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 0;border-bottom:1px solid #e7dfd5;font-size:10px;font-weight:800;letter-spacing:.1em}.receipt-total strong{font-size:20px;letter-spacing:0}.receipt-delivery-note{margin:13px 0 0;color:#62565d;font-size:10px;line-height:1.65}.receipt-footerline{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:17px;padding-top:12px;border-top:1px solid #e7dfd5;color:#857a7d;font-size:8px}@media(max-width:560px){body{padding:10px}.receipt-document{padding:18px}.receipt-meta,.receipt-customer{grid-template-columns:1fr}}
              </style></head><body>${receipt.outerHTML}</body></html>`;
            const url = URL.createObjectURL(new Blob([standalone], { type: 'text/html;charset=utf-8' }));
            const link = document.createElement('a');
            const safeOrder = String(order.orderNumber || data.orderNumber || 'receipt').replace(/[^a-z0-9-]/gi, '-');
            link.href = url; link.download = `Hair-Confidante-Receipt-${safeOrder}.html`;
            document.body.append(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          };
          details.querySelector('[data-print-receipt]')?.addEventListener('click', () => window.print());
          details.querySelector('[data-download-receipt]')?.addEventListener('click', downloadReceipt);
          // Attempt a one-time automatic receipt download. The visible download button remains
          // available if the browser blocks downloads that begin after asynchronous verification.
          try {
            const receiptKey = `hc-receipt-${order.paymentReference || reference}`;
            if (!sessionStorage.getItem(receiptKey)) {
              sessionStorage.setItem(receiptKey, 'download-attempted');
              setTimeout(downloadReceipt, 700);
            }
          } catch (_) { /* Private browsing can disable session storage. */ }
          return;
        }
        spinnerText.textContent = 'Payment is still processing';
        message.textContent = data.message || 'Your payment is not confirmed yet. You can check again in a moment.';
        let retry = card.querySelector('[data-retry-payment]');
        if (!retry) {
          retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button button-outline'; retry.dataset.retryPayment = ''; retry.innerHTML = '<span>Check payment again</span><i class="fa-solid fa-rotate-right"></i>';
          card.querySelector('.confirmation-actions')?.prepend(retry);
          retry.addEventListener('click', () => withButtonLoading(retry, verify, 'Checking payment'));
        }
      } catch (error) {
        spinnerWrap.hidden = true;
        message.textContent = error.message || 'We could not verify the payment yet. Your payment reference has not been lost. Contact us if the issue continues.';
        notify('Payment verification is not complete yet.', 'error');
      }
    }
    verify();
  }

  function initReveal() {
    // Keep content immediately visible; no staggered or scroll-triggered reveal effects.
    document.querySelectorAll('.reveal').forEach(item => item.classList.add('is-visible'));
  }

  function init() {
    initialiseSharedShell();
    initProductPurchase();
    initWholesale();
    initCheckout();
    initConfirmation();
    initReveal();
    loadPublicData();
    window.addEventListener('resize', () => {
      if (document.querySelector('[data-steps-carousel]')) {
        const track = document.querySelector('.steps-track');
        if (!isSmall() && track) track.style.transform = '';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
