import { authenticate } from "../shopify.server";
import {
  createJsonResponse,
  getShopFromSessionToken,
  handleBankDepositReceiptUpload,
  logHandlerError,
  logIncomingRequest,
} from "../lib/bank-deposit-receipt.server";

export const action = async ({ request }) => {
  logIncomingRequest(request, "API route");

  try {
    const { sessionToken, cors } = await authenticate.public.checkout(request);
    const shop = getShopFromSessionToken(sessionToken);

    if (!shop) {
      console.error("[bank-deposit-receipt] Missing shop in session token");
      return cors(createJsonResponse({ error: "Invalid session token" }, 401));
    }

    console.log("[bank-deposit-receipt] Session token validated for shop:", shop);

    const response = await handleBankDepositReceiptUpload(request, shop);
    return cors(response);
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
