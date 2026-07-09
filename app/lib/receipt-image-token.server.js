import crypto from "node:crypto";

const SECRET = process.env.SHOPIFY_API_SECRET || "";

function sign(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

// Short-lived signed token so <img> tags (which can't carry the App Bridge
// session token header) can load a receipt image without a full admin
// re-authentication round trip.
export function createReceiptImageToken(receiptId, shop, ttlMs = 30 * 60 * 1000) {
  const payloadB64 = Buffer.from(
    JSON.stringify({ id: receiptId, shop, exp: Date.now() + ttlMs }),
  ).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyReceiptImageToken(token) {
  if (!token || !token.includes(".")) return null;

  const [payloadB64, signature] = token.split(".");
  const expectedSignature = sign(payloadB64);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    return { id: payload.id, shop: payload.shop };
  } catch {
    return null;
  }
}
