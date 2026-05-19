import type { Game, Note, Phase, Player, VoteRecord } from "../types";
import { createId } from "./ids";
import { timestamp } from "./dates";

export type ArchiveBundle = {
  exportedAt: string;
  version: 2;
  games: Game[];
  players: Player[];
  phases: Phase[];
  notes: Note[];
  voteRecords: VoteRecord[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isArchiveBundle = (value: unknown): value is ArchiveBundle => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.version === 1 || value.version === 2) &&
    Array.isArray(value.games) &&
    Array.isArray(value.players) &&
    Array.isArray(value.phases) &&
    Array.isArray(value.notes) &&
    (value.version === 1 || Array.isArray(value.voteRecords))
  );
};

export const makeArchiveBundle = (
  games: Game[],
  players: Player[],
  phases: Phase[],
  notes: Note[],
  voteRecords: VoteRecord[],
): ArchiveBundle => ({
  version: 2,
  exportedAt: timestamp(),
  games,
  players,
  phases,
  notes,
  voteRecords,
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

  const voteRecords: VoteRecord[] = (bundle.voteRecords ?? []).map((voteRecord) => ({
    ...voteRecord,
    id: createId(),
    gameId: gameIdMap.get(voteRecord.gameId) ?? voteRecord.gameId,
    phaseId: phaseIdMap.get(voteRecord.phaseId) ?? voteRecord.phaseId,
    nominatorPlayerId: playerIdMap.get(voteRecord.nominatorPlayerId) ?? voteRecord.nominatorPlayerId,
    nomineePlayerId: playerIdMap.get(voteRecord.nomineePlayerId) ?? voteRecord.nomineePlayerId,
    voterPlayerIds: voteRecord.voterPlayerIds.map((playerId) => playerIdMap.get(playerId) ?? playerId),
    deadVoterPlayerIds: voteRecord.deadVoterPlayerIds.map((playerId) => playerIdMap.get(playerId) ?? playerId),
  }));

  return { games, players, phases, notes, voteRecords };
};
