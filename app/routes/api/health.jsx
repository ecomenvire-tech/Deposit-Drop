// Super simple health check endpoint
export const action = async ({ request }) => {
  console.log("🏥 HEALTH CHECK - Method:", request.method);

  // Handle preflight
  if (request.method === "OPTIONS") {
    console.log("✅ Health check OPTIONS");
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
      },
    });
  }

  if (request.method === "GET" || request.method === "POST") {
    console.log("✅ Health check GET/POST");
    return new Response(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
        },
      }
    );
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
    },
  });
};

export const loader = async ({ request }) => {
  console.log("🏥 HEALTH CHECK LOADER - GET request");

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  return new Response(
    JSON.stringify({ status: "ok from loader", timestamp: new Date().toISOString() }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
      },
    }
  );
};
