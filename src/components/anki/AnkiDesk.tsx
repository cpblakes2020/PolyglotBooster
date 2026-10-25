"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioBatch } from "@/components/anki/AudioBatch";
import { BookAudio } from "@/components/anki/BookAudio";
import { ListeningNotes } from "@/components/anki/ListeningNotes";
import { ReviewSession } from "@/components/anki/ReviewSession";
import { TagManager } from "@/components/anki/TagManager";
import { anki } from "@/lib/anki/connect";
import { ankiNoteType } from "@/lib/anki/vocab";

// "setup": Anki is reachable but this profile doesn't have the note type yet.
// missing: languages the note type has no fields for; listening: whether
// its listening cards are missing or need updating.
type Connection = { state: "checking" } | { state: "ready"; missing: string[]; listening: "missing" | "outdated" | "current" } | { state: "setup"; message?: string } | { state: "error"; message: string };
type Tab = "review" | "audio" | "book" | "listening" | "tags";

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
      const { languages, listening } = await anki.missingFeatures();
      setConnection({ state: "ready", missing: languages, listening });
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

  async function upgrade() {
    setSettingUp(true);
    setUpgradeStatus("Updating Polyglot Vocab...");
    try {
      const result = await anki.upgradeNoteType();
      await check();
      const done = [
        result.languages.length ? `added ${result.languages.join(", ")}` : "",
        result.directions.length ? `added ${result.directions.length} card types` : "",
        result.refreshed ? `updated ${result.refreshed} listening cards` : "",
        result.repaired ? `repaired ${result.repaired} card backs` : "",
      ].filter(Boolean).join(", ");
      setUpgradeStatus(`Done: ${done || "nothing needed changing"}. ${result.oneWaySync ? "Now sync Anki — it will ask for a one-way sync: choose Upload to AnkiWeb. Then sync your phone." : "Now sync Anki as usual, then your phone."}`);
    } catch (error) {
      setUpgradeStatus(error instanceof Error ? error.message : "Polyglot Vocab couldn't be updated.");
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
            <p>Anki is connected, but this Anki profile doesn&apos;t have the <b>{ankiNoteType}</b> note type yet. Setting it up adds that note type — fields for English, Indonesian, Thai, Japanese, Spanish, French and Mandarin, with audio and notes for each, cards for each language with English plus several language pairs, and listening cards — and a <code>Polyglot::</code> deck for each language. Nothing already in Anki is changed.</p>
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
        {connection.state === "ready" && (connection.missing.length > 0 || connection.listening !== "current" || upgradeStatus) && (
          <div className="anki-help anki-upgrade">
            {(connection.missing.length > 0 || connection.listening !== "current") && (
              <>
                {connection.missing.length > 0 && <p><b>{connection.missing.join(", ")}</b> {connection.missing.length === 1 ? "isn't" : "aren't"} in your {ankiNoteType} note type yet. Adding {connection.missing.length === 1 ? "it" : "them"} adds a field, audio field and notes field for each, their card directions (with English, plus Spanish–French, Mandarin–Japanese and Mandarin–Thai), and a <code>Polyglot::</code> deck for each.</p>}
                {connection.listening === "outdated" && <p>There&apos;s a newer version of the <b>listening cards</b>. Updating replaces the listening card templates; your notes and their cards stay as they are.</p>}
                {connection.listening === "missing" && <p>Your {ankiNoteType} note type doesn&apos;t have <b>listening cards</b> yet. Adding them adds a second audio field for each language (<code>Audio2_&lt;Language&gt;</code>, played after the first — another voice, or the textbook&apos;s recording), <code>Listening</code> and <code>ListeningOnly</code> fields that give a note a listening card (alongside its usual cards, or instead of them), and a listening card for each language: audio only on the front, the text on the back, with back 5 s / back 10 s / loop buttons.</p>}
                <p className="anki-note">Your existing notes and cards aren&apos;t changed. {connection.missing.length > 0 || connection.listening === "missing" ? <>This adds fields and card types to the note type, so afterwards Anki needs a one-way sync to AnkiWeb. <b>Sync your phone first</b> so nothing studied there is lost.</> : <>This only changes the card layouts, so an ordinary sync afterwards is enough.</>}</p>
                <button className="save-input-button" type="button" disabled={settingUp} onClick={() => void upgrade()}>{settingUp ? "Updating..." : [connection.missing.length ? `Add ${connection.missing.join(", ")}` : "", connection.listening === "missing" ? "Add listening cards" : connection.listening === "outdated" ? "Update listening cards" : ""].filter(Boolean).join(" and ")}</button>
              </>
            )}
            {upgradeStatus && <p className="example-status" role="status">{upgradeStatus}</p>}
          </div>
        )}
        {connection.state === "ready" && (
          <div className="mode-tabs anki-tabs" role="tablist">
            <button className={`mode-tab${tab === "review" ? " active" : ""}`} role="tab" aria-selected={tab === "review"} type="button" onClick={() => setTab("review")}>Review &amp; analyze</button>
            <button className={`mode-tab${tab === "audio" ? " active" : ""}`} role="tab" aria-selected={tab === "audio"} type="button" onClick={() => setTab("audio")}>Bulk audio</button>
            <button className={`mode-tab${tab === "book" ? " active" : ""}`} role="tab" aria-selected={tab === "book"} type="button" onClick={() => setTab("book")}>Book audio</button>
            <button className={`mode-tab${tab === "listening" ? " active" : ""}`} role="tab" aria-selected={tab === "listening"} type="button" onClick={() => setTab("listening")}>Listening</button>
            <button className={`mode-tab${tab === "tags" ? " active" : ""}`} role="tab" aria-selected={tab === "tags"} type="button" onClick={() => setTab("tags")}>Tags</button>
          </div>
        )}
      </div>
      {connection.state === "ready" && (tab === "review" ? <ReviewSession /> : tab === "audio" ? <AudioBatch /> : tab === "book" ? <BookAudio /> : tab === "listening" ? <ListeningNotes ready={connection.listening !== "missing"} /> : <TagManager />)}
    </section>
  );
}
