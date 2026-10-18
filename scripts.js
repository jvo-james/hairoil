(() => {
  'use strict';

  const PRODUCT_NAME = 'Hair Confidante Hair Oil';
  const RETAIL_PRICE = 70;
  const WHOLESALE_PRICE = 60;
  const WHATSAPP_PHONE = '233593231032';
  const CART_KEY = 'hairConfidanteCart';
  const ORDER_KEY = 'hairConfidanteOrderRequest';

  const parseJSON = (value, fallback) => {
    try { return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  };

  const money = (amount) => `GH₵${Number(amount || 0).toLocaleString('en-GH', { maximumFractionDigits: 2 })}`;
  const getCart = () => parseJSON(localStorage.getItem(CART_KEY), []);
  const setCart = (cart) => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  };
  const cartQuantity = (cart = getCart()) => cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = (cart = getCart()) => cart.reduce((sum, item) => sum + item.quantity * item.price, 0);

  function updateCartCount() {
    const count = cartQuantity();
    document.querySelectorAll('[data-cart-count]').forEach((node) => {
      node.textContent = String(count);
      node.setAttribute('aria-label', `${count} item${count === 1 ? '' : 's'} in bag`);
    });
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.querySelector('[data-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function bottleMarkup() {
    return '<div class="bottle" aria-hidden="true"><div class="bottle-cap"></div><div class="bottle-neck"></div><div class="bottle-body"><div class="bottle-label"><span>HC</span><small>HAIR<br>CONFIDANTE</small><i>hair oil</i><b>100 mL</b></div></div></div>';
  }

  function addToCart(quantity = 1) {
    const safeQuantity = Math.max(1, Math.min(99, Number.parseInt(quantity, 10) || 1));
    const cart = getCart();
    const existing = cart.find((item) => item.id === 'hair-oil-100ml');
    if (existing) existing.quantity = Math.min(99, existing.quantity + safeQuantity);
    else cart.push({ id: 'hair-oil-100ml', name: PRODUCT_NAME, size: '100 mL', price: RETAIL_PRICE, quantity: safeQuantity });
    setCart(cart);
    showToast(`${safeQuantity} bottle${safeQuantity === 1 ? '' : 's'} added to your bag.`);
  }

  function setProductQuantity(next) {
    const quantity = Math.max(1, Math.min(99, Number.parseInt(next, 10) || 1));
    document.querySelectorAll('[data-quantity-output]').forEach((node) => { node.textContent = String(quantity); });
    document.querySelectorAll('[data-quantity-input]').forEach((node) => { node.value = String(quantity); });
    return quantity;
  }

  function initMobileMenu() {
    const toggle = document.querySelector('[data-menu-toggle]');
    const nav = document.querySelector('[data-main-nav]');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
      nav.classList.toggle('is-open', !expanded);
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
      nav.classList.remove('is-open');
    }));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open navigation');
        nav.classList.remove('is-open');
      }
    });
  }

  function initProduct() {
    const qtyInput = document.querySelector('[data-quantity-input]');
    if (!qtyInput) return;
    setProductQuantity(qtyInput.value);
    document.querySelector('[data-qty-minus]')?.addEventListener('click', () => setProductQuantity(Number(qtyInput.value) - 1));
    document.querySelector('[data-qty-plus]')?.addEventListener('click', () => setProductQuantity(Number(qtyInput.value) + 1));
    qtyInput.addEventListener('change', () => setProductQuantity(qtyInput.value));
    document.querySelector('[data-add-to-cart]')?.addEventListener('click', () => addToCart(qtyInput.value));
    document.querySelector('[data-buy-now]')?.addEventListener('click', () => {
      addToCart(qtyInput.value);
      window.location.href = 'checkout.html';
    });
  }

  function renderCheckout() {
    const container = document.querySelector('[data-checkout-lines]');
    if (!container) return;
    const cart = getCart();
    const subtotalNode = document.querySelector('[data-cart-subtotal]');
    if (subtotalNode) subtotalNode.textContent = money(cartSubtotal(cart));

    if (!cart.length) {
      container.innerHTML = `<div class="cart-empty"><p>Your bag is waiting for its first bottle.</p><a class="button button-dark" href="product.html">Explore the hair oil <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>`;
      return;
    }

    container.innerHTML = cart.map((item) => `
      <article class="cart-line" data-cart-line="${item.id}">
        <div class="cart-thumb">${bottleMarkup()}</div>
        <div class="cart-line-main">
          <h3 class="cart-line-title">${item.name}</h3>
          <p class="cart-line-meta">${item.size} · ${money(item.price)} each</p>
          <div class="cart-line-controls">
            <div class="cart-mini-qty" aria-label="Quantity controls">
              <button type="button" data-line-minus="${item.id}" aria-label="Decrease quantity"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
              <span>${item.quantity}</span>
              <button type="button" data-line-plus="${item.id}" aria-label="Increase quantity"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
            </div>
            <button class="remove-item" type="button" data-line-remove="${item.id}">Remove</button>
          </div>
        </div>
        <div class="cart-line-price">${money(item.quantity * item.price)}</div>
      </article>`).join('');

    container.querySelectorAll('[data-line-minus]').forEach((button) => button.addEventListener('click', () => updateCartLine(button.dataset.lineMinus, -1)));
    container.querySelectorAll('[data-line-plus]').forEach((button) => button.addEventListener('click', () => updateCartLine(button.dataset.linePlus, 1)));
    container.querySelectorAll('[data-line-remove]').forEach((button) => button.addEventListener('click', () => removeCartLine(button.dataset.lineRemove)));
  }

  function updateCartLine(id, delta) {
    const cart = getCart();
    const item = cart.find((line) => line.id === id);
    if (!item) return;
    item.quantity += delta;
    const updated = item.quantity < 1 ? cart.filter((line) => line.id !== id) : cart;
    setCart(updated);
    renderCheckout();
  }

  function removeCartLine(id) {
    setCart(getCart().filter((item) => item.id !== id));
    renderCheckout();
    showToast('Bottle removed from your bag.');
  }

  function buildRetailWhatsAppMessage(order) {
    const items = order.items.map((item) => `• ${item.quantity} × ${item.name} (${item.size}) = ${money(item.quantity * item.price)}`).join('\n');
    return [
      'Hello Hair Confidante, I would like to place an order request.',
      '',
      'ORDER DETAILS', items, `Subtotal: ${money(order.subtotal)}`, 'Delivery: Please confirm delivery fee', '',
      'CUSTOMER DETAILS', `Name: ${order.name}`, `Phone: ${order.phone}`, `Town or city: ${order.city}`, `Region: ${order.region}`, `Delivery address: ${order.address}`, order.notes ? `Notes: ${order.notes}` : '', '',
      'Please confirm availability, delivery timing and payment details. Thank you.'
    ].filter(Boolean).join('\n');
  }

  function initCheckout() {
    const form = document.querySelector('[data-order-form]');
    if (!form) return;
    renderCheckout();
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const cart = getCart();
      if (!cart.length) {
        showToast('Add a bottle to your bag before continuing.');
        return;
      }
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const order = {
        type: 'retail',
        items: cart,
        subtotal: cartSubtotal(cart),
        name: String(data.get('name') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        city: String(data.get('city') || '').trim(),
        region: String(data.get('region') || '').trim(),
        address: String(data.get('address') || '').trim(),
        notes: String(data.get('notes') || '').trim(),
        createdAt: new Date().toISOString()
      };
      sessionStorage.setItem(ORDER_KEY, JSON.stringify(order));
      const whatsappURL = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(buildRetailWhatsAppMessage(order))}`;
      window.open(whatsappURL, '_blank', 'noopener,noreferrer');
      localStorage.removeItem(CART_KEY);
      updateCartCount();
      window.location.href = 'confirmation.html';
    });
  }

  function initConfirmation() {
    const summary = document.querySelector('[data-confirmation-summary]');
    if (!summary) return;
    const order = parseJSON(sessionStorage.getItem(ORDER_KEY), null);
    const button = document.querySelector('[data-send-whatsapp]');
    if (!order) {
      summary.innerHTML = '<p>You have not submitted an order request in this session. You can still contact Hair Confidante directly or return to the product page.</p>';
      return;
    }
    if (order.type === 'wholesale') {
      const text = order.whatsappMessage || 'Hello Hair Confidante, I would like to discuss a wholesale order.';
      if (button) button.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
      summary.innerHTML = `<h2>Wholesale request summary</h2><ul><li>${order.quantity} unlabelled 100 mL bottles</li><li>Estimated product subtotal: ${money(order.subtotal)}</li><li>Delivery: to be confirmed</li></ul>`;
      const lead = document.querySelector('[data-confirmation-lead]');
      if (lead) lead.textContent = 'Your wholesale request is ready. Send it to Hair Confidante in WhatsApp so the team can confirm availability, delivery and payment.';
      return;
    }
    const list = order.items.map((item) => `<li>${item.quantity} × ${item.name}: ${money(item.quantity * item.price)}</li>`).join('');
    summary.innerHTML = `<h2>Your order request</h2><ul>${list}<li>Subtotal: ${money(order.subtotal)}</li><li>Delivery: to be confirmed</li></ul>`;
    const lead = document.querySelector('[data-confirmation-lead]');
    if (lead) lead.textContent = `Thank you, ${order.name}. Your order request has been prepared. Send it to Hair Confidante in WhatsApp so the team can confirm delivery and payment.`;
    if (button) button.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(buildRetailWhatsAppMessage(order))}`;
  }

  function initWholesale() {
    const form = document.querySelector('[data-wholesale-form]');
    if (!form) return;
    const quantityInput = form.querySelector('[data-wholesale-quantity]');
    const subtotalNode = form.querySelector('[data-wholesale-subtotal]');
    const errorNode = form.querySelector('[data-wholesale-error]');
    const updateSubtotal = () => {
      const quantity = Math.max(0, Number.parseInt(quantityInput.value, 10) || 0);
      if (subtotalNode) subtotalNode.textContent = money(quantity * WHOLESALE_PRICE);
      if (errorNode) errorNode.hidden = quantity >= 10;
    };
    form.querySelector('[data-wholesale-minus]')?.addEventListener('click', () => {
      quantityInput.value = String(Math.max(10, (Number.parseInt(quantityInput.value, 10) || 10) - 1));
      updateSubtotal();
    });
    form.querySelector('[data-wholesale-plus]')?.addEventListener('click', () => {
      quantityInput.value = String(Math.min(10000, (Number.parseInt(quantityInput.value, 10) || 10) + 1));
      updateSubtotal();
    });
    quantityInput.addEventListener('input', updateSubtotal);
    quantityInput.addEventListener('change', () => {
      quantityInput.value = String(Math.max(10, Number.parseInt(quantityInput.value, 10) || 10));
      updateSubtotal();
    });
    updateSubtotal();

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const quantity = Number.parseInt(data.get('quantity'), 10) || 0;
      if (quantity < 10) {
        if (errorNode) errorNode.hidden = false;
        quantityInput.focus();
        return;
      }
      const order = {
        type: 'wholesale',
        quantity,
        subtotal: quantity * WHOLESALE_PRICE,
        name: String(data.get('name') || '').trim(),
        business: String(data.get('business') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        city: String(data.get('city') || '').trim(),
        notes: String(data.get('notes') || '').trim(),
        createdAt: new Date().toISOString()
      };
      order.whatsappMessage = [
        'Hello Hair Confidante, I would like to make a wholesale order request.', '',
        'WHOLESALE REQUEST', `Quantity: ${order.quantity} unlabelled 100 mL bottles`, `Price per bottle: ${money(WHOLESALE_PRICE)}`, `Estimated product subtotal: ${money(order.subtotal)}`, 'Delivery: Please confirm delivery fee', '',
        'BUSINESS DETAILS', `Name: ${order.name}`, order.business ? `Business: ${order.business}` : '', `Phone: ${order.phone}`, `Town or city: ${order.city}`, order.notes ? `Notes: ${order.notes}` : '', '',
        'Please confirm availability, delivery timing and payment details. Thank you.'
      ].filter(Boolean).join('\n');
      sessionStorage.setItem(ORDER_KEY, JSON.stringify(order));
      window.location.href = 'confirmation.html';
    });
  }

  function initFooterYear() {
    document.querySelectorAll('[data-year]').forEach((node) => { node.textContent = String(new Date().getFullYear()); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    initMobileMenu();
    initProduct();
    initCheckout();
    initConfirmation();
    initWholesale();
    initFooterYear();
  });
})();
