import Dexie, { type EntityTable } from "dexie";
import type { Game, Note, Phase, Player, VoteRecord } from "../types";

export class ClocktowerNotesDatabase extends Dexie {
  games!: EntityTable<Game, "id">;
  players!: EntityTable<Player, "id">;
  phases!: EntityTable<Phase, "id">;
  notes!: EntityTable<Note, "id">;
  voteRecords!: EntityTable<VoteRecord, "id">;

  constructor() {
    super("ClocktowerNotesDB");

    this.version(1).stores({
      games: "id, date, status, updatedAt",
      players: "id, gameId, seatIndex",
      phases: "id, gameId, number, type",
      notes: "id, gameId, phaseId, updatedAt",
    });

    this.version(2).stores({
      games: "id, date, status, createdAt, pinnedAt, updatedAt",
      players: "id, gameId, seatIndex",
      phases: "id, gameId, number, type",
      notes: "id, gameId, phaseId, updatedAt",
    });

    this.version(3).stores({
      games: "id, date, status, createdAt, pinnedAt, updatedAt",
      players: "id, gameId, seatIndex",
      phases: "id, gameId, number, type",
      notes: "id, gameId, phaseId, updatedAt",
      voteRecords: "id, gameId, phaseId, createdAt, updatedAt",
    });

    this.version(4).stores({
      games: "id, date, status, createdAt, pinnedAt, updatedAt",
      players: "id, gameId, seatIndex",
      phases: "id, gameId, number, type",
      notes: "id, gameId, phaseId, updatedAt",
      voteRecords: "id, gameId, phaseId, createdAt, updatedAt",
    });

    this.version(5).stores({
      games: "id, date, status, createdAt, pinnedAt, updatedAt",
      players: "id, gameId, seatIndex",
      phases: "id, gameId, number, type",
      notes: "id, gameId, phaseId, updatedAt",
      voteRecords: "id, gameId, phaseId, createdAt, updatedAt",
    });

    this.version(6).stores({
      games: "id, date, status, createdAt, pinnedAt, updatedAt",
      players: "id, gameId, seatIndex",
      phases: "id, gameId, number, type",
      notes: "id, gameId, phaseId, updatedAt",
      voteRecords: "id, gameId, phaseId, createdAt, updatedAt",
    });

    this.version(7).stores({
      games: "id, date, status, createdAt, pinnedAt, trashedAt, updatedAt",
      players: "id, gameId, seatIndex",
      phases: "id, gameId, number, type",
      notes: "id, gameId, phaseId, updatedAt",
      voteRecords: "id, gameId, phaseId, createdAt, updatedAt",
    });

    this.version(8).stores({
      games: "id, date, status, createdAt, pinnedAt, trashedAt, updatedAt",
      players: "id, gameId, seatIndex",
      phases: "id, gameId, number, type",
      notes: "id, [gameId+createdAt], gameId, phaseId, kind, updatedAt",
      voteRecords: "id, [gameId+createdAt], gameId, phaseId, createdAt, updatedAt",
    });

    this.version(9).stores({
      games: "id, date, status, createdAt, pinnedAt, trashedAt, hasStarted, currentPhaseId, updatedAt",
      players: "id, gameId, seatIndex",
      phases: "id, gameId, number, type",
      notes: "id, [gameId+createdAt], gameId, phaseId, kind, updatedAt",
      voteRecords: "id, [gameId+createdAt], gameId, phaseId, createdAt, updatedAt",
    });
  }
}

export const db = new ClocktowerNotesDatabase();
