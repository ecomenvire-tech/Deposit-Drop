import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [totalReceipts, linkedReceipts, recentReceipts, activeSubscription] =
    await Promise.all([
      db.bankDepositReceipt.count({ where: { shop } }),
      db.bankDepositReceipt.count({ where: { shop, orderId: { not: null } } }),
      db.bankDepositReceipt.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, filename: true, orderId: true, orderName: true, createdAt: true },
      }),
      db.subscription.findFirst({
        where: { shop, status: "active" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  return {
    totalReceipts,
    linkedReceipts,
    pendingReceipts: totalReceipts - linkedReceipts,
    recentReceipts,
    planName: activeSubscription?.plan.name ?? null,
  };
};

export default function Dashboard() {
  const { totalReceipts, linkedReceipts, pendingReceipts, recentReceipts, planName } =
    useLoaderData();

  return (
    <s-page heading="Dashboard">
      <s-section>
        <s-stack direction="block" gap="small">
          <s-heading>Welcome to DepositDrop 👋</s-heading>
          <s-paragraph>
            Manage your bank deposit receipts, subscription plan, and monitor
            upload activity from one place.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <s-card border>
            <s-stack direction="block" gap="small">
              <s-text tone="subdued">Total receipts</s-text>
              <s-heading>{totalReceipts}</s-heading>
            </s-stack>
          </s-card>
          <s-card border>
            <s-stack direction="block" gap="small">
              <s-text tone="subdued">Linked to orders</s-text>
              <s-heading>{linkedReceipts}</s-heading>
            </s-stack>
          </s-card>
          <s-card border>
            <s-stack direction="block" gap="small">
              <s-text tone="subdued">Awaiting order link</s-text>
              <s-heading>{pendingReceipts}</s-heading>
            </s-stack>
          </s-card>
          <s-card border>
            <s-stack direction="block" gap="small">
              <s-text tone="subdued">Current plan</s-text>
              <s-heading>{planName ?? "No active plan"}</s-heading>
            </s-stack>
          </s-card>
        </s-stack>
      </s-section>

      <s-section heading="Recent uploads">
        {recentReceipts.length === 0 ? (
          <s-paragraph>No receipts have been uploaded yet.</s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Receipt</s-table-header>
              <s-table-header listSlot="secondary">Order</s-table-header>
              <s-table-header listSlot="labeled">Uploaded</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recentReceipts.map((receipt) => (
                <s-table-row key={receipt.id}>
                  <s-table-cell>
                    <s-text>{receipt.filename}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {receipt.orderId ? (
                      <s-text>{receipt.orderName || `#${receipt.orderId}`}</s-text>
                    ) : (
                      <s-text tone="subdued">Not linked yet</s-text>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{new Date(receipt.createdAt).toLocaleString()}</s-text>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
        <s-link href="/app/receipts">View all receipts</s-link>
      </s-section>

      <s-section slot="aside" heading="Quick links">
        <s-stack direction="block" gap="small">
          <s-link href="/app/receipts">Manage receipts</s-link>
          <s-link href="/app/plans">Manage subscription</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
