import { authenticate } from "../shopify.server";

// Mandatory Shopify compliance webhook. Same reasoning as
// customers/data_request: this app never stores customer-identifying data,
// so there is nothing tied to this specific customer to erase.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(
    `[bank-deposit-receipt] No customer-identifying data is stored by this app; nothing to redact for customer ${
      payload?.customer?.id ?? "unknown"
    }.`,
  );

  return new Response();
};
