/** A titled group of release notes, such as "Nouveautés" and its items. */
export interface NotesSection {
  title?: string;
  items: string[];
}

/**
 * Release notes are a CHANGELOG.md section: "### " titles and "- " items. Only those two shapes
 * are read; any other line becomes a plain item, so nothing is rendered as markup.
 */
export function parseNotes(notes: string | undefined): NotesSection[] {
  const sections: NotesSection[] = [];
  for (const raw of (notes ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
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
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(value);
}

/** The updater's errors, in English and technical, said in plain French. */
export function updateError(error: unknown): string {
  const message = String(error);
  if (/valid release JSON|404|not found/i.test(message)) return "aucune version publiée n'a été trouvée sur GitHub.";
  if (/signature/i.test(message)) return "la signature de la mise à jour ne correspond pas : elle est refusée.";
  if (/request|connect|dns|timed? ?out|network/i.test(message)) return "GitHub est injoignable (connexion réseau ?).";
  return `erreur inattendue (${message}).`;
}
