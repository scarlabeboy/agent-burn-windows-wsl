import { locale, t, type Lang } from "./i18n";

/** A titled group of release notes, such as "Nouveautés" and its items. */
export interface NotesSection {
  title?: string;
  items: string[];
}

/** Headings that open each language's block in a bilingual CHANGELOG section. */
const LANG_HEADINGS: Record<string, Lang> = { english: "en", français: "fr" };

/**
 * Release notes are a CHANGELOG.md section: "### " titles and "- " items. Only those two shapes
 * are read; any other line becomes a plain item, so nothing is rendered as markup. A bilingual
 * section has an "#### English" and an "#### Français" block: only the one of `lang` is kept.
 */
export function parseNotes(notes: string | undefined, lang: Lang): NotesSection[] {
  const lines = (notes ?? "").split(/\r?\n/).map((line) => line.trim());
  const blockOf = (line: string) => {
    const heading = /^####\s+(.*)$/.exec(line);
    return heading ? LANG_HEADINGS[heading[1].toLowerCase()] : undefined;
  };
  const bilingual = lines.some((line) => blockOf(line) !== undefined);
  let block: Lang | undefined;
  const sections: NotesSection[] = [];
  for (const line of lines) {
    const opens = blockOf(line);
    if (opens) {
      block = opens;
      continue;
    }
    if (!line || (bilingual && block !== lang)) continue;
    const title = /^#{1,6}\s+(.*)$/.exec(line);
    if (title) {
      sections.push({ title: title[1], items: [] });
      continue;
    }
    if (sections.length === 0) sections.push({ items: [] });
    sections[sections.length - 1].items.push(line.replace(/^[-*]\s+/, ""));
  }
  return sections.filter((section) => section.items.length > 0);
}

/**
 * The release day, from the updater's date ("2026-11-02 0:30:20.0 +00:00:00", not ISO), or from
 * an ISO date; nothing when it cannot be read.
 */
export function releaseDay(date: string | undefined): string | undefined {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!day) return undefined;
  const value = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" }).format(value);
}

/** The updater's errors, in English and technical, said in plain words. */
export function updateError(error: unknown): string {
  const message = String(error);
  if (/valid release JSON|404|not found/i.test(message)) return t().update.errorNoRelease;
  if (/signature/i.test(message)) return t().update.errorSignature;
  if (/request|connect|dns|timed? ?out|network/i.test(message)) return t().update.errorNetwork;
  return t().update.errorOther(message);
}
