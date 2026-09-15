"use client";

import Link from "next/link";
import { languages, prioritizeLanguage } from "@/lib/languages";
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
  return (
    <aside className="settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading compact">
        <div>
          <p className="section-kicker">02 / Set the bridge</p>
          <h2 id="settings-title">Language context</h2>
        </div>
      </div>
      <label className="preset-label" htmlFor="language-preset">Start from a pair</label>
      <select id="language-preset" defaultValue="" onChange={(event) => {
        const preset = languagePairPresets.find((item) => item.id === event.target.value);
        if (preset) onPresetChange(preset.sourceLanguage, preset.userLanguage);
      }}>
        <option value="">Choose a preset</option>
        {languagePairPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
      </select>
      <div className="language-flow">
        <label><span>Source language</span><select value={sourceLanguage} onChange={(event) => onSourceLanguageChange(event.target.value as Language)}>{prioritizeLanguage(sourceLanguage).map((language) => <option key={language}>{language}</option>)}</select></label>
        <div className="flow-arrow" aria-hidden="true">↓</div>
        <label><span>Explain through</span><select value={explanationLanguage} onChange={(event) => onExplanationLanguageChange(event.target.value as Language)}>{prioritizeLanguage(explanationLanguage).map((language) => <option key={language}>{language}</option>)}</select></label>
      </div>
      <div className="context-note"><span aria-hidden="true">◎</span><p>The explanation language can be different from your native language. That is the point.</p></div>
      <div className="setting-row"><label htmlFor="level">Learner level</label><select id="level" value={learnerLevel} onChange={(event) => onLearnerLevelChange(event.target.value as LearnerLevel)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div>
      <div className="setting-row"><label htmlFor="style">Output style</label><select id="style" value={outputStyle} onChange={(event) => onOutputStyleChange(event.target.value as OutputStyle)}><option>Concise</option><option>Detailed</option><option>Literal</option><option>Natural</option><option>Formal</option><option>Informal</option></select></div>
      <div className="api-key-setting">
        <label htmlFor="llm-provider">Study provider</label>
        <select id="llm-provider" value={providerId} onChange={(event) => onProviderChange(event.target.value as LlmProviderId)}>{llmProviderOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select>
        <p role="status">
          {hasProviderKey
            ? `${llmProviderOptions.find((provider) => provider.id === providerId)?.label} key on file`
            : `No ${llmProviderOptions.find((provider) => provider.id === providerId)?.label} key set yet`}
          {" · "}<Link href="/settings">Manage in Settings</Link>
        </p>
      </div>
      <span className="language-count">{languages.length} languages available</span>
    </aside>
  );
}
