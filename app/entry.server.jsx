import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  reactRouterContext,
) {
  const url = new URL(request.url);
  const isPublicApiRoute =
    url.pathname.startsWith("/api/") || url.pathname.startsWith("/app-proxy/");

  // For API and app-proxy routes, bypass CSRF checks by modifying the request origin
  // This allows Shopify extension iframe requests (from extensions.shopifycdn.com)
  // to reach our backend on the tunnel URL
  if (isPublicApiRoute) {
    const origin = request.headers.get("origin");
    const isTrustedOrigin = origin?.includes("shopifycdn.com") ||
                            origin?.includes("localhost") ||
                            origin?.includes("127.0.0.1");

    if (isTrustedOrigin && origin !== url.origin) {
      // Create a new request with modified headers to pass CSRF check
      const newHeaders = new Headers(request.headers);
      newHeaders.set("origin", url.origin); // Make origin match server's host
      request = new Request(request, { headers: newHeaders });
    }
  } else {
    // Only add document response headers for non-API routes
    addDocumentResponseHeaders(request, responseHeaders);
  }

  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}

// Export an error handler to bypass CSRF checks for API routes
export function handleError(error, { request }) {
  const url = new URL(request.url);
  const isPublicApiRoute =
    url.pathname.startsWith("/api/") || url.pathname.startsWith("/app-proxy/");

  // If it's a CSRF error on a public API route from a trusted origin, allow it
  if (isPublicApiRoute && error?.message?.includes("host does not match")) {
    const origin = request.headers.get("origin");
    const isTrustedOrigin = origin?.includes("shopifycdn.com") ||
                            origin?.includes("localhost") ||
                            origin?.includes("127.0.0.1");

    if (isTrustedOrigin) {
      console.log("✅ Bypassing CSRF check for API route from trusted origin");
      // Return a plain response instead of throwing the error
      return new Response(null, { status: 204 });
    }
  }

  // For other errors, log and re-throw
  console.error("Error:", error);
}
