import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;
let hmrConfig;

if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    // Add custom middleware to bypass CSRF for API routes
    {
      name: "bypass-csrf-for-api",
      apply: "serve",
      configResolved(config) {
        return () => (req, res, next) => {
          // For API routes, skip React Router's CSRF check by handling early
          if (req.url?.startsWith("/api/")) {
            const origin = req.headers.origin;
            const isTrustedOrigin = origin?.includes("shopifycdn.com") ||
                                    origin?.includes("localhost") ||
                                    origin?.includes("127.0.0.1");

            // Set CORS headers for trusted origins
            if (isTrustedOrigin) {
              res.setHeader("Access-Control-Allow-Origin", origin);
              res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
              res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
              res.setHeader("Access-Control-Allow-Credentials", "true");

              // Handle preflight requests
              if (req.method === "OPTIONS") {
                res.writeHead(204);
                res.end();
                return;
              }
            }
          }
          next();
        };
      },
    },
    reactRouter(),
    tsconfigPaths()
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
});
