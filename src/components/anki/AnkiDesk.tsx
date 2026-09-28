"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioBatch } from "@/components/anki/AudioBatch";
import { ReviewSession } from "@/components/anki/ReviewSession";
import { anki } from "@/lib/anki/connect";
import { ankiNoteType } from "@/lib/anki/vocab";

// "setup": Anki is reachable but this profile doesn't have the note type yet.
type Connection = { state: "checking" } | { state: "ready" } | { state: "setup"; message?: string } | { state: "error"; message: string };
type Tab = "review" | "audio";

export function AnkiDesk() {
  const [connection, setConnection] = useState<Connection>({ state: "checking" });
  const [tab, setTab] = useState<Tab>("review");
  const [settingUp, setSettingUp] = useState(false);

  const check = useCallback(async () => {
    setConnection({ state: "checking" });
    try {
      await anki.version();
      if (!(await anki.modelNames()).includes(ankiNoteType)) {
        setConnection({ state: "setup" });
        return;
      }
      const fields = await anki.fieldNames();
      if (!fields.includes("Origin")) throw new Error(`This profile has a "${ankiNoteType}" note type, but not the one PolyglotBooster expects (it has no Origin field).`);
      setConnection({ state: "ready" });
    } catch (error) {
      setConnection({ state: "error", message: error instanceof Error ? error.message : "Anki could not be reached." });
    }
  }, []);

  async function setUp() {
    setSettingUp(true);
    try {
      await anki.setUpNoteType();
      await check();
    } catch (error) {
      setConnection({ state: "setup", message: error instanceof Error ? error.message : "Setup didn't complete." });
    } finally {
      setSettingUp(false);
    }
  }

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
            {connection.state === "checking" ? "Connecting to Anki..." : connection.state === "ready" ? "Connected to Anki" : connection.state === "setup" ? "Connected — setup needed" : "Not connected"}
          </p>
        </div>
        {connection.state === "setup" && (
          <div className="anki-help">
            <p>Anki is connected, but this Anki profile doesn&apos;t have the <b>{ankiNoteType}</b> note type yet. Setting it up adds that note type — fields for English, Indonesian, Thai and Japanese, with audio and notes for each, and a card for every language direction — plus the decks <code>Polyglot::Indonesian</code>, <code>Polyglot::Thai</code> and <code>Polyglot::Japanese</code>. Nothing already in Anki is changed.</p>
            {connection.message && <p className="anki-failures">{connection.message}</p>}
            <button className="save-input-button" type="button" disabled={settingUp} onClick={() => void setUp()}>{settingUp ? "Setting up..." : `Set up ${ankiNoteType}`}</button>
          </div>
        )}
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
