import { locale, t } from "./i18n";
import type { ModelPricing } from "./types";

/** Reference dollars per million tokens, without floating-point noise or trailing zeros. */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 4 }).format(rate);
}

/**
 * The rate badge of one model: its bubble text, and whether it is greyed out because the
 * rate is unknown or every rate is zero (a free model, or one with no rate filled in).
 */
export function pricingTip(pricing: ModelPricing | undefined, model = ""): { text: string; muted: boolean } {
  const text = t().views;
  const pricedAs = autoReviewPricedAs(model);
  // Codex Auto-review has no rate of its own: say which model's rates price it.
  const intro = pricedAs ? [text.autoReview(pricedAs), ""] : [];
  const tip = (body: string, muted: boolean) => ({ text: [...intro, body].join("\n"), muted });
  if (!pricing) return tip(text.pricingUnknown, true);
  const rates = Object.entries(pricing).filter(([key]) => key !== "fastMultiplier");
  if (rates.every(([, rate]) => !rate)) return tip(text.pricingFree, true);
  return tip(formatPricing(pricing), false);
}

const AUTO_REVIEW_PREFIX = "codex-auto-review@";

/** The CLI names Codex Auto-review usage `codex-auto-review@<model it is priced as>`. */
export function autoReviewPricedAs(model: string): string | undefined {
  return model.startsWith(AUTO_REVIEW_PREFIX) ? model.slice(AUTO_REVIEW_PREFIX.length) || undefined : undefined;
}

/** The model name shown in the app: Auto-review keeps Codex's own name. */
export function modelDisplayName(model: string): string {
  return autoReviewPricedAs(model) ? "codex-auto-review" : model;
}

export function formatPricing(pricing: ModelPricing): string {
  const text = t().views;
  const fields = [
    ["input", "inputAbove200k", text.input],
    ["output", "outputAbove200k", text.output],
    ["cacheWrite", "cacheWriteAbove200k", text.cacheWrite],
    ["cacheRead", "cacheReadAbove200k", text.cacheRead],
  ] as const satisfies readonly (readonly [keyof ModelPricing, keyof ModelPricing, string])[];
  const lines = [text.pricingReference, ...fields.map(([key, , label]) => text.pricingRate(label, formatRate(pricing[key])))];
  const above = fields.flatMap(([, key, label]) => {
    const rate = pricing[key];
    return rate === undefined ? [] : [text.pricingRate(label, formatRate(rate))];
  });
  if (above.length) lines.push(text.pricingAbove200k, ...above);
  if (pricing.fastMultiplier !== undefined) lines.push(text.pricingFast(formatRate(pricing.fastMultiplier)));
  // A blank line sets the note apart from the rates.
  lines.push("", text.pricingNote);
  return lines.join("\n");
}
