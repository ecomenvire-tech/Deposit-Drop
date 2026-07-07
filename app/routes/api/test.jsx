// Simple test endpoint to verify CORS headers are being sent
export const action = async ({ request }) => {
  console.log("🧪 TEST ENDPOINT - Method:", request.method);
  console.log("🧪 Headers:", Object.fromEntries(request.headers));

  // Handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      },
    });
  }

  if (request.method === "GET") {
    return new Response(JSON.stringify({ message: "GET works" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
      },
    });
  }

  if (request.method === "POST") {
    console.log("🧪 POST received, processing...");

    const contentType = request.headers.get("content-type");
    console.log("🧪 Content-Type:", contentType);

    try {
      const formData = await request.formData();
      console.log("🧪 FormData entries:");
      for (const [key, value] of formData) {
        console.log(`  - ${key}: ${value instanceof File ? `File(${value.size} bytes)` : value}`);
      }

      return new Response(
        JSON.stringify({
          message: "POST works",
          dataReceived: Array.from(formData.entries()).map(([k, v]) => [
            k,
            v instanceof File ? { name: v.name, size: v.size, type: v.type } : v,
          ]),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    } catch (error) {
      console.error("🧪 Error:", error.message);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
          },
        }
      );
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
    },
  });
};
