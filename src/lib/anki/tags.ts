// Tag clean-up for the Tags page: grouping, rename rules and change plans.
// Anki tags are case-insensitive, can't contain spaces, and nest with "::".

// Tags PolyglotBooster or Anki itself relies on, never changed here.
export function isProtectedTag(tag: string) {
  const lower = tag.toLowerCase();
  return lower.startsWith("pb::") || lower === "leech" || lower === "marked";
}

export type TagKind = "date" | "nested" | "source" | "word" | "unclear";

export function tagKind(tag: string): TagKind {
  if (/^\d{8}/.test(tag)) return "date";
  if (tag.includes("::")) return "nested";
  if (!/[\p{L}\p{N}]/u.test(tag)) return "unclear";
  if (/\d/.test(tag) || /[A-Z].*[A-Z]/.test(tag) || /^[A-Z]/.test(tag)) return "source";
  return "word";
}

export const tagKindLabels: Record<TagKind, string> = {
  date: "Dates",
  nested: "Already nested",
  source: "Sources and other names (capitals or numbers)",
  word: "Topics and other words",
  unclear: "Unclear",
};

// A tag Anki accepts: no spaces, no empty levels.
export function cleanTag(tag: string) {
  return tag.trim().replace(/\s+/g, "_").replace(/:{3,}/g, "::").replace(/^:+|:+$/g, "");
}

export type Rule = { pattern: string; targets: string[]; line: number };

// Rules, one per line: "pattern → new tag(s)" (or "->"). * in the pattern
// matches any text, and each * in the new tags is replaced by what the
// matching * matched, in order. Several new tags are separated by spaces;
// leave the right side empty to delete the tag. Lines starting # are notes.
export function parseRules(text: string): { rules: Rule[]; errors: string[] } {
  const rules: Rule[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(/\s*(?:→|->)\s*/);
    if (parts.length !== 2 || !parts[0]) { errors.push(`Line ${index + 1}: write it as "old → new".`); return; }
    const targets = parts[1].split(/\s+/).filter(Boolean);
    const stars = (parts[0].match(/\*/g) || []).length;
    if (targets.some((target) => (target.match(/\*/g) || []).length > stars)) { errors.push(`Line ${index + 1}: the new tag has more * than the pattern.`); return; }
    rules.push({ pattern: parts[0], targets, line: index + 1 });
  });
  return { rules, errors };
}

function applyRule(rule: Rule, tag: string): string[] | null {
  const regex = new RegExp(`^${rule.pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("(.+?)")}$`, "i");
  const match = regex.exec(tag);
  if (!match) return null;
  return rule.targets.map((target) => {
    let next = 1;
    return cleanTag(target.replace(/\*/g, () => match[next++] ?? ""));
  }).filter(Boolean);
}

// Date tags (e.g. 20180410, or 20200417Glossika) folded under one parent:
// diary::2018-04-10, plus source::Glossika for a name after the date.
export function dateTagTargets(tag: string, datePrefix: string, sourcePrefix: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(.*)$/.exec(tag);
  if (!match) return null;
  const [, year, month, day, rest] = match;
  return [`${cleanTag(datePrefix)}::${year}-${month}-${day}`, ...(rest.trim() ? [`${cleanTag(sourcePrefix)}::${cleanTag(rest)}`] : [])];
}

export type Change = { tag: string; targets: string[]; reason: string };

// What would change: choices made by hand (manual) win, then the rules in
// order, then the date rule. Protected tags and no-op changes are skipped.
export function planChanges(tags: string[], manual: Map<string, string[]>, rules: Rule[], dateFold: { datePrefix: string; sourcePrefix: string } | null): Change[] {
  const changes: Change[] = [];
  for (const tag of tags) {
    if (isProtectedTag(tag)) continue;
    let targets: string[] | null = null;
    let reason = "";
    if (manual.has(tag)) { targets = manual.get(tag)!; reason = "chosen"; }
    for (const rule of rules) {
      if (targets) break;
      targets = applyRule(rule, tag);
      if (targets) reason = `rule on line ${rule.line}`;
    }
    if (!targets && dateFold) {
      targets = dateTagTargets(tag, dateFold.datePrefix, dateFold.sourcePrefix);
      if (targets) reason = "date rule";
    }
    if (!targets) continue;
    if (targets.length === 1 && targets[0] === tag) continue;
    changes.push({ tag, targets, reason });
  }
  return changes;
}
