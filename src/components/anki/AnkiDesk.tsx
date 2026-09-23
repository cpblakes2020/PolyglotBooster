"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioBatch } from "@/components/anki/AudioBatch";
import { ReviewSession } from "@/components/anki/ReviewSession";
import { anki } from "@/lib/anki/connect";
import { ankiNoteType } from "@/lib/anki/vocab";

type Connection = { state: "checking" } | { state: "ready" } | { state: "error"; message: string };
type Tab = "review" | "audio";

export function AnkiDesk() {
  const [connection, setConnection] = useState<Connection>({ state: "checking" });
  const [tab, setTab] = useState<Tab>("review");

  const check = useCallback(async () => {
    setConnection({ state: "checking" });
    try {
      await anki.version();
      const fields = await anki.fieldNames();
      if (!fields.includes("Origin")) throw new Error(`The "${ankiNoteType}" note type wasn't found in this Anki profile.`);
      setConnection({ state: "ready" });
    } catch (error) {
      setConnection({ state: "error", message: error instanceof Error ? error.message : "Anki could not be reached." });
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  return (
    <section className="anki-desk">
      <div className="settings-panel anki-connection">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Anki</p>
            <h2>{ankiNoteType}</h2>
          </div>
          <p className="anki-connection-status" role="status">
            <span className={`status-dot ${connection.state}`} />
            {connection.state === "checking" ? "Connecting to Anki..." : connection.state === "ready" ? "Connected to Anki" : "Not connected"}
          </p>
        </div>
        {connection.state === "error" && (
          <div className="anki-help">
            <p>{connection.message}</p>
            <p>This page talks to the Anki app on this computer through the AnkiConnect add-on. In Anki, open Tools → Add-ons → AnkiConnect → Config, add this site to <code>webCorsOriginList</code>, and restart Anki:</p>
            <pre>{`"webCorsOriginList": [\n  "http://localhost",\n  "${typeof window === "undefined" ? "" : window.location.origin}"\n]`}</pre>
            <button className="save-input-button" type="button" onClick={() => void check()}>Try again</button>
          </div>
        )}
        {connection.state === "ready" && (
          <div className="mode-tabs anki-tabs" role="tablist">
            <button className={`mode-tab${tab === "review" ? " active" : ""}`} role="tab" aria-selected={tab === "review"} type="button" onClick={() => setTab("review")}>Review &amp; analyze</button>
            <button className={`mode-tab${tab === "audio" ? " active" : ""}`} role="tab" aria-selected={tab === "audio"} type="button" onClick={() => setTab("audio")}>Bulk audio</button>
          </div>
        )}
      </div>
      {connection.state === "ready" && (tab === "review" ? <ReviewSession /> : <AudioBatch />)}
    </section>
  );
}
