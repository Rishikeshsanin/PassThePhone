import type { GameCategory, Question } from "@/types/game";
import { CLASSIC_QUESTIONS } from "./question-sets/classic";
import { FUNNY_QUESTIONS } from "./question-sets/funny";
import { WHOLESOME_QUESTIONS } from "./question-sets/wholesome";
import { PERSONAL_QUESTIONS } from "./question-sets/personal";
import { DARK_QUESTIONS } from "./question-sets/dark";
import { ADULT_QUESTIONS } from "./question-sets/adult";
import { FANTASY_QUESTIONS } from "./question-sets/fantasy";

const SETS = {
  classic: CLASSIC_QUESTIONS,
  funny: FUNNY_QUESTIONS,
  wholesome: WHOLESOME_QUESTIONS,
  personal: PERSONAL_QUESTIONS,
  dark: DARK_QUESTIONS,
  adult: ADULT_QUESTIONS,
  fantasy: FANTASY_QUESTIONS,
} satisfies Record<Exclude<GameCategory, "popular">, readonly string[]>;

const AWARDS: Record<Exclude<GameCategory, "popular">, readonly string[]> = {
  classic: ["support","success","romance","survival","trust","humour","responsibility","leadership","adventure","main-character"],
  funny: ["chaos","humour","predictable","social"],
  wholesome: ["trust","loyalty","care","support"],
  personal: ["romance","mystery","care","overthinker","social"],
  dark: ["chaos","survival","mystery"],
  adult: ["romance","social","care"],
  fantasy: ["leadership","survival","hero","adventure","chaos"],
};

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

export const QUESTIONS: Question[] = (Object.entries(SETS) as Array<[Exclude<GameCategory, "popular">, readonly string[]]>).flatMap(
  ([category, texts]) => texts.map((text, index) => ({
    id: `${category}-${String(index + 1).padStart(3, "0")}`,
    text,
    category,
    intensity: intensityFor(category, index),
    popularity: quality(index, 1),
    relatability: quality(index, 5),
    allowSelf: true,
    awardCategory: AWARDS[category][index % AWARDS[category].length],
    tags: [category],
  })),
);

export const QUESTION_COUNTS = Object.fromEntries(
  Object.entries(SETS).map(([category, texts]) => [category, texts.length]),
) as Record<Exclude<GameCategory, "popular">, number>;
