// One-time seed script for the shared task-template library.
// Run once against a fresh deployment: node --env-file=.env.local scripts/seed-templates.mjs
// Safe to re-run -- it overwrites lingua/templates.json with this exact seed set.
import { put } from "@vercel/blob";

const languages = ["Japanese", "Mandarin", "Thai", "Indonesian", "Spanish", "English", "French"];
const now = new Date().toISOString();

const general = [
  { id: "vocabulary", name: "Build vocabulary", description: "Useful words from this text", instruction: "Create a focused vocabulary list with definitions, parts of speech, examples, and useful nuance.", icon: "▤" },
  { id: "flashcards", name: "Make flashcards", description: "Anki-ready, reversible by default", instruction: "Create concise flashcard entries suitable for Anki. Return only valid JSON with this exact shape: {\"cards\":[{\"front\":\"source-language prompt\",\"back\":\"explanation-language answer\",\"tags\":[\"topic\"]}]}. Create one object for each useful card. Do not use Markdown or code fences.", icon: "⇄" },
  { id: "register-conversion", name: "Convert register", description: "Formal ↔ informal, any language", instruction: "Convert the source between formal and informal register. Preserve meaning, explain the register changes, and provide the converted version.", icon: "↕" },
  { id: "extract-text", name: "Extract text exactly", description: "Preserve the source wording and structure", instruction: "Extract the text exactly as provided. Preserve paragraph breaks and do not translate or paraphrase.", icon: "Ex" },
  { id: "translate", name: "Translate naturally", description: "A natural translation with useful nuance", instruction: "Translate the source naturally while preserving meaning, tone, and important nuance.", icon: "Tr" },
  { id: "grammar", name: "Explain grammar", description: "Patterns and forms worth noticing", instruction: "Identify and explain the important grammar patterns in the source text with clear examples.", icon: "Gr" },
  { id: "reading-support", name: "Add reading support", description: "Transliteration and pronunciation help", instruction: "Add appropriate reading support or transliteration, preserving the original script alongside it.", icon: "Rd" },
  { id: "questions", name: "Answer questions", description: "Ask anything about this text", instruction: "Answer questions about the source text accurately and cite the relevant wording when useful.", icon: "Q" },
].map((template) => ({ ...template, scope: "general", updatedAt: now }));

const thaiScript = [{
  id: "thai-script-conversion",
  name: "Convert Thai Script",
  description: "Loopless Thai -> regular Thai script",
  instruction: "Convert loopless modern Thai script into regular Thai script. Preserve the Thai meaning and return only the corrected Thai text plus brief notes about meaningful changes.",
  icon: "ก",
  scope: "Thai",
  updatedAt: now,
}];

const wordAnalysis = languages.map((language) => ({
  id: `word-analysis-${language.toLowerCase()}`,
  name: `Word Analysis ${language}`,
  description: "Roots, forms, nuance, examples",
  instruction: language === "Japanese"
    ? "Analyze the word or phrase for root, base form, stem, morphology, related words, definitions, synonyms, examples, register, and nuance. For Japanese compounds, include kanji meanings and structure."
    : "Analyze the word or phrase for root, base form, stem, morphology, related words, definitions, synonyms, examples, register, and nuance.",
  icon: "Aa",
  scope: language,
  updatedAt: now,
}));

const sentenceGuide = languages.map((language) => ({
  id: `sentence-guide-${language.toLowerCase()}`,
  name: `Sentence Guide ${language}`,
  description: "Meaning, grammar, line by line",
  instruction: "Explain the text sentence by sentence, including meaning, grammar, and notable usage.",
  icon: "文",
  scope: language,
  updatedAt: now,
}));

const templates = [...general, ...thaiScript, ...wordAnalysis, ...sentenceGuide];

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set. Run with: node --env-file=.env.local scripts/seed-templates.mjs");

const result = await put("lingua/templates.json", JSON.stringify(templates, null, 2), {
  access: "public",
  contentType: "application/json",
  addRandomSuffix: false,
  allowOverwrite: true,
  token,
});

console.log(`Seeded ${templates.length} templates to ${result.url}`);
