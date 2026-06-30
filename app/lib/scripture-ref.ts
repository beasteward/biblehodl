// Scripture reference parsing + detection.
//
// Shared by: in-chat reference linking (detect "John 3:16" in messages and make
// it tappable) and reading-plan deep-links. Detection is anchored on a known
// book-name dictionary so arbitrary "3:16" or "Section 2:3" text never matches.

export interface ScriptureRef {
  book: string; // canonical CPDV book name, e.g. "1 John"
  chapter: number;
  verse?: number;
  endVerse?: number;
}

// canonical name → alias spellings (lowercased). Canonical is included
// implicitly. Numbered/multi-word books get both spaced and unspaced variants
// generated below.
const BOOK_ALIASES: Record<string, string[]> = {
  Genesis: ["gen", "gn"],
  Exodus: ["exo", "ex", "exod"],
  Leviticus: ["lev", "lv"],
  Numbers: ["num", "nm", "nb"],
  Deuteronomy: ["deut", "dt"],
  Joshua: ["josh", "jos"],
  Judges: ["judg", "jdg"],
  Ruth: ["rt"],
  "1 Samuel": ["1 sam", "1sam", "1 sm"],
  "2 Samuel": ["2 sam", "2sam", "2 sm"],
  "1 Kings": ["1 kgs", "1kgs", "1 ki"],
  "2 Kings": ["2 kgs", "2kgs", "2 ki"],
  "1 Chronicles": ["1 chron", "1chron", "1 chr"],
  "2 Chronicles": ["2 chron", "2chron", "2 chr"],
  Ezra: ["ezr"],
  Nehemiah: ["neh"],
  Tobit: ["tob", "tb"],
  Judith: ["jdt"],
  Esther: ["est"],
  Job: ["jb"],
  Psalms: ["psalm", "psa", "ps", "pss"],
  Proverbs: ["prov", "prv", "pr"],
  Ecclesiastes: ["eccl", "ecc", "qoh"],
  "Song of Songs": ["song of solomon", "song", "sos", "canticles", "cant"],
  Wisdom: ["wis", "ws"],
  Sirach: ["sir", "ecclesiasticus"],
  Isaiah: ["isa", "is"],
  Jeremiah: ["jer", "jr"],
  Lamentations: ["lam", "lm"],
  Baruch: ["bar"],
  Ezekiel: ["ezek", "ezk", "eze"],
  Daniel: ["dan", "dn"],
  Hosea: ["hos", "ho"],
  Joel: ["jl"],
  Amos: ["am"],
  Obadiah: ["obad", "ob"],
  Jonah: ["jon", "jnh"],
  Micah: ["mic", "mi"],
  Nahum: ["nah", "na"],
  Habakkuk: ["hab", "hb"],
  Zephaniah: ["zeph", "zep"],
  Haggai: ["hag", "hg"],
  Zechariah: ["zech", "zec"],
  Malachi: ["mal", "ml"],
  "1 Maccabees": ["1 macc", "1macc", "1 mac"],
  "2 Maccabees": ["2 macc", "2macc", "2 mac"],
  Matthew: ["matt", "mt"],
  Mark: ["mk", "mrk"],
  Luke: ["lk", "luk"],
  John: ["jn", "jhn"],
  Acts: ["act"],
  Romans: ["rom", "rm"],
  "1 Corinthians": ["1 cor", "1cor", "1 co"],
  "2 Corinthians": ["2 cor", "2cor", "2 co"],
  Galatians: ["gal", "ga"],
  Ephesians: ["eph"],
  Philippians: ["phil", "php"],
  Colossians: ["col"],
  "1 Thessalonians": ["1 thess", "1thess", "1 th"],
  "2 Thessalonians": ["2 thess", "2thess", "2 th"],
  "1 Timothy": ["1 tim", "1tim", "1 ti"],
  "2 Timothy": ["2 tim", "2tim", "2 ti"],
  Titus: ["tit"],
  Philemon: ["philem", "phm"],
  Hebrews: ["heb"],
  James: ["jas", "jm"],
  "1 Peter": ["1 pet", "1pet", "1 pt"],
  "2 Peter": ["2 pet", "2pet", "2 pt"],
  "1 John": ["1 jn", "1jn", "1 jhn"],
  "2 John": ["2 jn", "2jn", "2 jhn"],
  "3 John": ["3 jn", "3jn", "3 jhn"],
  Jude: ["jud"],
  Revelation: ["rev", "rv", "apocalypse", "apoc"],
};

// Build alias → canonical lookup and a regex-safe, length-sorted alternation.
const aliasToCanonical = new Map<string, string>();
const aliasPatterns: string[] = [];

function addAlias(alias: string, canonical: string) {
  const key = alias.toLowerCase();
  if (!aliasToCanonical.has(key)) aliasToCanonical.set(key, canonical);
}

for (const [canonical, aliases] of Object.entries(BOOK_ALIASES)) {
  const variants = new Set<string>([canonical, ...aliases]);
  // For spaced names, also accept the un-spaced form ("1 John" → "1john").
  for (const v of [...variants]) {
    if (v.includes(" ")) variants.add(v.replace(/\s+/g, ""));
  }
  for (const v of variants) addAlias(v, canonical);
}

// Longest aliases first so "Song of Songs" wins over "Song", etc.
const sortedAliases = [...aliasToCanonical.keys()].sort((a, b) => b.length - a.length);
for (const a of sortedAliases) {
  // Escape regex metacharacters; allow flexible internal whitespace.
  const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  aliasPatterns.push(esc);
}

const BOOK_GROUP = `(${aliasPatterns.join("|")})`;
// A reference must have at least chapter:verse to be detected in free text.
const REF_DETECT = new RegExp(
  `(?<![\\w.])${BOOK_GROUP}\\.?\\s+(\\d+):(\\d+)(?:[-\u2013](\\d+))?(?![\\w:])`,
  "gi"
);

function canonicalize(bookText: string): string | null {
  return aliasToCanonical.get(bookText.toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ").trim()) ?? null;
}

/**
 * Parse a single reference string ("John 3:16", "1 John 2:1-3", "Psalm 23").
 * Accepts chapter-only refs (verse optional). Returns null if the book is
 * unrecognized or the shape is invalid.
 */
export function parseScriptureRef(input: string): ScriptureRef | null {
  const m = input.trim().match(/^(.+?)\.?\s+(\d+)(?::(\d+)(?:[-\u2013](\d+))?)?$/);
  if (!m) return null;
  const canonical = canonicalize(m[1]);
  if (!canonical) return null;
  return {
    book: canonical,
    chapter: Number(m[2]),
    verse: m[3] ? Number(m[3]) : undefined,
    endVerse: m[4] ? Number(m[4]) : undefined,
  };
}

export interface RefMatch {
  start: number;
  end: number;
  text: string; // the matched substring as written
  ref: ScriptureRef;
  refString: string; // canonical "Book c:v[-e]" for navigation
}

/** Find all chapter:verse references in free text (for chat linkification). */
export function findScriptureRefs(text: string): RefMatch[] {
  const out: RefMatch[] = [];
  REF_DETECT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_DETECT.exec(text)) !== null) {
    const canonical = canonicalize(m[1]);
    if (!canonical) continue;
    const chapter = Number(m[2]);
    const verse = Number(m[3]);
    const endVerse = m[4] ? Number(m[4]) : undefined;
    const refString = endVerse
      ? `${canonical} ${chapter}:${verse}-${endVerse}`
      : `${canonical} ${chapter}:${verse}`;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      ref: { book: canonical, chapter, verse, endVerse },
      refString,
    });
  }
  return out;
}
