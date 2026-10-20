import type { SavedTaskRun } from "@/lib/reviews";

// Anki cards are made through the Anki page and Send to Anki (AnkiConnect);
// the only download left is a plain-text copy of a saved review.
export function downloadTaskRun(run: SavedTaskRun) {
  const content = [
    ...(run.customInstruction ? [`Custom task\n${run.customInstruction}`] : []),
    ...(run.generalInstructions ? [`General instructions (edited for this run)\n${run.generalInstructions}`] : []),
    `Source (${run.sourceLanguage})\n${run.sourceText}`,
    `Result (${run.userLanguage})\n${run.result}`,
    `Notes\n${run.notes || ""}`,
  ].join("\n\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `polyglot-${run.taskRunId}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}
