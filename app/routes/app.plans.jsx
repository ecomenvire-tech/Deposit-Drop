import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { FEATURE_LIST } from "../lib/plans";
import { ensurePlansSeeded } from "../lib/plans.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const canonicalSlugs = await ensurePlansSeeded();

  const plans = await db.plan.findMany({
    where: { slug: { in: canonicalSlugs } },
    orderBy: { priceCents: "asc" },
  });

  const activeSubscription = await db.subscription.findFirst({
    where: { shop, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  return {
    shop,
    plans,
    activePlanId: activeSubscription?.planId ?? null,
    activeSubscriptionId: activeSubscription?.id ?? null,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cancel") {
    const subscriptionId = Number(formData.get("subscriptionId"));
    await db.subscription.updateMany({
      where: { id: subscriptionId, shop, status: "active" },
      data: { status: "cancelled" },
    });
    return { success: "Subscription cancelled." };
  }

  const planId = Number(formData.get("planId"));
  if (!planId) {
    return { error: "Please select a plan before subscribing." };
  }

  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    return { error: "Selected plan was not found." };
  }

  await db.subscription.updateMany({
    where: { shop, status: "active" },
    data: { status: "cancelled" },
  });

  const subscription = await db.subscription.create({
    data: { shop, planId, status: "active" },
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

const CARD_STYLE = {
  padding: "14px",
  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.12)",
  borderRadius: "10px",
};

export default function Plans() {
  const { plans, activePlanId, activeSubscriptionId } = useLoaderData();
  const actionData = useActionData();

  const planFeatureKeys = Object.fromEntries(
    plans.map((plan) => [plan.id, JSON.parse(plan.features || "[]")]),
  );

  return (
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
        <style>{`
          .plans-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
          }
          .plan-card-col {
            box-sizing: border-box;
            flex: 1 1 calc(33.333% - 16px);
            min-width: 260px;
          }
          .plan-card-col > s-card {
            display: block;
            width: 100%;
            box-sizing: border-box;
          }
          @media (max-width: 700px) {
            .plan-card-col {
              flex: 1 1 100%;
            }
          }
        `}</style>
        <div className="plans-grid">
          {plans.map((plan) => {
            const isActive = plan.id === activePlanId;
            const featureKeys = planFeatureKeys[plan.id];
            const featureLabels = FEATURE_LIST.filter((feature) =>
              featureKeys.includes(feature.key),
            ).map((feature) => feature.label);

            return (
              <div key={plan.id} className="plan-card-col">
                <s-card border style={CARD_STYLE}>
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="small">
                      <s-heading>{plan.name}</s-heading>
                      {isActive ? (
                        <s-badge tone="success">Current plan</s-badge>
                      ) : plan.popular ? (
                        <s-badge tone="info">Popular</s-badge>
                      ) : null}
                    </s-stack>

                    <s-text tone="subdued">{plan.description}</s-text>

                    <s-unordered-list>
                      <s-list-item>{`Up to ${plan.uploadLimit} receipt uploads/month`}</s-list-item>
                      {featureLabels.map((label) => (
                        <s-list-item key={label}>{label}</s-list-item>
                      ))}
                    </s-unordered-list>

                    {plan.priceCents === 0 ? (
                      <s-heading>Free</s-heading>
                    ) : (
                      <s-stack direction="inline" gap="small-100">
                        <s-heading>{`$${(plan.priceCents / 100).toFixed(2)}`}</s-heading>
                        <s-text tone="subdued">/month</s-text>
                      </s-stack>
                    )}

                    {isActive ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="cancel" />
                        <input type="hidden" name="subscriptionId" value={activeSubscriptionId} />
                        <s-button type="submit" variant="secondary">
                          Cancel the plan
                        </s-button>
                      </Form>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="planId" value={plan.id} />
                        <s-button type="submit" variant="primary">
                          Choose this plan
                        </s-button>
                      </Form>
                    )}
                  </s-stack>
                </s-card>
              </div>
            );
          })}
        </div>
      </s-section>
    </s-page>
  );
}
