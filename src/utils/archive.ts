import type { Game, Note, Phase, Player } from "../types";
import { createId } from "./ids";
import { timestamp } from "./dates";

export type ArchiveBundle = {
  exportedAt: string;
  version: 1;
  games: Game[];
  players: Player[];
  phases: Phase[];
  notes: Note[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isArchiveBundle = (value: unknown): value is ArchiveBundle => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    Array.isArray(value.games) &&
    Array.isArray(value.players) &&
    Array.isArray(value.phases) &&
    Array.isArray(value.notes)
  );
};

export const makeArchiveBundle = (
  games: Game[],
  players: Player[],
  phases: Phase[],
  notes: Note[],
): ArchiveBundle => ({
  version: 1,
  exportedAt: timestamp(),
  games,
  players,
  phases,
  notes,
});

export const remapArchiveBundle = (bundle: ArchiveBundle) => {
  const gameIdMap = new Map(bundle.games.map((game) => [game.id, createId()]));
  const playerIdMap = new Map(bundle.players.map((player) => [player.id, createId()]));
  const phaseIdMap = new Map(bundle.phases.map((phase) => [phase.id, createId()]));

  const games: Game[] = bundle.games.map((game) => ({
    ...game,
    id: gameIdMap.get(game.id) ?? createId(),
    myPlayerId: game.myPlayerId ? playerIdMap.get(game.myPlayerId) : undefined,
  }));

  const players: Player[] = bundle.players.map((player) => ({
    ...player,
    id: playerIdMap.get(player.id) ?? createId(),
    gameId: gameIdMap.get(player.gameId) ?? player.gameId,
  }));

  const phases: Phase[] = bundle.phases.map((phase) => ({
    ...phase,
    id: phaseIdMap.get(phase.id) ?? createId(),
    gameId: gameIdMap.get(phase.gameId) ?? phase.gameId,
  }));

  const notes: Note[] = bundle.notes.map((note) => ({
    ...note,
    id: createId(),
    gameId: gameIdMap.get(note.gameId) ?? note.gameId,
    phaseId: phaseIdMap.get(note.phaseId) ?? note.phaseId,
    linkedPlayerIds: note.linkedPlayerIds.map((playerId) => playerIdMap.get(playerId) ?? playerId),
  }));

  return { games, players, phases, notes };
};
