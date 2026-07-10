import { authenticate } from "../shopify.server";

// Mandatory Shopify compliance webhook. This app never stores
// customer-identifying data (name, email, or customer ID) - the
// BankDepositReceipt model only holds shop/order/checkout identifiers and
// the receipt image itself - so there is no customer data to compile or
// hand over here.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(
    `[bank-deposit-receipt] No customer-identifying data is stored by this app; nothing to provide for customer ${
      payload?.customer?.id ?? "unknown"
    }.`,
  );

  return new Response();
};
