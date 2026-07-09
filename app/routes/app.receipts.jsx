import { useEffect, useRef, useState } from "react";
import { Form, useLoaderData, useNavigation, useSearchParams, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { createReceiptImageToken } from "../lib/receipt-image-token.server";
import db from "../db.server";

const SEARCH_DEBOUNCE_MS = 300;

const PAGE_SIZE = 30;

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const where = {
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
  };

  const [receipts, totalCount] = await Promise.all([
    db.bankDepositReceipt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        checkoutId: true,
        orderId: true,
        orderName: true,
        createdAt: true,
      },
    }),
    db.bankDepositReceipt.count({ where }),
  ]);

  // <img> requests don't carry the App Bridge session token, so the
  // authenticated /app/receipts/:id/image route can't be used directly here.
  // Each thumbnail instead gets a short-lived signed token (separate from
  // admin auth) scoped to this shop, so the browser can lazy-load images
  // individually instead of the page embedding every full-size image inline.
  const receiptsWithThumbnails = receipts.map((receipt) => ({
    ...receipt,
    thumbnailSrc: `/app/receipts/${receipt.id}/image?token=${encodeURIComponent(
      createReceiptImageToken(receipt.id, shop),
    )}`,
  }));

  return {
    shop,
    receipts: receiptsWithThumbnails,
    query,
    page,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    totalCount,
  };
};

export default function Receipts() {
  const { shop, receipts, query, page, totalPages, totalCount } = useLoaderData();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const searchDebounceRef = useRef(null);
  const shopify = useAppBridge();
  const [isExporting, setIsExporting] = useState(false);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  // Selection is scoped to the currently loaded search/page results, so drop
  // it whenever those change underneath the user.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }, [query, page]);

  const toggleSelected = (id) => {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelectAllMatching(false);
    setSelectedIds(new Set(receipts.map((receipt) => receipt.id)));
  };

  const selectAllInDashboard = () => {
    setSelectedIds(new Set());
    setSelectAllMatching(true);
  };

  const selectionCount = selectAllMatching ? totalCount : selectedIds.size;

  const allOnPageSelected =
    receipts.length > 0 &&
    receipts.every((receipt) => selectAllMatching || selectedIds.has(receipt.id));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectAllMatching(false);
      setSelectedIds(new Set());
    } else {
      selectAllOnPage();
    }
  };

  // Downloaded via a background fetch + blob instead of a full navigation:
  // navigating the embedded app iframe straight to an authenticated route
  // triggers Shopify's document-load session bounce, which can get visibly
  // stuck since this is a background action, not a real page load.
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectAllMatching) {
        params.set("mode", "all");
        if (query) params.set("q", query);
      } else {
        params.set("mode", "ids");
        params.set("ids", Array.from(selectedIds).join(","));
      }

      const token = await shopify.idToken();
      const response = await fetch(`/app/receipts/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Export failed: HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "receipts-export.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("[bank-deposit-receipt] Export failed:", error);
      shopify.toast.show("Export failed. Please try again.", { isError: true });
    } finally {
      setIsExporting(false);
    }
  };

  const goToPage = (newPage) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(newPage));
    submit(params, { method: "get" });
  };

  const handleSearchInput = (event) => {
    const value = event.target.value;

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      params.delete("page");
      submit(params, { method: "get" });
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <s-page heading="Bank deposit receipts">
      <s-section heading="Uploaded receipts">
        <s-stack direction="inline" gap="small" inlineAlignment="end">
          <s-button command="--toggle" commandFor="export-menu">
            Export
          </s-button>
        </s-stack>

        <s-popover id="export-menu">
          <s-stack direction="block" gap="small">
            <s-button variant="tertiary" onClick={selectAllOnPage}>
              {`Select all ${receipts.length} on this page`}
            </s-button>
            <s-button variant="tertiary" onClick={selectAllInDashboard}>
              {`Select all ${totalCount} matching receipts`}
            </s-button>
            <s-button
              variant="primary"
              disabled={selectionCount === 0 || isExporting}
              loading={isExporting}
              onClick={handleExport}
            >
              {isExporting ? "Exporting…" : `Export ${selectionCount} selected`}
            </s-button>
          </s-stack>
        </s-popover>

        <s-table
          variant="auto"
          loading={isLoading}
          paginate
          hasPreviousPage={page > 1}
          hasNextPage={page < totalPages}
          onPreviousPage={() => goToPage(page - 1)}
          onNextPage={() => goToPage(page + 1)}
        >
          <Form method="get" slot="filters">
            <s-search-field
              name="q"
              label="Search"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search by order number or confirmation code"
              defaultValue={query}
              onInput={handleSearchInput}
            />
          </Form>

          <s-table-header-row>
            <s-table-header listSlot="kicker">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleSelectAllOnPage}
                aria-label="Select all receipts on this page"
              />
            </s-table-header>
            <s-table-header listSlot="primary">Receipt</s-table-header>
            <s-table-header listSlot="secondary">Order</s-table-header>
            <s-table-header listSlot="labeled">Uploaded</s-table-header>
            <s-table-header listSlot="inline">Image</s-table-header>
          </s-table-header-row>

          <s-table-body>
            {receipts.map((receipt) => (
              <s-table-row key={receipt.id}>
                <s-table-cell>
                  <input
                    type="checkbox"
                    checked={selectAllMatching || selectedIds.has(receipt.id)}
                    onChange={() => toggleSelected(receipt.id)}
                  />
                </s-table-cell>
                <s-table-cell>
                  <s-clickable command="--show" commandFor={`receipt-modal-${receipt.id}`}>
                    <img
                      src={receipt.thumbnailSrc}
                      alt={receipt.filename}
                      width="48"
                      height="48"
                      style={{ objectFit: "cover", borderRadius: "4px", cursor: "pointer" }}
                    />
                  </s-clickable>
                  <s-modal id={`receipt-modal-${receipt.id}`} heading={receipt.filename} size="large">
                    <img
                      src={receipt.thumbnailSrc}
                      alt={receipt.filename}
                      style={{ maxWidth: "100%", height: "auto" }}
                    />
                  </s-modal>
                </s-table-cell>
                <s-table-cell>
                  {receipt.orderId ? (
                    <s-link
                      href={`https://${shop}/admin/orders/${receipt.orderId}`}
                      target="_blank"
                    >
                      {receipt.orderName || `#${receipt.orderId}`}
                    </s-link>
                  ) : (
                    <s-text tone="subdued">Not linked yet</s-text>
                  )}
                </s-table-cell>
                <s-table-cell>
                  <s-text>{new Date(receipt.createdAt).toLocaleString()}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-link href={receipt.thumbnailSrc} target="_blank">
                    View
                  </s-link>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>

        {receipts.length === 0 ? (
          <s-paragraph>
            {query
              ? `No receipts match "${query}".`
              : "No receipts have been uploaded yet."}
          </s-paragraph>
        ) : (
          <s-text tone="subdued">{`Page ${page} of ${totalPages} · ${totalCount} receipts`}</s-text>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
