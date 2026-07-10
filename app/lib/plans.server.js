import db from "../db.server";
import { CANONICAL_PLANS, toPlanRow } from "./plans";

// Defaults to test mode (no real charges) unless explicitly disabled for a
// production launch: set SHOPIFY_BILLING_TEST_MODE=false in the environment.
export const BILLING_IS_TEST = process.env.SHOPIFY_BILLING_TEST_MODE !== "false";

// Plan slugs that are billed through Shopify (must match the keys under
// `billing` in app/shopify.server.js). The Free plan is excluded - it's
// never charged, so it only ever exists in our own tables.
export const PAID_PLAN_SLUGS = CANONICAL_PLANS.filter((plan) => plan.priceCents > 0).map(
  (plan) => plan.slug,
);

// Upserts the current canonical plan set and removes any older/renamed plan
// rows that nothing is subscribed to. Safe to call on every Plans page load.
export async function ensurePlansSeeded() {
  const canonicalSlugs = CANONICAL_PLANS.map((plan) => plan.slug);

  await Promise.all(
    CANONICAL_PLANS.map((plan) =>
      db.plan.upsert({
        where: { slug: plan.slug },
        update: toPlanRow(plan),
        create: { slug: plan.slug, ...toPlanRow(plan) },
      }),
    ),
  );

  await db.plan.deleteMany({
    where: { slug: { notIn: canonicalSlugs }, subscriptions: { none: {} } },
  });

  return canonicalSlugs;
}

// The plan that should govern a shop's current limits: its active
// subscription's plan, or the Free plan if it has never subscribed to
// anything. Creates the Free plan row on demand so upload limits are
// enforced even before a merchant ever visits the Plans page.
export async function getEffectivePlanForShop(shop) {
  const activeSubscription = await db.subscription.findFirst({
    where: { shop, status: "active" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  if (activeSubscription) {
    return activeSubscription.plan;
  }

  const freePlanDefaults = CANONICAL_PLANS.find((plan) => plan.slug === "free");
  return db.plan.upsert({
    where: { slug: "free" },
    update: {},
    create: { slug: "free", ...toPlanRow(freePlanDefaults) },
  });
}

// Reconciles our local Subscription mirror with Shopify's real billing
// state, so the rest of the app (upload-limit enforcement, the Plans page)
// can keep reading a simple local "active" row instead of calling Shopify's
// Billing API on every request. Call this after billing.check().
export async function syncActiveSubscriptionFromBilling(shop, billingCheckResult) {
  const activeAppSubscription = billingCheckResult.appSubscriptions[0] ?? null;

  if (!activeAppSubscription) {
    // No active Shopify subscription - the shop is effectively on the Free
    // plan. Make sure our local mirror doesn't still say otherwise.
    const currentActive = await db.subscription.findFirst({
      where: { shop, status: "active" },
      include: { plan: true },
    });
    if (currentActive && currentActive.plan.slug !== "free") {
      await db.subscription.updateMany({
        where: { shop, status: "active" },
        data: { status: "cancelled" },
      });
    }
    return null;
  }

  const plan = await db.plan.findUnique({ where: { slug: activeAppSubscription.name } });
  if (!plan) {
    console.warn(
      `[plans] Active Shopify subscription name "${activeAppSubscription.name}" doesn't match any known plan slug`,
    );
    return null;
  }

  const alreadySynced = await db.subscription.findFirst({
    where: {
      shop,
      status: "active",
      planId: plan.id,
      shopifySubscriptionId: activeAppSubscription.id,
    },
  });
  if (alreadySynced) {
    return alreadySynced;
  }

  await db.subscription.updateMany({
    where: { shop, status: "active" },
    data: { status: "cancelled" },
  });

  return db.subscription.create({
    data: {
      shop,
      planId: plan.id,
      status: "active",
      shopifySubscriptionId: activeAppSubscription.id,
    },
  });
}
