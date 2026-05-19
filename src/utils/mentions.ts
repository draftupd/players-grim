import type { Player } from "../types";

const mentionPattern = /@([\p{L}\p{N}_-]+)/gu;

const normalizeMention = (value: string) => value.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

export const uniqueIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

export const getMentionedPlayerIds = (text: string, players: Player[]) => {
  const playersByName = new Map(players.map((player) => [normalizeMention(player.name), player.id]));
  const ids: string[] = [];

  for (const match of text.matchAll(mentionPattern)) {
    const playerId = playersByName.get(normalizeMention(match[1]));

    if (playerId) {
      ids.push(playerId);
    }
  }

  return uniqueIds(ids);
};

export const mergeManualAndMentionLinks = (text: string, players: Player[], manualIds: string[]) =>
  uniqueIds([...manualIds, ...getMentionedPlayerIds(text, players)]);
