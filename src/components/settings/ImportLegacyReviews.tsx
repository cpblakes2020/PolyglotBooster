"use client";

import { useState } from "react";

export function ImportLegacyReviews() {
  const [syncCode, setSyncCode] = useState("");
  const [status, setStatus] = useState("");
  const [importing, setImporting] = useState(false);

  async function importReviews() {
    setImporting(true);
    setStatus("Fetching and decrypting your old reviews...");
    try {
      const response = await fetch("/api/account/import-legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncCode: syncCode.trim() }),
      });
      const data = await response.json() as { error?: string; imported?: number; skipped?: number };
      if (!response.ok || data.imported === undefined) throw new Error(data.error || "The old reviews could not be imported.");
      const skippedNote = data.skipped ? ` (${data.skipped} already present, skipped)` : "";
      setStatus(`Imported ${data.imported} review${data.imported === 1 ? "" : "s"}${skippedNote}. Refresh the study desk to see them.`);
      setSyncCode("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The old reviews could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="import-legacy-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">One-time import</p>
          <h2 id="import-legacy-title">Old saved reviews</h2>
        </div>
      </div>
      <p>If you have saved reviews from before accounts existed, paste your old 43-character sync code here once to bring them into this account.</p>
      <div className="api-key-setting">
        <label htmlFor="legacy-sync-code">Old sync code</label>
        <input
          id="legacy-sync-code"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your old sync code"
          value={syncCode}
          onChange={(event) => setSyncCode(event.target.value.trim())}
        />
        <div className="input-action-row">
          <button className="save-input-button" type="button" disabled={importing || syncCode.length !== 43} onClick={() => void importReviews()}>Import reviews</button>
          {status && <span className="example-status" role="status">{status}</span>}
        </div>
      </div>
    </section>
  );
}
