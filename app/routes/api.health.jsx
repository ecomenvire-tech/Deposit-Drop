import { authenticate } from "../shopify.server";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export const loader = async ({ request }) => {
  console.log("[health] GET request received");

  try {
    const { cors } = await authenticate.public.checkout(request);
    return cors(jsonResponse({ status: "ok", route: "api.health", timestamp: new Date().toISOString() }));
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    return jsonResponse({ status: "ok", route: "api.health", timestamp: new Date().toISOString() });
  }
};

export const action = async ({ request }) => {
  console.log("[health] POST request received, method:", request.method);

  try {
    const { cors } = await authenticate.public.checkout(request);
    return cors(jsonResponse({ status: "ok", route: "api.health", timestamp: new Date().toISOString() }));
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    return jsonResponse({ status: "ok", route: "api.health", timestamp: new Date().toISOString() });
  }
};
