import { QUESTIONS } from "@/data/questions";
import type { GameCategory, Question } from "@/types/game";

const categoryFallback: GameCategory[] = ["classic", "funny", "wholesome", "personal"];

export function pickNextQuestion(input: {
  categories: GameCategory[];
  heat: number;
  usedIds: string[];
  recentQuestions?: Question[];
}) {
  const selected = input.categories.length ? input.categories : categoryFallback;
  const used = new Set(input.usedIds);
  const recentTags = new Set((input.recentQuestions ?? []).flatMap((q) => q.tags));

  let candidates = QUESTIONS.filter(
    (q) => selected.includes(q.category) && !used.has(q.id),
  );

  if (!candidates.length) {
    candidates = QUESTIONS.filter((q) => !used.has(q.id));
  }

  if (!candidates.length) return null;

  const scored = candidates.map((q) => {
    const heatDistance = Math.abs(q.intensity - input.heat);
    const heatScore = 10 - heatDistance * 2.4;
    const freshnessPenalty = q.tags.some((tag) => recentTags.has(tag)) ? 1.8 : 0;
    const quality = q.popularity * 0.55 + q.relatability * 0.45;
    const jitter = Math.random() * 1.4;
    return { q, score: quality + heatScore + jitter - freshnessPenalty };
  });

  scored.sort((a, b) => b.score - a.score);
  const shortlist = scored.slice(0, Math.min(8, scored.length));
  const weighted = shortlist.map((item, index) => ({
    ...item,
    weight: Math.max(1, shortlist.length - index),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.q;
  }

  return weighted[0].q;
}

export function sessionQuestionLimit(length: "20" | "30" | "40" | "unlimited") {
  return length === "unlimited" ? null : Number(length);
}
