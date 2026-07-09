import { authenticate } from "../shopify.server";
import db from "../db.server";

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(receipts) {
  const header = ["ID", "Filename", "Order", "Checkout ID", "Uploaded At"];
  const rows = receipts.map((receipt) =>
    [
      receipt.id,
      csvEscape(receipt.filename),
      csvEscape(receipt.orderName || (receipt.orderId ? `#${receipt.orderId}` : "Not linked")),
      csvEscape(receipt.checkoutId),
      new Date(receipt.createdAt).toISOString(),
    ].join(","),
  );

  return [header.join(","), ...rows].join("\r\n");
}

const RECEIPT_SELECT = {
  id: true,
  filename: true,
  checkoutId: true,
  orderId: true,
  orderName: true,
  createdAt: true,
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  let receipts;

  if (mode === "ids") {
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));

    receipts = ids.length
      ? await db.bankDepositReceipt.findMany({
          where: { shop, id: { in: ids } },
          orderBy: { createdAt: "desc" },
          select: RECEIPT_SELECT,
        })
      : [];
  } else {
    const query = url.searchParams.get("q")?.trim() ?? "";
    receipts = await db.bankDepositReceipt.findMany({
      where: {
        shop,
        ...(query
          ? {
              OR: [
                { orderName: { contains: query } },
                { orderId: { contains: query } },
                { checkoutId: { contains: query } },
                { filename: { contains: query } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: RECEIPT_SELECT,
    });
  }

  return new Response(toCsv(receipts), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="receipts-export.csv"`,
    },
  });
};
