import path from "node:path";
import kuromoji, { type IpadicFeatures, type Tokenizer } from "kuromoji";
import type { createJapaneseDictionary, JmEntry } from "@/lib/dictionary/japanese";

// Japanese word splitting (kuromoji, IPADIC dictionary) for server code: a
// sentence into its words, each with its dictionary form, so conjugated
// verbs and adjectives can be looked up (行きました → 行く).
let tokenizer: Promise<Tokenizer<IpadicFeatures>> | null = null;

function japaneseTokenizer() {
  tokenizer ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: path.join(process.cwd(), "node_modules", "kuromoji", "dict") }).build((error, built) => {
      if (error) { tokenizer = null; reject(error); } else resolve(built);
    });
  });
  return tokenizer;
}

const toHiragana = (text: string) => text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));

// Parts of speech worth a dictionary entry; particles, auxiliaries, symbols
// and numbers aren't.
const contentPos = new Set(["名詞", "動詞", "形容詞", "副詞", "連体詞", "接続詞", "感動詞"]);
const skippedNounTypes = new Set(["数", "非自立", "接尾", "特殊"]);
const isContent = (token: IpadicFeatures) => contentPos.has(token.pos) && !(token.pos === "名詞" && skippedNounTypes.has(token.pos_detail_1)) && !(token.pos === "動詞" && (token.pos_detail_1 === "非自立" || token.pos_detail_1 === "接尾"));

export type TextWord = {
  // As written in the text, and its dictionary form (looked up).
  surface: string;
  base: string;
  // Reading of the form as written, in hiragana.
  reading: string;
  entries: JmEntry[];
};

// The distinct content words of a text that are in JMdict, in order of
// appearance. Runs of nouns are tried as one compound first (神仏 + 分離 →
// 神仏分離), so dictionary compounds aren't split.
export async function japaneseTextWords(text: string, dictionary: ReturnType<typeof createJapaneseDictionary>, limit = 60) {
  const tokens = (await japaneseTokenizer()).tokenize(text.slice(0, 6000));
  const words: TextWord[] = [];
  const seen = new Set<string>();
  const add = async (surface: string, base: string, reading: string) => {
    if (seen.has(base) || words.length >= limit) return seen.has(base);
    const found = await dictionary.lookup(base);
    if (!found?.exact.length) return false;
    seen.add(base);
    words.push({ surface, base, reading: toHiragana(reading), entries: found.exact });
    return true;
  };
  for (let i = 0; i < tokens.length && words.length < limit; i++) {
    const token = tokens[i];
    // An honorific prefix (お, ご, 御) starts a noun run of its own, so
    // お会式 is looked up whole before 会式.
    const prefixed = token.pos === "接頭詞" && tokens[i + 1]?.pos === "名詞";
    if (!isContent(token) && !prefixed) continue;
    // A noun run: the longest dictionary compound starting here.
    if (token.pos === "名詞" || prefixed) {
      let end = i;
      while (end + 1 < tokens.length && tokens[end + 1].pos === "名詞" && end - i < 4) end++;
      let matched = false;
      for (let last = end; last > i && !matched; last--) {
        const run = tokens.slice(i, last + 1);
        if (await add(run.map((t) => t.surface_form).join(""), run.map((t) => t.surface_form).join(""), run.map((t) => t.reading || t.surface_form).join(""))) {
          i = last;
          matched = true;
        }
      }
      if (matched || prefixed) continue;
    }
    const base = token.basic_form && token.basic_form !== "*" ? token.basic_form : token.surface_form;
    await add(token.surface_form, base, token.reading || token.surface_form);
  }
  return words;
}
