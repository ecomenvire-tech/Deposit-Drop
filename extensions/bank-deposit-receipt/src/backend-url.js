// NOTE: App Proxy (`/apps/deposit-drop/...` on the shop domain) is intentionally
// NOT used here. A checkout/customer-account UI extension runs on the
// `extensions.shopifycdn.com` origin, so a fetch() to the shop domain is
// cross-origin and triggers a CORS preflight (OPTIONS) whenever custom headers
// like Authorization are sent. Shopify's storefront edge redirects
// unauthenticated /apps/* requests (e.g. on password-protected dev stores, or
// for domain/locale canonicalization), and browsers hard-fail any preflight
// that receives a redirect ("Redirect is not allowed for a preflight
// request"). This is a structural limitation, not a transient one, so App
// Proxy can never work as a fetch() target from an extension. The supported
// architecture is a direct fetch to the app's own backend, authenticated
// with a session token and answered with explicit CORS headers - which is
// exactly what the /api/* routes (via authenticate.public.*'s `cors()`
// helper) already implement.

function normalizeBackendUrl(url) {
  return url.replace(/\/+$/, '').replace(/\/api(\/[\w-]+)?$/i, '');
}

/** @param {string} url */
function isEphemeralDevTunnel(url) {
  try {
    const { hostname } = new URL(url);
    return /\.trycloudflare\.com$/i.test(hostname) || /\.ngrok(-free)?\.app$/i.test(hostname);
  } catch {
    return false;
  }
}

// Resolves the app's own direct backend URL for the given API path, from the
// merchant-configured `backend_api_url` extension setting value (read by the
// caller, since the `shopify` global's exact shape differs per extension
// target and isn't declared for this shared, non-target module).
export function getDirectBackendUrl(configuredSettingValue, path) {
  const configuredUrl = String(configuredSettingValue ?? '').trim();

  if (!configuredUrl) {
    console.error(
      '[bank-deposit-receipt] No backend_api_url configured. Set the "Backend API URL" ' +
        'extension setting (in the checkout customizer) to your app\'s current URL, e.g. the ' +
        'tunnel URL printed by `npm run dev`, or your production app URL.',
    );
    return null;
  }

  const normalizedBase = normalizeBackendUrl(configuredUrl);
  const url = `${normalizedBase}${path}`;

  if (isEphemeralDevTunnel(url)) {
    console.warn(
      '[bank-deposit-receipt] Configured backend_api_url is an ephemeral dev tunnel ' +
        '(trycloudflare.com/ngrok). It changes every time `shopify app dev` restarts - update ' +
        'the extension setting with the new URL whenever that happens.',
    );
  }

  return url;
}
