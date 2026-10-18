# Hair Confidante by MB

A mobile-first, multi-page storefront for Hair Confidante with retail and wholesale checkout flows, Paystack payment initialization and verification, Firestore order storage, order tracking, customer reviews, newsletter subscriptions, contact messages, an admin workspace and Resend email templates.

## Repository map

- `index.html` - editorial home page, step carousel, hair-story slider and Instagram gallery
- `product.html` - product details and shared reviews experience
- `wholesale.html` - bulk ordering with whole-number quantities and a minimum of 10
- `checkout.html` - retail or wholesale checkout based on `?mode=retail` / `?mode=wholesale`
- `confirmation.html` - payment/order confirmation
- `admin.html`, `admin.js` - protected admin console
- `images.js` - central image URLs. The current photographs are visual placeholders from Unsplash, not Michelle's real product, logo or customer-result photos.
- `firebase-config.js` - public Firebase web config for admin sign-in only
- `firestore.rules` - denies direct browser reads and writes; the Netlify Functions use the privileged Admin SDK
- `scripts.js`, `style.css` - shared site interactions and responsive styles
- `netlify/functions/` - server-side payment, Firestore, email, Instagram and admin APIs

## Before launch

This repository is wired to the service APIs, but it is **not possible to make a live store without your own project credentials and brand assets**. Do not publish before completing the checklist below and running test-mode payments.

### 1. Firebase

1. Create a Firebase project and enable Cloud Firestore.
2. Enable **Authentication > Sign-in method > Email/Password**.
3. Create Michelle's admin user in Firebase Authentication.
4. Copy the Web App configuration to `firebase-config.js`.
5. Create a Firebase service account and put its full JSON object in Netlify's `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable. Keep it in Netlify only. Never commit a service-account file or private key.
6. Set `ADMIN_EMAILS` to the exact comma-separated email address(es) permitted to use the admin APIs.
7. Publish `firestore.rules` from this repository in Firebase Console or Firebase CLI. The web app does not need direct Firestore access.
7. Deploy again after changing environment variables. Netlify exposes function secrets at runtime when the variables are scoped to Functions. See the [Netlify environment variable guide](https://docs.netlify.com/build/functions/environment-variables/).

Firestore documents and collections are created as the site is used. The server validates Firebase ID tokens for admin calls. Public users do not get direct admin write access from the browser.

### 2. Paystack

Set these Netlify environment variables:

- `PAYSTACK_SECRET_KEY` - begin with a Paystack **test** secret key. Never add it to a browser file.
- `SITE_URL` - the canonical HTTPS origin of the deployed site.
- `RETAIL_PRICE_GHS=70`
- `WHOLESALE_PRICE_GHS=60`
- `WHOLESALE_MIN_QTY=10`

In Paystack's dashboard set the webhook URL to:

`https://YOUR-DOMAIN/.netlify/functions/paystack-webhook`

Use the same production domain as `SITE_URL`. The backend creates payment sessions from server-calculated prices, checks the provider's server-side verification API, validates Paystack webhook signatures using HMAC SHA-512 and uses idempotent Firestore updates for successful payments. Never trust the browser's amount or a successful redirect as payment proof. Configure the webhook URL in Paystack too; redirects by themselves are not enough.

The amount collected is currently the product subtotal only because no delivery policy or delivery prices were provided. The checkout tells customers delivery will be confirmed separately. Before launch, decide how delivery charges are agreed and collected or extend the checkout to calculate a confirmed delivery fee before payment.

### 3. Resend

Set:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `UNSUBSCRIBE_SECRET` - a long random secret used to sign newsletter opt-out links - an address on a domain verified in Resend
- `ADMIN_NOTIFICATION_EMAIL`

All email sends happen in Netlify Functions. Templates cover order received/preparing, ready, dispatched, delivered and cancelled, payment and order receipts, review receipt and moderation notification, newsletter welcome and admin notification, secure unsubscribe links, contact message receipts, payment-failure notices and custom admin emails. Resend requires an authorised sender domain for production sending. See the [Resend Node guide](https://resend.com/nodejs).

### 4. Live Instagram gallery

The homepage calls `/.netlify/functions/instagram-feed`. For a live feed, add `INSTAGRAM_USER_ID` and `INSTAGRAM_ACCESS_TOKEN` to Netlify. These must belong to an Instagram professional/creator account and a Meta app with the appropriate Instagram API access and permissions. A public handle alone is not enough to pull private API data. The page shows an Unsplash editorial fallback until the live connection is configured. The fallback is not represented as Michelle's latest posts.

### 5. Real brand assets

Replace the placeholder URLs in `images.js` with Michelle's approved logo, actual 100 mL bottle photos, her portrait and real application photos. Before/after examples are deliberately described as editorial placeholders until the brand provides authentic customer photos with consent. Do not publish stock photos as if they were verified customer results or testimonials.

Also confirm product ingredients, approved claims, any applicable registration details, delivery areas and fees, refund/cancellation policy and contact information before launch.

### 6. Local development

Requires a current Node.js release and npm.

```bash
npm install
cp .env.example .env
# Fill in development credentials in .env; never commit it.
npm run dev
```

`netlify dev` serves the static pages and local functions. Test with Paystack test keys and test cards/Mobile Money flows before switching to live keys. After updating Netlify variables, redeploy the site.

## Admin workspace

Go to `/admin.html`, sign in with the Firebase Authentication account whose email is listed in `ADMIN_EMAILS`. The server also checks that allow-list on every admin API call. The console provides dashboard stats, order lookup and status management, product pricing and inventory, reviews moderation, messages, subscribers, purchase history and a custom email composer.

Order numbers are assigned transactionally in Firestore as `HC-00001`, `HC-00002` and so on. A paid order starts as `preparing`. Status updates to `ready`, `dispatched`, `delivered` or `cancelled` are saved and trigger customer email templates. Customers can track orders from the header using order number and email.

## Security notes

- Never place Paystack secret keys, Resend keys or Firebase service-account credentials in `scripts.js`, `images.js`, HTML or other public files.
- Restrict `ADMIN_EMAILS` and use strong passwords with multi-factor authentication on the Google/Firebase admin account.
- Set Firestore Security Rules to deny unauthenticated direct reads/writes by default. The Netlify functions use the privileged Admin SDK and enforce access at the server.
- The public form endpoints include input validation, honeypots and a Firestore-backed rate limit. Before a high-traffic launch add a managed rate limiter / CAPTCHA and configure monitoring/alerts. Set a unique random `RATE_LIMIT_SALT` in Netlify.
- This is a tailored starter implementation, not a substitute for live payment test runs, legal review or a security review.
