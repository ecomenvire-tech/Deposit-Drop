import db from "../db.server";
import { getUsageForShop } from "./plans.server";

export function getShopFromSessionToken(sessionToken) {
  const dest = sessionToken?.dest ?? "";
  return dest.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export async function parseReceiptUpload(request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let payload;
    try {
      const raw = await request.text();
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch (parseError) {
        console.error("[bank-deposit-receipt] Failed to parse JSON body:", parseError.message);
        console.error("[bank-deposit-receipt] Raw body preview:", raw.slice?.(0, 500) ?? raw);
        return { error: "Invalid JSON body" };
      }
    } catch (readError) {
      console.error("[bank-deposit-receipt] Failed to read request body:", readError.message);
      return { error: "Failed to read request body" };
    }

    const file = payload?.file;

    if (!file?.data || !file?.name) {
      return { error: "A receipt file is required." };
    }

    const imageData = Buffer.from(file.data, "base64");

    if (!imageData.length) {
      return { error: "Uploaded receipt file is empty." };
    }

    return {
      receipt: {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size ?? imageData.length,
        imageData,
      },
      orderId: payload?.orderId?.toString() ?? null,
      checkoutId: payload?.checkoutId?.toString() ?? null,
    };
  }

  const formData = await request.formData();
  const receiptFile = formData.get("bank-deposit-receipt");
  const orderId = formData.get("orderId")?.toString() ?? null;
  const checkoutId = formData.get("checkoutId")?.toString() ?? null;

  const isValidFile =
    receiptFile &&
    typeof receiptFile === "object" &&
    typeof receiptFile.arrayBuffer === "function";

  if (!isValidFile) {
    return {
      error: "A receipt file is required.",
      receiptFile: {
        value: receiptFile,
        type: typeof receiptFile,
        name: receiptFile?.name,
        size: receiptFile?.size,
        hasArrayBuffer: receiptFile && typeof receiptFile.arrayBuffer === "function",
      },
    };
  }

  const fileArrayBuffer = await receiptFile.arrayBuffer();
  const imageData = Buffer.from(fileArrayBuffer);

  return {
    receipt: {
      filename: receiptFile.name,
      mimeType: receiptFile.type || "application/octet-stream",
      size: receiptFile.size,
      imageData,
    },
    orderId,
    checkoutId,
  };
}

export function createJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function handleBankDepositReceiptUpload(request, shop) {
  console.log("[bank-deposit-receipt] Upload started for shop:", shop);

  const { plan, uploadsThisMonth, limitReached } = await getUsageForShop(shop);

  if (limitReached) {
    // This is a merchant billing/plan concern, not something the buyer at
    // checkout should see or needs to act on - the detailed reason is
    // logged here for the merchant/admin, but the buyer only gets a
    // generic, non-technical message.
    console.warn(
      `[bank-deposit-receipt] Upload limit reached for shop ${shop}: ` +
        `${uploadsThisMonth}/${plan.uploadLimit} (${plan.name} plan)`,
    );
    return createJsonResponse(
      {
        error: "Receipt upload is temporarily unavailable. Please contact the store for help completing your order.",
      },
      403,
    );
  }

  const parsedUpload = await parseReceiptUpload(request);

  if (parsedUpload.error) {
    console.error("[bank-deposit-receipt] Invalid upload payload:", parsedUpload);
    return createJsonResponse(
      {
        error: parsedUpload.error,
        ...(parsedUpload.receiptFile ? { receiptFile: parsedUpload.receiptFile } : {}),
      },
      400,
    );
  }

  const { receipt, orderId, checkoutId } = parsedUpload;
  console.log("[bank-deposit-receipt] File detected:", {
    filename: receipt.filename,
    mimeType: receipt.mimeType,
    size: receipt.size,
    checkoutId,
    orderId,
  });

  const savedReceipt = await db.bankDepositReceipt.create({
    data: {
      shop,
      orderId,
      checkoutId,
      filename: receipt.filename,
      mimeType: receipt.mimeType,
      size: receipt.size,
      imageData: receipt.imageData,
    },
  });

  console.log("[bank-deposit-receipt] Upload success, receiptId:", savedReceipt.id);

  return createJsonResponse({
    success: true,
    receiptId: savedReceipt.id,
    orderId,
    checkoutId,
  });
}

export function logIncomingRequest(request, routeLabel) {
  console.log("════════════════════════════════════════");
  console.log(`[bank-deposit-receipt] ${routeLabel} - request received`);
  console.log("════════════════════════════════════════");
  console.log("Time:", new Date().toISOString());
  console.log("Method:", request.method);
  console.log("URL:", request.url);
  console.log("Headers:", {
    origin: request.headers.get("origin"),
    authorization: request.headers.get("authorization") ? "present" : "missing",
    contentType: request.headers.get("content-type"),
    xRequestedWith: request.headers.get("x-requested-with"),
  });
}

export function logHandlerError(error) {
  console.error("════════════════════════════════════════");
  console.error("[bank-deposit-receipt] Upload failure");
  console.error("════════════════════════════════════════");
  console.error("Error name:", error?.name);
  console.error("Error message:", error?.message);
  console.error("Error stack:", error?.stack);
  console.error("════════════════════════════════════════");
}
