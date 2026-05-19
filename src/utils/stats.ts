import type { Game, Note, Player } from "../types";

export type LibraryStats = {
  totalGames: number;
  finishedGames: number;
  activeGames: number;
  totalNotes: number;
  totalPlayers: number;
  averagePlayers: number;
  averageFinishedGameMinutes: number;
  goodWins: number;
  evilWins: number;
  otherWins: number;
  myGoodWins: number;
  myEvilWins: number;
  uniqueScripts: number;
  topScript?: string;
  topStoryteller?: string;
};

const topLabelFromCounts = (counts: Map<string, number>) => {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  return sorted[0]?.[0];
};

export const calculateLibraryStats = (games: Game[], players: Player[], notes: Note[]): LibraryStats => {
  const visibleGames = games.filter((game) => !game.trashedAt);
  const visibleGameIds = new Set(visibleGames.map((game) => game.id));
  const visiblePlayers = players.filter((player) => visibleGameIds.has(player.gameId));
  const visibleNotes = notes.filter((note) => visibleGameIds.has(note.gameId));
  const finishedGames = visibleGames.filter((game) => game.status === "finished").length;
  const activeGames = visibleGames.length - finishedGames;
  const goodWins = visibleGames.filter((game) => game.winner === "good").length;
  const evilWins = visibleGames.filter((game) => game.winner === "evil").length;
  const otherWins = visibleGames.filter((game) => game.winner === "other").length;
  const myGoodWins = visibleGames.filter((game) => game.status === "finished" && game.myTeam === "good" && game.winner === "good").length;
  const myEvilWins = visibleGames.filter((game) => game.status === "finished" && game.myTeam === "evil" && game.winner === "evil").length;
  const totalPlayers = visiblePlayers.filter((player) => !player.isTraveller).length;
  const scriptCounts = new Map<string, number>();
  const storytellerCounts = new Map<string, number>();
  const finishedGameDurations = visibleGames
    .filter((game) => game.status === "finished" && game.startedAt && game.finishedAt)
    .map((game) => Math.max(0, new Date(game.finishedAt!).getTime() - new Date(game.startedAt!).getTime()) / 60000);

  for (const game of visibleGames) {
    if (game.scriptName?.trim()) {
      scriptCounts.set(game.scriptName, (scriptCounts.get(game.scriptName) ?? 0) + 1);
    }

    if (game.storyteller?.trim()) {
      storytellerCounts.set(game.storyteller, (storytellerCounts.get(game.storyteller) ?? 0) + 1);
    }
  }

  return {
    totalGames: visibleGames.length,
    finishedGames,
    activeGames,
    totalNotes: visibleNotes.length,
    totalPlayers,
    averagePlayers: visibleGames.length > 0 ? totalPlayers / visibleGames.length : 0,
    averageFinishedGameMinutes:
      finishedGameDurations.length > 0
        ? finishedGameDurations.reduce((sum, minutes) => sum + minutes, 0) / finishedGameDurations.length
        : 0,
    goodWins,
    evilWins,
    otherWins,
    myGoodWins,
    myEvilWins,
    uniqueScripts: scriptCounts.size,
    topScript: topLabelFromCounts(scriptCounts),
    topStoryteller: topLabelFromCounts(storytellerCounts),
  };
};
