import db from "../db.server";
import { CANONICAL_PLANS, toPlanRow } from "./plans";

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
