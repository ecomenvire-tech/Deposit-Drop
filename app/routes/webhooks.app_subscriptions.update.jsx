import { authenticate } from "../shopify.server";
import db from "../db.server";

// Keeps our local Subscription mirror in sync when a subscription's status
// changes somewhere we don't control directly - e.g. the merchant cancels
// from their own Shopify admin billing page instead of from inside this app,
// or Shopify auto-cancels for a failed/declined charge. This is a
// convenience sync; the Plans page itself also reconciles via
// billing.check() on every load, so the app works correctly even if this
// webhook is ever unavailable.
export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const appSubscription = payload?.app_subscription;
  if (!appSubscription) {
    return new Response();
  }

  if (appSubscription.status !== "ACTIVE") {
    await db.subscription.updateMany({
      where: {
        shop,
        status: "active",
        shopifySubscriptionId: appSubscription.admin_graphql_api_id,
      },
      data: { status: "cancelled" },
    });
    console.log(
      `[bank-deposit-receipt] Subscription ${appSubscription.admin_graphql_api_id} marked ${appSubscription.status} for ${shop}`,
    );
  }

  return new Response();
};
