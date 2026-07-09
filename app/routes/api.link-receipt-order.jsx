import { authenticate } from "../shopify.server";
import {
  createJsonResponse,
  getShopFromSessionToken,
  logHandlerError,
  logIncomingRequest,
} from "../lib/bank-deposit-receipt.server";
import db from "../db.server";

export const action = async ({ request }) => {
  logIncomingRequest(request, "Order link route");

  try {
    const { sessionToken, cors } = await authenticate.public.checkout(request);
    const shop = getShopFromSessionToken(sessionToken);

    if (!shop) {
      console.error("[bank-deposit-receipt] Missing shop in session token");
      return cors(createJsonResponse({ error: "Invalid session token" }, 401));
    }

    const { checkoutToken, orderId, orderName } = await request.json();

    if (!checkoutToken || !orderId) {
      return cors(
        createJsonResponse({ error: "checkoutToken and orderId are required" }, 400),
      );
    }

    const receipt = await db.bankDepositReceipt.findFirst({
      where: { shop, checkoutId: checkoutToken, orderId: null },
    });

    if (!receipt) {
      console.log("[bank-deposit-receipt] No unlinked receipt found for checkoutToken:", checkoutToken);
      return cors(createJsonResponse({ linked: false }));
    }

    await db.bankDepositReceipt.update({
      where: { id: receipt.id },
      data: { orderId: String(orderId), orderName: orderName ?? null },
    });

    console.log(`[bank-deposit-receipt] Linked receipt ${receipt.id} to order ${orderName}`);

    return cors(createJsonResponse({ linked: true, receiptId: receipt.id }));
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    logHandlerError(error);
    return createJsonResponse(
      {
        error: "Internal server error",
        message: error?.message,
        stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
      },
      500,
    );
  }
};
