import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory Shopify compliance webhooks. Unlike regular webhook topics,
// these three (customers/data_request, customers/redact, shop/redact) are
// declared together under a single `compliance_topics` subscription in
// shopify.app.toml and all delivered to this one route - Shopify rejects
// them if declared as separate `topics` subscriptions.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const normalizedTopic = topic.toLowerCase();

  if (normalizedTopic.includes("data_request")) {
    // This app never stores customer-identifying data (name, email, or
    // customer ID) - BankDepositReceipt only holds shop/order/checkout
    // identifiers and the receipt image itself, so there's no customer
    // data to compile or hand over here.
    console.log(
      `[bank-deposit-receipt] No customer-identifying data is stored by this app; nothing to provide for customer ${
        payload?.customer?.id ?? "unknown"
      }.`,
    );
  } else if (normalizedTopic.includes("customers") && normalizedTopic.includes("redact")) {
    console.log(
      `[bank-deposit-receipt] No customer-identifying data is stored by this app; nothing to redact for customer ${
        payload?.customer?.id ?? "unknown"
      }.`,
    );
  } else if (normalizedTopic.includes("shop") && normalizedTopic.includes("redact")) {
    // Shopify requires all shop data to be erased 48 hours after uninstall.
    const [receipts, subscriptions, sessions] = await Promise.all([
      db.bankDepositReceipt.deleteMany({ where: { shop } }),
      db.subscription.deleteMany({ where: { shop } }),
      db.session.deleteMany({ where: { shop } }),
    ]);
    console.log(
      `[bank-deposit-receipt] Shop redact for ${shop}: deleted ${receipts.count} receipts, ` +
        `${subscriptions.count} subscriptions, ${sessions.count} sessions.`,
    );
  } else {
    console.warn(`[bank-deposit-receipt] Unexpected compliance topic: ${topic}`);
  }

  return new Response();
};
