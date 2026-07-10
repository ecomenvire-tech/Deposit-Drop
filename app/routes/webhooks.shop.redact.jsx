import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory Shopify compliance webhook, sent 48 hours after a shop
// uninstalls the app. Unlike the customer-scoped compliance webhooks, this
// one is actionable: we do store shop-scoped data (receipts, subscriptions,
// sessions), so it must all be erased here.
export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const [receipts, subscriptions, sessions] = await Promise.all([
    db.bankDepositReceipt.deleteMany({ where: { shop } }),
    db.subscription.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  console.log(
    `[bank-deposit-receipt] Shop redact for ${shop}: deleted ${receipts.count} receipts, ` +
      `${subscriptions.count} subscriptions, ${sessions.count} sessions.`,
  );

  return new Response();
};
