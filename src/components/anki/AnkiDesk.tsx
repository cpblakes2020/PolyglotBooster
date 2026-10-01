"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioBatch } from "@/components/anki/AudioBatch";
import { ReviewSession } from "@/components/anki/ReviewSession";
import { anki } from "@/lib/anki/connect";
import { ankiNoteType } from "@/lib/anki/vocab";

// "setup": Anki is reachable but this profile doesn't have the note type yet.
type Connection = { state: "checking" } | { state: "ready"; missing: string[] } | { state: "setup"; message?: string } | { state: "error"; message: string };
type Tab = "review" | "audio";

export function AnkiDesk() {
  const [connection, setConnection] = useState<Connection>({ state: "checking" });
  const [tab, setTab] = useState<Tab>("review");
  const [settingUp, setSettingUp] = useState(false);
  const [upgradeStatus, setUpgradeStatus] = useState("");

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
      setConnection({ state: "ready", missing: await anki.missingLanguages() });
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

  async function addLanguages() {
    setSettingUp(true);
    setUpgradeStatus("Adding languages to Polyglot Vocab...");
    try {
      const result = await anki.addLanguages();
      await check();
      setUpgradeStatus(`Added ${result.languages.join(", ")} (${result.directions.length} new card directions)${result.repaired.length ? `, and repaired ${result.repaired.length} card backs` : ""}. Now sync Anki — it will ask for a one-way sync: choose Upload to AnkiWeb.`);
    } catch (error) {
      setUpgradeStatus(error instanceof Error ? error.message : "The languages couldn't be added.");
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
            <p>Anki is connected, but this Anki profile doesn&apos;t have the <b>{ankiNoteType}</b> note type yet. Setting it up adds that note type — fields for English, Indonesian, Thai, Japanese, Spanish, French and Mandarin, with audio and notes for each, and cards for each language with English plus several language pairs — and a <code>Polyglot::</code> deck for each language. Nothing already in Anki is changed.</p>
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
        {connection.state === "ready" && (connection.missing.length > 0 || upgradeStatus) && (
          <div className="anki-help anki-upgrade">
            {connection.missing.length > 0 && (
              <>
                <p><b>{connection.missing.join(", ")}</b> {connection.missing.length === 1 ? "isn't" : "aren't"} in your {ankiNoteType} note type yet. Adding {connection.missing.length === 1 ? "it" : "them"} adds a field, audio field and notes field for each, their card directions (with English, plus Spanish–French, Mandarin–Japanese and Mandarin–Thai), and a <code>Polyglot::</code> deck for each. Your existing notes and cards aren&apos;t changed.</p>
                <p className="anki-note">This changes the note type, so afterwards Anki needs a one-way sync to AnkiWeb. <b>Sync your phone first</b> so nothing studied there is lost.</p>
                <button className="save-input-button" type="button" disabled={settingUp} onClick={() => void addLanguages()}>{settingUp ? "Adding..." : `Add ${connection.missing.join(", ")}`}</button>
              </>
            )}
            {upgradeStatus && <p className="example-status" role="status">{upgradeStatus}</p>}
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
