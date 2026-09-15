"use client";

import { useState } from "react";
import { TemplateEditDialog } from "@/components/intake/TemplateEditDialog";
import { visibleTemplatesFor } from "@/lib/templateOrder";
import type { Language, PromptTemplate, PromptTemplateId } from "@/lib/types";

type PromptTemplatePickerProps = {
  templates: PromptTemplate[];
  isAdmin: boolean;
  status: string;
  selectedTemplate: PromptTemplateId;
  sourceLanguage: Language;
  onTemplateChange: (template: PromptTemplateId) => void;
  onTemplatesChange: (updater: (current: PromptTemplate[]) => PromptTemplate[]) => void;
};

export function PromptTemplatePicker({ templates, isAdmin, status, selectedTemplate, sourceLanguage, onTemplateChange, onTemplatesChange }: PromptTemplatePickerProps) {
  const [editing, setEditing] = useState<PromptTemplate | "new" | null>(null);
  const visibleTemplates = visibleTemplatesFor(templates, sourceLanguage);

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
            onTemplatesChange((current) => {
              const index = current.findIndex((item) => item.id === saved.id);
              if (index === -1) return [...current, saved];
              return current.map((item) => item.id === saved.id ? saved : item);
            });
          }}
          onDeleted={(id) => {
            setEditing(null);
            onTemplatesChange((current) => current.filter((item) => item.id !== id));
          }}
        />
      )}
    </>
  );
}
