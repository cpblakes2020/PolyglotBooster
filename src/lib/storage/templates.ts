import { readJsonBlob, writeJsonBlob } from "@/lib/storage/blob-json";
import type { PromptTemplate } from "@/lib/types";

const templatesPathname = "lingua/templates.json";

export async function listTemplates(): Promise<PromptTemplate[]> {
  return readJsonBlob<PromptTemplate[]>(templatesPathname, []);
}

export async function getTemplate(id: string): Promise<PromptTemplate | undefined> {
  const templates = await listTemplates();
  return templates.find((template) => template.id === id);
}

export async function createTemplate(input: Omit<PromptTemplate, "updatedAt">): Promise<PromptTemplate> {
  const templates = await listTemplates();
  if (templates.some((template) => template.id === input.id)) {
    throw new Error("A task with this name already exists for this language.");
  }
  const created: PromptTemplate = { ...input, updatedAt: new Date().toISOString() };
  templates.push(created);
  await writeJsonBlob(templatesPathname, templates);
  return created;
}

export async function updateTemplate(id: string, input: Omit<PromptTemplate, "id" | "updatedAt">): Promise<PromptTemplate> {
  const templates = await listTemplates();
  const index = templates.findIndex((template) => template.id === id);
  if (index === -1) throw new Error("Task not found.");
  const updated: PromptTemplate = { ...input, id, updatedAt: new Date().toISOString() };
  templates[index] = updated;
  await writeJsonBlob(templatesPathname, templates);
  return updated;
}

export async function deleteTemplate(id: string): Promise<void> {
  const templates = await listTemplates();
  await writeJsonBlob(templatesPathname, templates.filter((template) => template.id !== id));
}
