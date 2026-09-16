import { CLASSIC_QUESTIONS } from "https://raw.githubusercontent.com/Rishikeshsanin/PassThePhone/3a55459c86d0ee689f9771826054a66c80b6c251/src/data/question-sets/classic.ts";
import { FUNNY_QUESTIONS } from "https://raw.githubusercontent.com/Rishikeshsanin/PassThePhone/3a55459c86d0ee689f9771826054a66c80b6c251/src/data/question-sets/funny.ts";
import { WHOLESOME_QUESTIONS } from "https://raw.githubusercontent.com/Rishikeshsanin/PassThePhone/3a55459c86d0ee689f9771826054a66c80b6c251/src/data/question-sets/wholesome.ts";
import { PERSONAL_QUESTIONS } from "https://raw.githubusercontent.com/Rishikeshsanin/PassThePhone/3a55459c86d0ee689f9771826054a66c80b6c251/src/data/question-sets/personal.ts";
import { DARK_QUESTIONS } from "https://raw.githubusercontent.com/Rishikeshsanin/PassThePhone/3a55459c86d0ee689f9771826054a66c80b6c251/src/data/question-sets/dark.ts";
import { ADULT_QUESTIONS } from "https://raw.githubusercontent.com/Rishikeshsanin/PassThePhone/3a55459c86d0ee689f9771826054a66c80b6c251/src/data/question-sets/adult.ts";
import { FANTASY_QUESTIONS } from "https://raw.githubusercontent.com/Rishikeshsanin/PassThePhone/3a55459c86d0ee689f9771826054a66c80b6c251/src/data/question-sets/fantasy.ts";

export type GameCategory =
  | "classic"
  | "funny"
  | "wholesome"
  | "personal"
  | "dark"
  | "adult"
  | "fantasy"
  | "popular";

export type Question = {
  id: string;
  text: string;
  category: Exclude<GameCategory, "popular">;
  intensity: 1 | 2 | 3 | 4 | 5;
  popularity: number;
  relatability: number;
  allowSelf: boolean;
  awardCategory: string;
  tags: string[];
};

const SETS = {
  classic: CLASSIC_QUESTIONS,
  funny: FUNNY_QUESTIONS,
  wholesome: WHOLESOME_QUESTIONS,
  personal: PERSONAL_QUESTIONS,
  dark: DARK_QUESTIONS,
  adult: ADULT_QUESTIONS,
  fantasy: FANTASY_QUESTIONS,
} as const;

const AWARDS: Record<Exclude<GameCategory, "popular">, readonly string[]> = {
  classic: ["support", "success", "romance", "survival", "trust", "humour", "responsibility", "leadership", "adventure", "main-character"],
  funny: ["chaos", "humour", "predictable", "social"],
  wholesome: ["trust", "loyalty", "care", "support"],
  personal: ["romance", "mystery", "care", "overthinker", "social"],
  dark: ["chaos", "survival", "mystery"],
  adult: ["romance", "social", "care"],
  fantasy: ["leadership", "survival", "hero", "adventure", "chaos"],
};

const BASE_CATEGORIES = Object.keys(SETS) as Array<Exclude<GameCategory, "popular">>;

function intensityFor(category: Exclude<GameCategory, "popular">, index: number): 1 | 2 | 3 | 4 | 5 {
  if (category === "classic") return index < 10 ? 1 : index < 30 ? 2 : 3;
  if (category === "funny") return index < 10 ? 1 : index < 25 ? 2 : index < 38 ? 3 : 4;
  if (category === "wholesome") return index < 10 ? 1 : index < 25 ? 2 : index < 40 ? 3 : 4;
  if (category === "personal") return index < 10 ? 2 : index < 25 ? 3 : index < 38 ? 4 : 5;
  if (category === "dark") return index < 6 ? 2 : index < 22 ? 3 : index < 38 ? 4 : 5;
  if (category === "adult") return index < 10 ? 2 : index < 25 ? 3 : index < 38 ? 4 : 5;
  return index < 8 ? 1 : index < 18 ? 2 : index < 32 ? 3 : index < 42 ? 4 : 5;
}

function quality(index: number, offset: number) {
  return Number((8.7 + (((index * 7) + offset) % 13) / 10).toFixed(1));
}

export const QUESTION_BANK: Question[] = (Object.entries(SETS) as Array<[
  Exclude<GameCategory, "popular">,
  readonly string[],
]>).flatMap(([category, texts]) => texts.map((text, index) => ({
  id: `${category}-${String(index + 1).padStart(3, "0")}`,
  text,
  category,
  intensity: intensityFor(category, index),
  popularity: quality(index, 1),
  relatability: quality(index, 5),
  allowSelf: true,
  awardCategory: AWARDS[category][index % AWARDS[category].length],
  tags: [category],
})));

export function validCategories(input: unknown): GameCategory[] {
  if (!Array.isArray(input)) return ["classic"];
  const unique = [...new Set(input.filter((item): item is GameCategory =>
    typeof item === "string" && ([...BASE_CATEGORIES, "popular"] as string[]).includes(item),
  ))];
  return unique.length ? unique.slice(0, 8) : ["classic"];
}

export function pickQuestion(input: {
  categories: GameCategory[];
  heat: number;
  usedIds: string[];
}): Question | null {
  const used = new Set(input.usedIds);
  const hasPopular = input.categories.includes("popular");
  const selected = input.categories.filter((c): c is Exclude<GameCategory, "popular"> => c !== "popular");
  const activeCategories = selected.length ? selected : BASE_CATEGORIES;

  let candidates = QUESTION_BANK.filter((q) => activeCategories.includes(q.category) && !used.has(q.id));
  if (!candidates.length) candidates = QUESTION_BANK.filter((q) => !used.has(q.id));
  if (!candidates.length) return null;

  const scored = candidates.map((q) => {
    const heatDistance = Math.abs(q.intensity - input.heat);
    const heatScore = 10 - heatDistance * 2.5;
    const qualityScore = q.popularity * 0.55 + q.relatability * 0.45;
    const popularBoost = hasPopular ? (q.popularity + q.relatability) * 0.22 : 0;
    return { q, score: heatScore + qualityScore + popularBoost + Math.random() * 1.25 };
  });

  scored.sort((a, b) => b.score - a.score);
  const shortlist = scored.slice(0, Math.min(12, scored.length));
  const total = shortlist.reduce((sum, _item, index) => sum + Math.max(1, shortlist.length - index), 0);
  let roll = Math.random() * total;
  for (let index = 0; index < shortlist.length; index += 1) {
    roll -= Math.max(1, shortlist.length - index);
    if (roll <= 0) return shortlist[index].q;
  }
  return shortlist[0].q;
}
