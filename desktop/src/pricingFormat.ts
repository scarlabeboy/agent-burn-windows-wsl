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
export function pricingTip(pricing: ModelPricing | undefined): { text: string; muted: boolean } {
  const text = t().views;
  if (!pricing) return { text: text.pricingUnknown, muted: true };
  const rates = Object.entries(pricing).filter(([key]) => key !== "fastMultiplier");
  if (rates.every(([, rate]) => !rate)) return { text: text.pricingFree, muted: true };
  return { text: formatPricing(pricing), muted: false };
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
