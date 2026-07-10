import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { FEATURE_LIST } from "../lib/plans";
import {
  BILLING_IS_TEST,
  PAID_PLAN_SLUGS,
  ensurePlansSeeded,
  syncActiveSubscriptionFromBilling,
} from "../lib/plans.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  const canonicalSlugs = await ensurePlansSeeded();

  const plans = await db.plan.findMany({
    where: { slug: { in: canonicalSlugs } },
    orderBy: { priceCents: "asc" },
  });

  // Shopify is the source of truth for what's actually billed. Reconcile
  // our local mirror with it on every visit so upload-limit enforcement
  // (which reads the local table) never drifts from what the merchant is
  // really paying for.
  let billingCheck;
  try {
    billingCheck = await billing.check({ plans: PAID_PLAN_SLUGS, isTest: BILLING_IS_TEST });
  } catch (error) {
    console.error("[bank-deposit-receipt] billing.check failed:", error?.message);
    console.error(
      "[bank-deposit-receipt] billing.check response body:",
      JSON.stringify(error?.response?.body, null, 2),
    );
    throw error;
  }
  const activeSubscription = await syncActiveSubscriptionFromBilling(shop, billingCheck);

  const activePlan = activeSubscription
    ? plans.find((plan) => plan.id === activeSubscription.planId)
    : plans.find((plan) => plan.slug === "free");

  return {
    shop,
    plans,
    activePlanId: activePlan?.id ?? null,
    activeShopifySubscriptionId: activeSubscription?.shopifySubscriptionId ?? null,
  };
};

export const action = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cancel") {
    const subscriptionId = formData.get("subscriptionId");
    if (subscriptionId) {
      await billing.cancel({ subscriptionId, isTest: BILLING_IS_TEST, prorate: true });
    }
    await db.subscription.updateMany({
      where: { shop, status: "active" },
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

  if (plan.priceCents === 0) {
    // Free plan: nothing to bill. Cancel any real Shopify subscription first.
    const billingCheck = await billing.check({ plans: PAID_PLAN_SLUGS, isTest: BILLING_IS_TEST });
    for (const appSubscription of billingCheck.appSubscriptions) {
      await billing.cancel({
        subscriptionId: appSubscription.id,
        isTest: BILLING_IS_TEST,
        prorate: true,
      });
    }

    await db.subscription.updateMany({
      where: { shop, status: "active" },
      data: { status: "cancelled" },
    });
    await db.subscription.create({ data: { shop, planId: plan.id, status: "active" } });

    return { success: "Switched to the Free plan." };
  }

  // Paid plan: this always throws a redirect to Shopify's approval page on
  // success. On failure it throws a BillingError (a plain Error, not a
  // Response) - catch that specifically so we can log Shopify's actual
  // userErrors detail instead of a bare "Error while billing the store".
  //
  // No returnUrl is passed here on purpose: without one, the library builds
  // a proper Shopify-hosted embedded app URL (admin.shopify.com/store/...)
  // to return to after approval. A custom bare app/tunnel URL doesn't carry
  // the shop/host params our embedding logic needs, so the merchant's
  // browser gets stuck outside the embedded frame with nowhere to bounce
  // back to.
  console.log("[bank-deposit-receipt] Requesting billing for plan:", plan.slug, {
    isTest: BILLING_IS_TEST,
  });

  try {
    await billing.request({
      plan: plan.slug,
      isTest: BILLING_IS_TEST,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("[bank-deposit-receipt] billing.request failed:", error?.message);
    console.error("[bank-deposit-receipt] billing.request errorData:", JSON.stringify(error?.errorData));
    return {
      error: `Billing request failed: ${error?.errorData?.[0]?.message || error?.message || "unknown error"}`,
    };
  }

  return null;
};

const CARD_STYLE = {
  padding: "14px",
  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.12)",
  borderRadius: "10px",
};

export default function Plans() {
  const { plans, activePlanId, activeShopifySubscriptionId } = useLoaderData();
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

                    {isActive && plan.priceCents > 0 ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="cancel" />
                        <input
                          type="hidden"
                          name="subscriptionId"
                          value={activeShopifySubscriptionId ?? ""}
                        />
                        <s-button type="submit" variant="secondary">
                          Cancel the plan
                        </s-button>
                      </Form>
                    ) : isActive ? null : (
                      // reloadDocument forces a real full-page form POST
                      // instead of a fetch-based SPA transition. Paid plans
                      // redirect out of the embedded iframe to Shopify's own
                      // billing approval page, and that special redirect
                      // signal only reaches the browser correctly on a real
                      // navigation - a fetch/XHR submission gets a 401 with
                      // custom headers instead, which React Router's single
                      // fetch data layer doesn't relay, leaving the page
                      // stuck.
                      <Form method="post" reloadDocument>
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
