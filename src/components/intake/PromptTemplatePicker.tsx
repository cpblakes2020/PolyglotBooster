"use client";

import { useEffect, useState } from "react";
import { TemplateEditDialog } from "@/components/intake/TemplateEditDialog";
import type { Language, PromptTemplate, PromptTemplateId } from "@/lib/types";

type PromptTemplatePickerProps = {
  selectedTemplate: PromptTemplateId;
  sourceLanguage: Language;
  onTemplateChange: (template: PromptTemplateId) => void;
};

export function PromptTemplatePicker({ selectedTemplate, sourceLanguage, onTemplateChange }: PromptTemplatePickerProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState("Loading tasks...");
  const [editing, setEditing] = useState<PromptTemplate | "new" | null>(null);

  async function loadTemplates() {
    try {
      const response = await fetch("/api/templates");
      const data = await response.json() as { error?: string; templates?: PromptTemplate[]; isAdmin?: boolean };
      if (!response.ok || !data.templates) throw new Error(data.error || "Tasks could not be loaded.");
      setTemplates(data.templates);
      setIsAdmin(Boolean(data.isAdmin));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tasks could not be loaded.");
    }
  }

  useEffect(() => { void loadTemplates(); }, []);

  const visibleTemplates = templates.filter((template) => template.scope === "general" || template.scope === sourceLanguage);

  useEffect(() => {
    if (!visibleTemplates.length) return;
    if (!visibleTemplates.some((template) => template.id === selectedTemplate)) {
      onTemplateChange(visibleTemplates[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLanguage, templates]);

  return (
    <>
      <div className="template-heading">
        <div><p className="section-kicker">03 / Choose a lens</p><h2 id="template-title">Start with a useful question</h2></div>
        {isAdmin && <button className="text-button" type="button" onClick={() => setEditing("new")}>New task <span aria-hidden="true">+</span></button>}
      </div>
      {status && <p className="task-status" role="status">{status}</p>}
      <div className="template-grid">
        {visibleTemplates.map((template) => (
          <article className={`template-card${selectedTemplate === template.id ? " selected" : ""}`} key={template.id}>
            <button type="button" className="template-card-select" aria-pressed={selectedTemplate === template.id} onClick={() => onTemplateChange(template.id)}>
              <span className="template-icon">{template.icon || template.name.charAt(0)}</span>
              <span><strong>{template.name}</strong><small>{template.description}</small></span>
            </button>
            {isAdmin ? (
              <button type="button" className="template-card-edit" onClick={() => setEditing(template)}>Edit</button>
            ) : (
              <span className="card-arrow" aria-hidden="true">↗</span>
            )}
          </article>
        ))}
      </div>
      {editing && (
        <TemplateEditDialog
          template={editing === "new" ? null : editing}
          defaultScope={sourceLanguage}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setTemplates((current) => {
              const index = current.findIndex((item) => item.id === saved.id);
              if (index === -1) return [...current, saved];
              return current.map((item) => item.id === saved.id ? saved : item);
            });
          }}
          onDeleted={(id) => {
            setEditing(null);
            setTemplates((current) => current.filter((item) => item.id !== id));
          }}
        />
      )}
    </>
  );
}
