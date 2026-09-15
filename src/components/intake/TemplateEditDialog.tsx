"use client";

import { useState } from "react";
import { languages } from "@/lib/languages";
import type { PromptTemplate, TemplateScope } from "@/lib/types";

type TemplateEditDialogProps = {
  template: PromptTemplate | null;
  defaultScope: TemplateScope;
  onClose: () => void;
  onSaved: (template: PromptTemplate) => void;
  onDeleted: (id: string) => void;
};

export function TemplateEditDialog({ template, defaultScope, onClose, onSaved, onDeleted }: TemplateEditDialogProps) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [instruction, setInstruction] = useState(template?.instruction || "");
  const [icon, setIcon] = useState(template?.icon || "");
  const [scope, setScope] = useState<TemplateScope>(template?.scope || defaultScope);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const payload = { name: name.trim(), description: description.trim(), instruction: instruction.trim(), scope, icon: icon.trim() || undefined };
      const response = template
        ? await fetch(`/api/templates/${template.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; template?: PromptTemplate };
      if (!response.ok || !data.template) throw new Error(data.error || "The task could not be saved.");
      onSaved(data.template);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The task could not be saved.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!template) return;
    if (!window.confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "The task could not be deleted.");
      onDeleted(template.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The task could not be deleted.");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="template-dialog-title" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-panel">
        <h2 id="template-dialog-title">{template ? "Edit task" : "New task"}</h2>

        <label className="text-label" htmlFor="template-name">Name</label>
        <input id="template-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />

        <label className="text-label" htmlFor="template-description">Description</label>
        <input id="template-description" value={description} maxLength={160} onChange={(event) => setDescription(event.target.value)} />

        <label className="text-label" htmlFor="template-scope">Applies to</label>
        <select id="template-scope" value={scope} onChange={(event) => setScope(event.target.value as TemplateScope)}>
          <option value="general">General (all source languages)</option>
          {languages.map((language) => <option key={language} value={language}>{language} only</option>)}
        </select>

        <label className="text-label" htmlFor="template-icon">Icon (optional, up to 4 characters)</label>
        <input id="template-icon" value={icon} maxLength={4} onChange={(event) => setIcon(event.target.value)} />

        <label className="text-label" htmlFor="template-instruction">Instruction sent to the model</label>
        <textarea id="template-instruction" className="template-instruction-input" value={instruction} maxLength={4000} onChange={(event) => setInstruction(event.target.value)} />

        {status && <p className="dialog-error" role="alert">{status}</p>}

        <div className="dialog-actions">
          <button className="save-input-button" type="button" disabled={saving || !name.trim() || !description.trim() || !instruction.trim()} onClick={() => void save()}>Save</button>
          <button className="preview-prompt-button" type="button" disabled={saving} onClick={onClose}>Cancel</button>
          {template && <button className="danger-button" type="button" disabled={saving} onClick={() => void remove()}>Delete</button>}
        </div>
      </div>
    </div>
  );
}
