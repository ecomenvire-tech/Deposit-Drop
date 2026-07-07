import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const shop = admin.session.shop;

  let plans = await db.plan.findMany({ orderBy: { priceCents: "asc" } });
  if (plans.length === 0) {
    const defaultPlans = [
      {
        name: "Starter",
        slug: "starter",
        priceCents: 1500,
        description: "Basic plan for stores that need receipt uploads and simple order tracking.",
      },
      {
        name: "Premium",
        slug: "premium",
        priceCents: 3500,
        description: "Premium plan with priority support and advanced reporting.",
      },
    ];

    await Promise.all(defaultPlans.map((plan) => db.plan.create({ data: plan })));
    plans = await db.plan.findMany({ orderBy: { priceCents: "asc" } });
  }

  const subscriptions = await db.subscription.findMany({
    where: { shop },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  return { shop, plans, subscriptions };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const planId = Number((await request.formData()).get("planId"));

  if (!planId) {
    return { error: "Please select a plan before subscribing." };
  }

  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    return { error: "Selected plan was not found." };
  }

  const subscription = await db.subscription.create({
    data: {
      shop: admin.session.shop,
      planId,
      status: "active",
    },
  });

  return {
    success: `Subscribed to the ${plan.name} plan successfully.`,
    subscription: {
      id: subscription.id,
      planName: plan.name,
      priceCents: plan.priceCents,
      status: subscription.status,
    },
  };
};

export default function Plans() {
  const { plans, subscriptions } = useLoaderData();
  const actionData = useActionData();

  return (
    <>
      <s-page heading="Subscription plans">
        <s-section>
          <s-paragraph>
            Choose a plan for your app and manage subscription settings from here.
          </s-paragraph>
        </s-section>

        {actionData?.error ? (
          <s-banner status="critical">{actionData.error}</s-banner>
        ) : null}

        {actionData?.success ? (
          <s-banner status="success">{actionData.success}</s-banner>
        ) : null}

        <s-section heading="Available plans">
          <s-stack direction="block" gap="base">
            {plans.map((plan) => (
              <s-card key={plan.id} border>
                <s-stack direction="block" gap="small">
                  <s-heading>{plan.name}</s-heading>
                  <s-text>{plan.description}</s-text>
                  <s-text>{`$${(plan.priceCents / 100).toFixed(2)} / month`}</s-text>
                  <Form method="post">
                    <input type="hidden" name="planId" value={plan.id} />
                    <s-button type="submit">Subscribe</s-button>
                  </Form>
                </s-stack>
              </s-card>
            ))}
          </s-stack>
        </s-section>

        <s-section heading="Your subscriptions">
          {subscriptions.length === 0 ? (
            <s-text>No subscriptions found for this shop yet.</s-text>
          ) : (
            <s-stack direction="block" gap="base">
              {subscriptions.map((subscription) => (
                <s-card key={subscription.id} border>
                  <s-stack direction="block" gap="small">
                    <s-heading>{subscription.plan.name}</s-heading>
                    <s-text>{`Status: ${subscription.status}`}</s-text>
                    <s-text>{`Subscribed at: ${new Date(
                      subscription.createdAt,
                    ).toLocaleString()}`}</s-text>
                  </s-stack>
                </s-card>
              ))}
            </s-stack>
          )}
        </s-section>
      </s-page>
    </>
  );
}
