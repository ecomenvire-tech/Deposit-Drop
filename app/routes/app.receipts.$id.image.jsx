import { authenticate } from "../shopify.server";
import { verifyReceiptImageToken } from "../lib/receipt-image-token.server";
import db from "../db.server";

export const loader = async ({ request, params }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const tokenPayload = token ? verifyReceiptImageToken(token) : null;

  let shop;
  if (tokenPayload && String(tokenPayload.id) === params.id) {
    shop = tokenPayload.shop;
  } else {
    const { session } = await authenticate.admin(request);
    shop = session.shop;
  }

  const receipt = await db.bankDepositReceipt.findFirst({
    where: { id: Number(params.id), shop },
  });

  if (!receipt) {
    throw new Response("Not found", { status: 404 });
  }

  return new Response(receipt.imageData, {
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Disposition": `inline; filename="${receipt.filename}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
};
