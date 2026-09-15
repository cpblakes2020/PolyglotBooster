import type { SavedTaskRun } from "@/lib/reviews";

function escapeCell(value: string, delimiter: string) {
  const normalized = value || "";
  if (delimiter === "\t") return normalized.replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return `"${normalized.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

export function taskRunExport(run: SavedTaskRun, delimiter: "," | "\t") {
  const headers = ["Front", "Back", "Source language", "Explanation language", "Prompt", "Notes", "Tags", "Direction"];
  const cards = run.flashcards?.length ? run.flashcards : [{ front: run.sourceText, back: run.result, tags: [] }];
  const rows = cards.flatMap((card) => {
    const tags = [...new Set([`polyglot::${run.sourceLanguage.toLowerCase()}-${run.userLanguage.toLowerCase()}`, `template::${run.promptTemplateId}`, ...card.tags])].join(" ");
    return [
      [card.front, card.back, run.sourceLanguage, run.userLanguage, run.promptTemplateId, run.notes || "", tags, `${run.sourceLanguage} to ${run.userLanguage}`],
      [card.back, card.front, run.userLanguage, run.sourceLanguage, run.promptTemplateId, run.notes || "", tags, `${run.userLanguage} to ${run.sourceLanguage}`],
    ];
  });
  return [headers, ...rows].map((row) => row.map((value) => escapeCell(value, delimiter)).join(delimiter)).join("\n") + "\n";
}

export function downloadTaskRun(run: SavedTaskRun, format: "csv" | "tsv" | "txt") {
  const content = format === "txt"
    ? `Source (${run.sourceLanguage})\n${run.sourceText}\n\nClaude result (${run.userLanguage})\n${run.result}\n\nNotes\n${run.notes || ""}`
    : taskRunExport(run, format === "csv" ? "," : "\t");
  const mimeType = format === "txt" ? "text/plain" : format === "csv" ? "text/csv" : "text/tab-separated-values";
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `polyglot-${run.taskRunId}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}
