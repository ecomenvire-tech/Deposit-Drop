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

    let receipt = await db.bankDepositReceipt.findFirst({
      where: { shop, checkoutId: checkoutToken, orderId: null },
    });

    if (!receipt) {
      // The checkout extension can occasionally report a stale
      // checkoutToken (e.g. the checkout page/session got reused without a
      // fresh reload), so the receipt ends up saved under a token that
      // never matches the one this Thank You page sees. As a safety net,
      // fall back to the shop's most recent still-unlinked receipt as long
      // as it was uploaded recently - only one checkout is realistically in
      // flight per buyer at a time, so this is a safe substitute for an
      // exact token match.
      const RECENT_WINDOW_MS = 30 * 60 * 1000;
      receipt = await db.bankDepositReceipt.findFirst({
        where: {
          shop,
          orderId: null,
          createdAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) },
        },
        orderBy: { createdAt: "desc" },
      });

      if (receipt) {
        console.warn(
          `[bank-deposit-receipt] No exact checkoutToken match for "${checkoutToken}"; ` +
            `falling back to most recent unlinked receipt ${receipt.id} (checkoutId: ${receipt.checkoutId})`,
        );
      }
    }

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
