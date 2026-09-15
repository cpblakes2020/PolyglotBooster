"use client";

import { useState } from "react";
import { llmProviderOptions, type LlmProviderId } from "@/lib/llm/provider";

type SettingsFormProps = {
  initialKeyStatus: Record<LlmProviderId, boolean>;
};

export function SettingsForm({ initialKeyStatus }: SettingsFormProps) {
  const [keyStatus, setKeyStatus] = useState(initialKeyStatus);
  const [drafts, setDrafts] = useState<Partial<Record<LlmProviderId, string>>>({});
  const [status, setStatus] = useState<Partial<Record<LlmProviderId, string>>>({});

  async function saveKey(providerId: LlmProviderId) {
    setStatus((current) => ({ ...current, [providerId]: "Saving..." }));
    try {
      const response = await fetch("/api/account/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, apiKey: drafts[providerId] || "" }),
      });
      const data = await response.json() as { error?: string; keyStatus?: Record<LlmProviderId, boolean> };
      if (!response.ok || !data.keyStatus) throw new Error(data.error || "The API key could not be saved.");
      setKeyStatus(data.keyStatus);
      setDrafts((current) => ({ ...current, [providerId]: "" }));
      setStatus((current) => ({ ...current, [providerId]: "Saved" }));
    } catch (error) {
      setStatus((current) => ({ ...current, [providerId]: error instanceof Error ? error.message : "The API key could not be saved." }));
    }
  }

  async function removeKey(providerId: LlmProviderId) {
    setStatus((current) => ({ ...current, [providerId]: "Removing..." }));
    try {
      const response = await fetch("/api/account/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, apiKey: null }),
      });
      const data = await response.json() as { error?: string; keyStatus?: Record<LlmProviderId, boolean> };
      if (!response.ok || !data.keyStatus) throw new Error(data.error || "The API key could not be removed.");
      setKeyStatus(data.keyStatus);
      setStatus((current) => ({ ...current, [providerId]: "Removed" }));
    } catch (error) {
      setStatus((current) => ({ ...current, [providerId]: error instanceof Error ? error.message : "The API key could not be removed." }));
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Account settings</p>
          <h2 id="settings-title">API keys</h2>
        </div>
      </div>
      <p>Your keys are stored on the server, tied to your account, and used only to run your study tasks.</p>
      {llmProviderOptions.map((provider) => (
        <div className="api-key-setting" key={provider.id}>
          <label htmlFor={`api-key-${provider.id}`}>{provider.label} API key</label>
          <p role="status">{keyStatus[provider.id] ? "A key is on file" : "No key set yet"}</p>
          <input
            id={`api-key-${provider.id}`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={keyStatus[provider.id] ? "Enter a new key to replace it" : "Paste your API key"}
            value={drafts[provider.id] || ""}
            onChange={(event) => setDrafts((current) => ({ ...current, [provider.id]: event.target.value }))}
          />
          <div className="input-action-row">
            <button className="save-input-button" type="button" disabled={!drafts[provider.id]?.trim()} onClick={() => void saveKey(provider.id)}>Save key</button>
            {keyStatus[provider.id] && <button className="danger-button" type="button" onClick={() => void removeKey(provider.id)}>Remove key</button>}
            {status[provider.id] && <span className="example-status" role="status">{status[provider.id]}</span>}
          </div>
        </div>
      ))}
    </section>
  );
}
