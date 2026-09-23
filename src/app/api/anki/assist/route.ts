import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { glossPrompt, readingPrompt } from "@/lib/anki/prompts";
import { isAnkiLanguage, readingLanguages } from "@/lib/anki/vocab";
import { getLlmProvider, getRequestProvider } from "@/lib/llm/provider";
import { requireAccountApiKey } from "@/lib/storage/account";

// Small single-purpose LLM calls for the Anki page: a reading line
// (Thai romanization / Japanese kana) or a short English meaning.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as { kind?: unknown; text?: unknown; language?: unknown } | null;
  const text = body?.text;
  const language = body?.language;
  const kind = body?.kind;
  if (typeof text !== "string" || !text.trim() || text.length > 2000) {
    return NextResponse.json({ error: "Send between 1 and 2,000 characters of text." }, { status: 400 });
  }
  if (typeof language !== "string" || !isAnkiLanguage(language)) {
    return NextResponse.json({ error: "Choose a language that Polyglot Vocab has fields for." }, { status: 400 });
  }
  if (kind !== "reading" && kind !== "gloss") {
    return NextResponse.json({ error: "Ask for a reading or a gloss." }, { status: 400 });
  }
  if (kind === "reading" && !readingLanguages.has(language)) {
    return NextResponse.json({ error: `${language} doesn't use a reading line.` }, { status: 400 });
  }

  try {
    const providerId = getRequestProvider(request);
    const apiKey = await requireAccountApiKey(session.user.id, providerId);
    const provider = getLlmProvider(providerId);
    if (!provider.runRawPrompt) throw new Error("This provider can't run this request.");
    const prompt = kind === "reading" ? readingPrompt(text.trim(), language) : glossPrompt(text.trim(), language);
    const result = (await provider.runRawPrompt(prompt, apiKey)).trim().replace(/^["“]|["”]$/g, "");
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed." }, { status: 502 });
  }
}
