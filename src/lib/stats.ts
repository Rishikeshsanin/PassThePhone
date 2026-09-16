import type { Choice, SessionAwards } from "@/types/game";

export function computeAwards(choices: Choice[]): SessionAwards {
  const selected = new Map<string, number>();
  const hot = new Map<string, number>();
  const categories = new Map<string, Map<string, number>>();
  const chains = new Map<string, number>();

  for (const choice of choices) {
    selected.set(choice.chosen_player_id, (selected.get(choice.chosen_player_id) ?? 0) + 1);
    if (choice.intensity >= 4) {
      hot.set(choice.chosen_player_id, (hot.get(choice.chosen_player_id) ?? 0) + 1);
    }

    const byPlayer = categories.get(choice.category) ?? new Map<string, number>();
    byPlayer.set(choice.chosen_player_id, (byPlayer.get(choice.chosen_player_id) ?? 0) + 1);
    categories.set(choice.category, byPlayer);

    const pair = `${choice.chooser_player_id}::${choice.chosen_player_id}`;
    chains.set(pair, (chains.get(pair) ?? 0) + 1);
  }

  const top = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1])[0];

  const mostChosenEntry = top(selected);
  const heatEntry = top(hot);
  const chainEntry = top(chains);

  return {
    mostChosen: mostChosenEntry
      ? { playerId: mostChosenEntry[0], count: mostChosenEntry[1] }
      : undefined,
    heatSurvivor: heatEntry
      ? { playerId: heatEntry[0], count: heatEntry[1] }
      : undefined,
    strongestChain: chainEntry
      ? {
          from: chainEntry[0].split("::")[0],
          to: chainEntry[0].split("::")[1],
          count: chainEntry[1],
        }
      : undefined,
    categoryWinners: [...categories.entries()]
      .map(([category, map]) => {
        const winner = top(map);
        return winner
          ? { category, playerId: winner[0], count: winner[1] }
          : null;
      })
      .filter((value): value is { category: string; playerId: string; count: number } => Boolean(value)),
  };
}
