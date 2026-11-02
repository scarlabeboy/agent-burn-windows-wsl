import { en } from "./en";
import { fr, type Strings } from "./fr";

export type Lang = "fr" | "en";

/** Each language is named in itself, whatever the interface language. */
export const LANG_NAMES: Record<Lang, string> = { fr: "Français", en: "English" };

// The interface language, set by the app from its settings before each render. A module value
// rather than a React context: formatting helpers outside components need it too.
let current: Lang = "fr";

export const setLang = (lang: Lang) => {
  current = lang;
};

export const getLang = (): Lang => current;

export const t = (): Strings => (current === "en" ? en : fr);

/** Locale of numbers, amounts and dates. */
export const locale = (): string => (current === "en" ? "en-US" : "fr-FR");

/** A percentage written the language's way: "40 %" in French, "40%" in English. */
export const percent = (value: string | number): string => (current === "en" ? `${value}%` : `${value} %`);

/** Windows' own language, used until a language is chosen in the settings. */
export const systemLang = (): Lang =>
  typeof navigator !== "undefined" && /^fr\b/i.test(navigator.language) ? "fr" : "en";

export const isLang = (value: unknown): value is Lang => value === "fr" || value === "en";
