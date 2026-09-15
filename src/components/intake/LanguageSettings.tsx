"use client";

import Link from "next/link";
import { prioritizeLanguage } from "@/lib/languages";
import { languagePairPresets } from "@/lib/presets";
import { llmProviderOptions, type LlmProviderId } from "@/lib/llm/provider";
import type { Language, LearnerLevel, OutputStyle } from "@/lib/types";

type LanguageSettingsProps = {
  sourceLanguage: Language;
  explanationLanguage: Language;
  learnerLevel: LearnerLevel;
  outputStyle: OutputStyle;
  providerId: LlmProviderId;
  hasProviderKey: boolean;
  onSourceLanguageChange: (language: Language) => void;
  onExplanationLanguageChange: (language: Language) => void;
  onLearnerLevelChange: (level: LearnerLevel) => void;
  onOutputStyleChange: (style: OutputStyle) => void;
  onProviderChange: (providerId: LlmProviderId) => void;
  onPresetChange: (sourceLanguage: Language, explanationLanguage: Language) => void;
};

export function LanguageSettings({
  sourceLanguage,
  explanationLanguage,
  learnerLevel,
  outputStyle,
  providerId,
  hasProviderKey,
  onSourceLanguageChange,
  onExplanationLanguageChange,
  onLearnerLevelChange,
  onOutputStyleChange,
  onProviderChange,
  onPresetChange,
}: LanguageSettingsProps) {
  const providerLabel = llmProviderOptions.find((provider) => provider.id === providerId)?.label;

  return (
    <section className="language-bar" aria-labelledby="language-bar-title">
      <h2 id="language-bar-title" className="visually-hidden">Language context</h2>
      <div className="language-bar-field">
        <label htmlFor="language-preset">Preset</label>
        <select id="language-preset" defaultValue="" onChange={(event) => {
          const preset = languagePairPresets.find((item) => item.id === event.target.value);
          if (preset) onPresetChange(preset.sourceLanguage, preset.userLanguage);
        }}>
          <option value="">Choose...</option>
          {languagePairPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </div>
      <div className="language-bar-flow">
        <div className="language-bar-field">
          <label htmlFor="source-language">Source</label>
          <select id="source-language" value={sourceLanguage} onChange={(event) => onSourceLanguageChange(event.target.value as Language)}>{prioritizeLanguage(sourceLanguage).map((language) => <option key={language}>{language}</option>)}</select>
        </div>
        <span className="flow-arrow" aria-hidden="true">→</span>
        <div className="language-bar-field">
          <label htmlFor="explain-language">Explain through</label>
          <select id="explain-language" value={explanationLanguage} onChange={(event) => onExplanationLanguageChange(event.target.value as Language)}>{prioritizeLanguage(explanationLanguage).map((language) => <option key={language}>{language}</option>)}</select>
        </div>
      </div>
      <div className="language-bar-field">
        <label htmlFor="level">Level</label>
        <select id="level" value={learnerLevel} onChange={(event) => onLearnerLevelChange(event.target.value as LearnerLevel)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select>
      </div>
      <div className="language-bar-field">
        <label htmlFor="style">Style</label>
        <select id="style" value={outputStyle} onChange={(event) => onOutputStyleChange(event.target.value as OutputStyle)}><option>Concise</option><option>Detailed</option><option>Literal</option><option>Natural</option><option>Formal</option><option>Informal</option></select>
      </div>
      <div className="language-bar-field language-bar-provider">
        <label htmlFor="llm-provider">Provider</label>
        <select id="llm-provider" value={providerId} onChange={(event) => onProviderChange(event.target.value as LlmProviderId)}>{llmProviderOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select>
        <p className="provider-key-status" role="status">
          {hasProviderKey ? `${providerLabel} key on file` : `No ${providerLabel} key`}
          {" · "}<Link href="/settings">Settings</Link>
        </p>
      </div>
    </section>
  );
}
