// Pure plan/feature data - safe to import from client-rendered route
// components. Server-only logic that touches the database (seeding,
// resolving a shop's effective plan) lives in ./plans.server.js instead.

// Canonical list of comparable features, in the order they should appear in
// the feature comparison table. Each plan below references a subset of these
// by key, so the pricing cards and the comparison table both stay in sync
// with a single source of truth instead of duplicating feature copy.
export const FEATURE_LIST = [
  { key: "manual_linking", label: "Manual order linking" },
  { key: "auto_linking", label: "Automatic order linking" },
  { key: "dashboard", label: "Admin dashboard" },
  { key: "search", label: "Search & filter receipts" },
  { key: "email_support", label: "Email support" },
  { key: "priority_support", label: "Priority email support" },
];

export const CANONICAL_PLANS = [
  {
    slug: "free",
    name: "Free",
    priceCents: 0,
    uploadLimit: 5,
    description: "Try DepositDrop with a small number of receipts, on us.",
    popular: false,
    featureKeys: ["manual_linking", "dashboard"],
  },
  {
    slug: "starter",
    name: "Starter",
    priceCents: 1500,
    uploadLimit: 30,
    description: "For stores just getting started with bank deposit receipts.",
    popular: false,
    featureKeys: ["manual_linking", "dashboard", "email_support"],
  },
  {
    slug: "advance",
    name: "Advance",
    priceCents: 2500,
    uploadLimit: 100,
    description: "For growing stores that need automatic order matching.",
    popular: true,
    featureKeys: ["auto_linking", "dashboard", "search", "priority_support"],
  },
];

export function toPlanRow(plan) {
  return {
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    uploadLimit: plan.uploadLimit,
    features: JSON.stringify(plan.featureKeys),
    popular: plan.popular,
  };
}
