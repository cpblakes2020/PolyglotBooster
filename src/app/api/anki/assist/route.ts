import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { describeSelectionPrompt, extractItemsPrompt, followUpPrompt, glossPrompt, readingPrompt, translatePrompt, type FollowUpExchange } from "@/lib/anki/prompts";
import { isAnkiLanguage, readingLanguages } from "@/lib/anki/vocab";
import { japaneseChineseLine, mandarinVariantLines } from "@/lib/chineseScripts";
import { getLlmProvider, getRequestProvider } from "@/lib/llm/provider";
import { requireAccountApiKey } from "@/lib/storage/account";

const kinds = new Set(["reading", "gloss", "extract", "describe", "translate", "followup"]);

// The earlier questions and answers of a follow-up thread, as sent by the page.
function parseThread(value: unknown): FollowUpExchange[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is FollowUpExchange => typeof item?.question === "string" && typeof item?.answer === "string")
    .slice(-10)
    .map((item) => ({ question: item.question.slice(0, 2000), answer: item.answer.slice(0, 10000) }));
}

const levels = new Set(["Beginner", "Intermediate", "Advanced"]);

// Pulls the JSON value out of a model reply, tolerating code fences or a
// sentence of preamble.
function parseJsonReply(reply: string): unknown {
  const start = reply.search(/[[{]/);
  const end = Math.max(reply.lastIndexOf("]"), reply.lastIndexOf("}"));
  if (start < 0 || end < start) throw new Error("The model didn't return the expected list. Please try again.");
  return JSON.parse(reply.slice(start, end + 1));
}

// Small single-purpose LLM calls for the Anki page:
// - reading: Thai romanization / Japanese kana / Mandarin pinyin for a text, plus
//   for Mandarin the other Chinese script and the Japanese kanji form, and for
//   Japanese (context "chinese") the Simplified Chinese form
// - gloss: a short English meaning
// - extract: the learnable items in an analysis (text = analysis, context = the analyzed item)
// - describe: one item the learner selected (text = selection, context = the analysis)
// - translate: the item in another language (text = its filled fields, language = the target)
// - followup: answers a question about a note (text = the question, context =
//   the analysis, plus item, english, thread, learnerLevel and outputStyle)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    kind?: unknown; text?: unknown; language?: unknown; context?: unknown;
    item?: unknown; english?: unknown; thread?: unknown; learnerLevel?: unknown; outputStyle?: unknown;
  } | null;
  const kind = body?.kind;
  const text = body?.text;
  const language = body?.language;
  const context = typeof body?.context === "string" ? body.context.slice(0, 20000) : "";
  if (typeof kind !== "string" || !kinds.has(kind)) {
    return NextResponse.json({ error: "Unsupported request." }, { status: 400 });
  }
  const maxLength = kind === "extract" ? 20000 : 2000;
  if (typeof text !== "string" || !text.trim() || text.length > maxLength) {
    return NextResponse.json({ error: `Send between 1 and ${maxLength.toLocaleString()} characters of text.` }, { status: 400 });
  }
  if (typeof language !== "string" || !isAnkiLanguage(language)) {
    return NextResponse.json({ error: "Choose a language that Polyglot Vocab has fields for." }, { status: 400 });
  }
  if (kind === "reading" && !readingLanguages.has(language)) {
    return NextResponse.json({ error: `${language} doesn't use a reading line.` }, { status: 400 });
  }

  try {
    const providerId = getRequestProvider(request);
    const apiKey = await requireAccountApiKey(session.user.id, providerId);
    const provider = getLlmProvider(providerId);
    if (!provider.runRawPrompt) throw new Error("This provider can't run this request.");
    const trimmed = text.trim();
    const prompt = kind === "reading" ? readingPrompt(trimmed, language)
      : kind === "gloss" ? glossPrompt(trimmed, language)
      : kind === "extract" ? extractItemsPrompt(trimmed, context, language)
      : kind === "translate" ? translatePrompt(trimmed, language)
      : kind === "followup" ? followUpPrompt({
        question: trimmed,
        item: typeof body?.item === "string" ? body.item.slice(0, 2000) : "",
        english: typeof body?.english === "string" ? body.english.slice(0, 2000) : "",
        analysis: context,
        earlier: parseThread(body?.thread),
        language,
        learnerLevel: typeof body?.learnerLevel === "string" && levels.has(body.learnerLevel) ? body.learnerLevel : "Intermediate",
        outputStyle: typeof body?.outputStyle === "string" ? body.outputStyle.slice(0, 40) : "Concise",
      })
      : describeSelectionPrompt(trimmed, context, language);
    const reply = (await provider.runRawPrompt(prompt, apiKey)).trim();
    if (kind === "followup") return NextResponse.json({ result: reply });
    if (kind === "extract" || kind === "describe") return NextResponse.json({ result: parseJsonReply(reply) });
    if (kind === "reading") {
      const reading = reply.replace(/^["“]|["”]$/g, "");
      const extra = language === "Mandarin" ? mandarinVariantLines(trimmed) : language === "Japanese" && context === "chinese" ? [japaneseChineseLine(trimmed)] : [];
      return NextResponse.json({ result: [reading, ...extra.filter(Boolean)].join("\n") });
    }
    return NextResponse.json({ result: reply.replace(/^["“]|["”]$/g, "") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed." }, { status: 502 });
  }
}
