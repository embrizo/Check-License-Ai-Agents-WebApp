/**
 * Commercial plan presets — the quota numbers behind the Basic / Standard / Pro
 * tiers on the pricing page, plus a `demo` tier that mirrors Pro so a prospect
 * (or a friend) can trial the full feature set on a short time window.
 *
 * NOTE on enforcement (as of 2026-11): only `aiCallsPerMonth` is actually
 * enforced at runtime (server/ai/gemini.ts `assertAiQuota`). `maxUsers` and
 * `maxLicenses` are stored but not yet gated, and there is no per-plan *feature*
 * gating — every plan currently has every feature. That is why "demo = Pro"
 * needs nothing beyond the Pro quotas today. When feature gating is added later,
 * this file is the single source of truth to map a plan to its capabilities, so
 * keep it in sync with the pricing page.
 */
export const PLAN_PRESETS = {
  basic:    { maxUsers: 2,  maxLicenses: 50,   aiCallsPerMonth: 0 },
  standard: { maxUsers: 10, maxLicenses: 300,  aiCallsPerMonth: 200 },
  pro:      { maxUsers: 30, maxLicenses: 1500, aiCallsPerMonth: 1000 },
  // Mirrors `pro` on purpose — the demo should feel like the top tier.
  demo:     { maxUsers: 30, maxLicenses: 1500, aiCallsPerMonth: 1000 },
} as const;

export type PlanName = keyof typeof PLAN_PRESETS;

/** How long a demo subscription lasts before it lapses to read-only. */
export const DEMO_DURATION_DAYS = 30;
