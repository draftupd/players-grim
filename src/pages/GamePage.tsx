import { ArrowLeft, CheckCircle2, Clock3, Crown, Gavel, Save, Settings, Skull, Target, Users, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import NightOrderPanel from "../components/NightOrderPanel";
import PhaseNotes from "../components/PhaseNotes";
import PhaseTabs from "../components/PhaseTabs";
import PlayerCircle from "../components/PlayerCircle";
import PlayerDetailModal from "../components/PlayerDetailModal";
import RoleReferencePanel from "../components/RoleReferencePanel";
import SetupEditorModal from "../components/SetupEditorModal";
import { db } from "../db/db";
import type {
  Game,
  Note,
  Phase,
  Player,
  PlayerVoteAvailability,
  VoteDraft,
  VoteRecord,
  Winner,
} from "../types";
import {
  formatDate,
  personalResultLabel,
  personalTeamLabel,
  gameDisplayTitle,
  phaseTitle,
  sortPhases,
  timestamp,
  timeInputValue,
  combineDateAndTime,
  winnerLabel,
} from "../utils/dates";
import { createId } from "../utils/ids";
import { getRoleLabel } from "../utils/scripts";
import { mergeReferenceRoles, useReferenceData } from "../utils/referenceData";

const findMyPlayerIdByRole = (players: Player[], myRoleId?: string) => {
  if (!myRoleId) {
    return undefined;
  }

  const matches = players.filter((player) => {
    const visibleRoleId = player.isTraveller ? player.travellerRole ?? player.mainRole : player.mainRole;
    return visibleRoleId === myRoleId;
  });

  return matches.length === 1 ? matches[0].id : undefined;
};

const buildVotingNoteText = ({
  voteNumber,
  phaseTitleText,
  nominatorName,
  nomineeName,
  voterNames,
  deadVoterNames,
  alivePlayerCount,
}: {
  voteNumber: number;
  phaseTitleText: string;
  nominatorName: string;
  nomineeName: string;
  voterNames: string[];
  deadVoterNames: string[];
  alivePlayerCount: number;
}) => {
  const threshold = Math.ceil(alivePlayerCount / 2);
  const voteCount = voterNames.length;
  const outcome = voteCount >= threshold ? "достаточно голосов для казни" : "недостаточно голосов";

  return [
    `Голосование #${voteNumber}`,
    `Фаза: ${phaseTitleText}`,
    `Номинировал: ${nominatorName}`,
    `Номинирован: ${nomineeName}`,
    `Голосовали (${voteCount}): ${voterNames.length > 0 ? voterNames.join(", ") : "никто"}`,
    `Мертвые голоса: ${deadVoterNames.length > 0 ? deadVoterNames.join(", ") : "нет"}`,
    `Порог: ${threshold} из ${alivePlayerCount} живых`,
    `Итог: ${outcome}`,
  ].join("\n");
};

type VoteAnalysis = {
  voteRecord: VoteRecord;
  voteNumber: number;
  voteCount: number;
  threshold: number;
  thresholdLabel: string;
  voteCountLabel: string;
  remainingAliveVotes: number;
  remainingDeadVotes: number;
  neededToTie: number;
  neededToBeat: number;
  canTie: boolean;
  canBeat: boolean;
  isOnTheBlock: boolean;
  removedPreviousFromBlock: boolean;
  statusLabel: string;
  prognosisLabel: string;
};

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [gameInfoOpen, setGameInfoOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [finishWinner, setFinishWinner] = useState<Winner>("unknown");
  const [finishNotes, setFinishNotes] = useState("");
  const [finishTime, setFinishTime] = useState("");
  const [localMyPlayerId, setLocalMyPlayerId] = useState<string | null | undefined>();
  const [voteDraft, setVoteDraft] = useState<VoteDraft | null>(null);
  const [voteSaving, setVoteSaving] = useState(false);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [executionPlayerId, setExecutionPlayerId] = useState("");
  const [executionSaving, setExecutionSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [contentTab, setContentTab] = useState<"notes" | "reference" | "voting">("notes");
  const [referenceTab, setReferenceTab] = useState<"roles" | "nightOrder">("roles");
  const { data: referenceData } = useReferenceData();

  const gameResult = useLiveQuery(
    async () => ({
      loading: false,
      game: gameId ? await db.games.get(gameId) : undefined,
    }),
    [gameId],
    { loading: true, game: undefined },
  );

  const players = useLiveQuery(
    async (): Promise<Player[]> =>
      gameId ? db.players.where("gameId").equals(gameId).sortBy("seatIndex") : [],
    [gameId],
    [],
  );

  const phases = useLiveQuery(
    async (): Promise<Phase[]> =>
      gameId ? sortPhases(await db.phases.where("gameId").equals(gameId).toArray()) : [],
    [gameId],
    [],
  );

  const notes = useLiveQuery(
    async (): Promise<Note[]> =>
      gameId
        ? (await db.notes.where("gameId").equals(gameId).toArray()).sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          )
        : [],
    [gameId],
    [],
  );

  const voteRecords = useLiveQuery(
    async (): Promise<VoteRecord[]> =>
      gameId
        ? (await db.voteRecords.where("gameId").equals(gameId).toArray()).sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          )
        : [],
    [gameId],
    [],
  );

  const effectiveSelectedPhaseId = phases.some((phase) => phase.id === selectedPhaseId)
    ? selectedPhaseId
    : phases[0]?.id;
  const selectedPhase = phases.find((phase) => phase.id === effectiveSelectedPhaseId);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const storedOrDerivedMyPlayerId =
    gameResult.game?.myPlayerId ?? findMyPlayerIdByRole(players, gameResult.game?.myRoleId);
  const effectiveMyPlayerId =
    localMyPlayerId === undefined ? storedOrDerivedMyPlayerId : localMyPlayerId || undefined;

  const selectedPhaseNotes = useMemo(
    () =>
      notes.filter(
        (note) =>
          note.phaseId === effectiveSelectedPhaseId &&
          note.kind !== "vote_history" &&
          note.kind !== "execution",
      ),
    [notes, effectiveSelectedPhaseId],
  );
  const selectedPhaseVoteNotes = useMemo(
    () =>
      notes
        .filter((note) => note.phaseId === effectiveSelectedPhaseId && note.kind === "vote_history")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notes, effectiveSelectedPhaseId],
  );
  const roleReferenceRoles = useMemo(() => {
    const extraRoleIds = [
      ...players.flatMap((player) => [
        player.mainRole,
        player.travellerRole,
        ...player.additionalRoles,
      ]),
      ...(gameResult.game?.activeFabledIds ?? []),
      ...(gameResult.game?.activeLoricIds ?? []),
    ].filter((roleId): roleId is string => Boolean(roleId));

    return mergeReferenceRoles(
      gameResult.game?.scriptRoles ?? [],
      referenceData?.roleMap ?? new Map(),
      extraRoleIds,
    );
  }, [gameResult.game?.activeFabledIds, gameResult.game?.activeLoricIds, gameResult.game?.scriptRoles, players, referenceData?.roleMap]);
  const selectedPhaseVoteRecords = useMemo(
    () => voteRecords.filter((voteRecord) => voteRecord.phaseId === effectiveSelectedPhaseId),
    [voteRecords, effectiveSelectedPhaseId],
  );
  const selectedPhaseVoteAnalysesAsc = useMemo<VoteAnalysis[]>(() => {
    const selectedVoteRecordsAsc = [...selectedPhaseVoteRecords].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const alivePlayerCount = players.filter((player) => player.alive).length;
    const threshold = Math.ceil(alivePlayerCount / 2);
    const selectedVoteRecordIds = new Set(selectedVoteRecordsAsc.map((voteRecord) => voteRecord.id));
    const spentDeadVotesBeforePhase = new Set<string>();

    voteRecords
      .filter((voteRecord) => !selectedVoteRecordIds.has(voteRecord.id))
      .forEach((voteRecord) => {
        if (voteRecord.createdAt.localeCompare(selectedVoteRecordsAsc[0]?.createdAt ?? "") < 0) {
          voteRecord.deadVoterPlayerIds.forEach((playerId) => spentDeadVotesBeforePhase.add(playerId));
        }
      });

    let highestVotes = 0;
    let currentBlockVoteRecordId: string | null = null;
    const spentDeadVotes = new Set(spentDeadVotesBeforePhase);

    return selectedVoteRecordsAsc.map((voteRecord, index) => {
      const previousHighestVotes = highestVotes;
      const previousBlockVoteRecordId = currentBlockVoteRecordId;
      const voteCount = voteRecord.voterPlayerIds.length;
      const enoughVotes = voteCount >= threshold;
      let removedPreviousFromBlock = false;

      if (enoughVotes) {
        if (voteCount > highestVotes) {
          removedPreviousFromBlock = currentBlockVoteRecordId !== null && currentBlockVoteRecordId !== voteRecord.id;
          highestVotes = voteCount;
          currentBlockVoteRecordId = voteRecord.id;
        } else if (voteCount === highestVotes && highestVotes > 0) {
          removedPreviousFromBlock = currentBlockVoteRecordId !== null;
          currentBlockVoteRecordId = null;
        }
      }

      voteRecord.deadVoterPlayerIds.forEach((playerId) => spentDeadVotes.add(playerId));

      const remainingDeadVotes = players.filter((player) => !player.alive && !spentDeadVotes.has(player.id)).length;
      const remainingAliveVotes = alivePlayerCount;
      const remainingPotentialVotes = remainingAliveVotes + remainingDeadVotes;
      const currentTargetVotes = highestVotes > 0 ? highestVotes : threshold;
      const neededToTie = currentTargetVotes;
      const neededToBeat = highestVotes > 0 ? highestVotes + 1 : threshold;
      const canTie = remainingPotentialVotes >= neededToTie;
      const canBeat = remainingPotentialVotes >= neededToBeat;
      const isOnTheBlock = currentBlockVoteRecordId === voteRecord.id;

      let statusLabel = "Ниже порога";

      if (isOnTheBlock) {
        statusLabel = "На плахе";
      } else if (!enoughVotes && currentBlockVoteRecordId === null) {
        statusLabel = "Никто не номинирован";
      } else if (removedPreviousFromBlock) {
        statusLabel = "Кандидата сняли с плахи";
      } else if (enoughVotes && previousHighestVotes > voteCount) {
        statusLabel = "Не перебил плаху";
      } else if (enoughVotes && previousBlockVoteRecordId === null && voteCount === previousHighestVotes) {
        statusLabel = "Плаха пуста";
      }

      let prognosisLabel = "";

      if (highestVotes === 0) {
        prognosisLabel = canBeat
          ? `Следующего можно вывести на плаху: нужно ${threshold}`
          : "Следующего уже не вывести на плаху";
      } else if (canBeat) {
        prognosisLabel = `Можно перебить за ${neededToBeat} или сравнять за ${neededToTie}`;
      } else if (canTie) {
        prognosisLabel = `Можно только сравнять: нужно ${neededToTie}`;
      } else {
        prognosisLabel = "Перебить уже не хватит голосов";
      }

      return {
        voteRecord,
        voteNumber: index + 1,
        voteCount,
        threshold,
        thresholdLabel: `Нужно ${threshold} ${threshold === 1 ? "голос" : threshold < 5 ? "голоса" : "голосов"} для казни`,
        voteCountLabel: `${voteCount} ${voteCount === 1 ? "голос" : voteCount < 5 ? "голоса" : "голосов"}`,
        remainingAliveVotes,
        remainingDeadVotes,
        neededToTie,
        neededToBeat,
        canTie,
        canBeat,
        isOnTheBlock,
        removedPreviousFromBlock,
        statusLabel,
        prognosisLabel,
      };
    });
  }, [players, selectedPhaseVoteRecords, voteRecords]);
  const selectedPhaseVoteAnalysesDesc = useMemo(
    () => [...selectedPhaseVoteAnalysesAsc].reverse(),
    [selectedPhaseVoteAnalysesAsc],
  );
  const selectedPhaseExecutionNote = useMemo(
    () => notes.find((note) => note.phaseId === effectiveSelectedPhaseId && note.kind === "execution"),
    [notes, effectiveSelectedPhaseId],
  );
  const deadVoteSpentPlayerIds = useMemo(
    () => new Set(voteRecords.flatMap((voteRecord) => voteRecord.deadVoterPlayerIds)),
    [voteRecords],
  );
  const voteAvailabilityByPlayerId = useMemo(
    (): ReadonlyMap<string, PlayerVoteAvailability> =>
      new Map<string, PlayerVoteAvailability>(
        players.map((player) => [
          player.id,
          player.alive
            ? "alive"
            : (player.deadVoteAvailable ?? !deadVoteSpentPlayerIds.has(player.id))
              ? "dead_available"
              : "dead_spent",
        ]),
      ),
    [deadVoteSpentPlayerIds, players],
  );

  useEffect(() => {
    if (!voteDraft) {
      return;
    }

    if (!effectiveSelectedPhaseId || voteDraft.phaseId !== effectiveSelectedPhaseId || selectedPhase?.type !== "day") {
      setVoteDraft(null);
    }
  }, [effectiveSelectedPhaseId, selectedPhase?.type, voteDraft]);

  useEffect(() => {
    if (selectedPhase?.type !== "day") {
      setVoteDraft(null);
      setExecutionModalOpen(false);
    }
  }, [selectedPhase?.type]);

  const updateGameTimestamp = async (now = timestamp()) => {
    if (gameId) {
      await db.games.update(gameId, { updatedAt: now });
    }
  };

  const updateTokenPosition = async (playerId: string, position: { x: number; y: number }) => {
    if (!gameId || !gameResult.game) {
      return;
    }

    const now = timestamp();

    await db.games.update(gameId, {
      customTokenPositions: {
        ...(gameResult.game.customTokenPositions ?? {}),
        [playerId]: position,
      },
      updatedAt: now,
    });
  };

  const updateGrimoireStyle = async (style: NonNullable<Game["grimoireStyle"]>) => {
    if (!gameId) {
      return;
    }

    const now = timestamp();
    await db.games.update(gameId, {
      grimoireStyle: style,
      updatedAt: now,
    });
  };

  const updateSpecialRoles = async ({
    activeFabledIds,
    activeLoricIds,
  }: {
    activeFabledIds: string[];
    activeLoricIds: string[];
  }) => {
    if (!gameId) {
      return;
    }

    const now = timestamp();
    await db.games.update(gameId, {
      activeFabledIds,
      activeLoricIds,
      updatedAt: now,
    });
  };

  const addTraveller = async (payload: {
    name: string;
    travellerRole: string;
    travellerTeam: Player["travellerTeam"];
    joinedPhaseId?: string;
  }) => {
    if (!gameId) {
      return;
    }

    const now = timestamp();
    const nextSeatIndex = players.reduce((maxSeat, player) => Math.max(maxSeat, player.seatIndex), -1) + 1;

    await db.transaction("rw", db.players, db.games, async () => {
      await db.players.add({
        id: createId(),
        gameId,
        name: payload.name,
        seatIndex: nextSeatIndex,
        alive: true,
        deadVoteAvailable: true,
        tokenTint: "default",
        mainRole: undefined,
        additionalRoles: ["", "", ""],
        isTraveller: true,
        travellerRole: payload.travellerRole,
        travellerTeam: payload.travellerTeam,
        joinedPhaseId: payload.joinedPhaseId,
        leftPhaseId: undefined,
        createdAt: now,
        updatedAt: now,
      });
      await updateGameTimestamp(now);
    });
  };

  const duplicateSetup = async () => {
    if (!gameId || !gameResult.game) {
      return;
    }

    const sourceGame = gameResult.game;
    const now = timestamp();
    const newGameId = createId();
    const playerIdMap = new Map(players.map((player) => [player.id, createId()]));

    const duplicatedGame: Game = {
      ...sourceGame,
      id: newGameId,
      title: `${sourceGame.scriptName?.trim() || sourceGame.title} — копия setup`,
      status: "active",
      winner: undefined,
      finalNotes: undefined,
      startedAt: now,
      finishedAt: undefined,
      pinnedAt: undefined,
      trashedAt: undefined,
      myPlayerId: sourceGame.myPlayerId ? playerIdMap.get(sourceGame.myPlayerId) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    const duplicatedPlayers: Player[] = players.map((player) => ({
      ...player,
      id: playerIdMap.get(player.id) ?? createId(),
      gameId: newGameId,
      alive: true,
      deadVoteAvailable: true,
      createdAt: now,
      updatedAt: now,
    }));

    const duplicatedPhases: Phase[] = [
      { id: createId(), gameId: newGameId, number: 1, type: "night", title: phaseTitle(1, "night"), createdAt: now },
      { id: createId(), gameId: newGameId, number: 1, type: "day", title: phaseTitle(1, "day"), createdAt: now },
      { id: createId(), gameId: newGameId, number: 2, type: "night", title: phaseTitle(2, "night"), createdAt: now },
      { id: createId(), gameId: newGameId, number: 2, type: "day", title: phaseTitle(2, "day"), createdAt: now },
    ];

    await db.transaction("rw", db.games, db.players, db.phases, async () => {
      await db.games.add(duplicatedGame);
      await db.players.bulkAdd(duplicatedPlayers);
      await db.phases.bulkAdd(duplicatedPhases);
    });

    navigate(`/games/${newGameId}`);
  };

  const addNextPhase = async () => {
    if (!gameId) {
      return;
    }

    const sorted = sortPhases(phases);
    const lastPhase = sorted.at(-1);
    const nextNumber = !lastPhase ? 1 : lastPhase.type === "night" ? lastPhase.number : lastPhase.number + 1;
    const nextType = !lastPhase ? "night" : lastPhase.type === "night" ? "day" : "night";
    const now = timestamp();

    const phase: Phase = {
      id: createId(),
      gameId,
      number: nextNumber,
      type: nextType,
      title: phaseTitle(nextNumber, nextType),
      createdAt: now,
    };

    try {
      await db.transaction("rw", db.phases, db.games, async () => {
        await db.phases.add(phase);
        await updateGameTimestamp(now);
      });
      setSelectedPhaseId(phase.id);
    } catch {
      setPageError("Не удалось добавить фазу.");
    }
  };

  const addNoteToPhase = async (phaseId: string, text: string, linkedPlayerIds: string[]) => {
    if (!gameId) {
      return;
    }

    const now = timestamp();
    const note: Note = {
      id: createId(),
      gameId,
      phaseId,
      kind: "general",
      text,
      linkedPlayerIds,
      createdAt: now,
      updatedAt: now,
    };

    await db.transaction("rw", db.notes, db.games, async () => {
      await db.notes.add(note);
      await updateGameTimestamp(now);
    });
  };

  const addNote = async (text: string, linkedPlayerIds: string[]) => {
    if (!selectedPhase) {
      return;
    }

    await addNoteToPhase(selectedPhase.id, text, linkedPlayerIds);
  };

  const deleteNote = async (noteId: string) => {
    const now = timestamp();

    await db.transaction("rw", db.notes, db.games, async () => {
      await db.notes.delete(noteId);
      await updateGameTimestamp(now);
    });
  };

  const updateNote = async (noteId: string, text: string, linkedPlayerIds: string[]) => {
    const now = timestamp();

    await db.transaction("rw", db.notes, db.games, async () => {
      await db.notes.update(noteId, {
        text,
        linkedPlayerIds,
        updatedAt: now,
      });
      await updateGameTimestamp(now);
    });
  };

  const savePlayer = async (
    playerId: string,
    values: Pick<Player, "name" | "alive" | "deadVoteAvailable" | "mainRole" | "additionalRoles" | "travellerTeam" | "tokenTint">,
    isMyToken: boolean,
    myTeam: Game["myTeam"],
  ) => {
    const now = timestamp();
    const currentPlayer = players.find((player) => player.id === playerId);
    const nextMyPlayerId = isMyToken ? playerId : effectiveMyPlayerId === playerId ? undefined : effectiveMyPlayerId;
    const nextMyRoleId = isMyToken
      ? currentPlayer?.isTraveller
        ? currentPlayer.travellerRole ?? values.mainRole
        : values.mainRole
      : effectiveMyPlayerId === playerId
        ? undefined
        : gameResult.game?.myRoleId;

    setLocalMyPlayerId(nextMyPlayerId ?? null);

    await db.transaction("rw", db.players, db.games, async () => {
      await db.players.update(playerId, {
        ...values,
        updatedAt: now,
      });
      await db.games.update(gameId!, {
        myPlayerId: nextMyPlayerId,
        myRoleId: nextMyRoleId,
        myTeam: isMyToken ? myTeam : effectiveMyPlayerId === playerId ? undefined : gameResult.game?.myTeam,
        updatedAt: now,
      });
    });
  };

  const saveSetup = async (
    gameValues: Pick<
      Game,
      "title" | "date" | "storyteller" | "scriptName" | "scriptAuthor" | "scriptRoles"
    >,
    playerValues: Array<
      Pick<
        Player,
        | "id"
        | "name"
        | "mainRole"
        | "isTraveller"
        | "travellerRole"
        | "travellerTeam"
        | "joinedPhaseId"
        | "leftPhaseId"
        | "seatIndex"
      >
    >,
    deletedPlayerIds: string[],
  ) => {
    if (!gameId) {
      return;
    }

    const now = timestamp();

    await db.transaction("rw", db.games, db.players, async () => {
      await db.games.update(gameId, {
        ...gameValues,
        updatedAt: now,
      });

      await db.players.bulkDelete(deletedPlayerIds);

      await Promise.all(
        playerValues.map(async (player) => {
          const existingPlayer = players.find((currentPlayer) => currentPlayer.id === player.id);

          if (existingPlayer) {
            await db.players.update(player.id, {
              name: player.name,
              seatIndex: player.seatIndex,
              tokenTint: existingPlayer.tokenTint ?? "default",
              mainRole: player.mainRole,
              isTraveller: player.isTraveller,
              travellerRole: player.travellerRole,
              travellerTeam: player.travellerTeam,
              joinedPhaseId: player.joinedPhaseId,
              leftPhaseId: player.leftPhaseId,
              updatedAt: now,
            });
            return;
          }

          await db.players.add({
            id: player.id,
            gameId,
            name: player.name,
            seatIndex: player.seatIndex,
            alive: true,
            deadVoteAvailable: true,
            tokenTint: "default",
            mainRole: player.mainRole,
            additionalRoles: ["", "", ""],
            isTraveller: player.isTraveller,
            travellerRole: player.travellerRole,
            travellerTeam: player.travellerTeam,
            joinedPhaseId: player.joinedPhaseId,
            leftPhaseId: player.leftPhaseId,
            createdAt: now,
            updatedAt: now,
          });
        }),
      );
    });
  };

  const openFinishForm = () => {
    setFinishWinner(gameResult.game?.winner ?? "unknown");
    setFinishNotes(gameResult.game?.finalNotes ?? "");
    setFinishTime(timeInputValue(gameResult.game?.finishedAt));
    setFinishOpen(true);
  };

  const finishGame = async () => {
    if (!gameId) {
      return;
    }

    const now = timestamp();
    const finishedAt = finishTime ? combineDateAndTime(gameResult.game?.date ?? now.slice(0, 10), finishTime) : now;

    try {
      await db.games.update(gameId, {
        status: "finished",
        winner: finishWinner,
        finalNotes: finishNotes.trim() || undefined,
        finishedAt,
        updatedAt: now,
      });
      setFinishOpen(false);
      setPageError("");
    } catch {
      setPageError("Не удалось завершить партию.");
    }
  };

  const reopenGame = async () => {
    if (!gameId) {
      return;
    }

    const now = timestamp();

    try {
      await db.games.update(gameId, {
        status: "active",
        winner: undefined,
        finalNotes: undefined,
        finishedAt: undefined,
        updatedAt: now,
      });
      setPageError("");
    } catch {
      setPageError("Не удалось вернуть партию в активные.");
    }
  };

  const beginVoteDraft = () => {
    if (!selectedPhase || selectedPhase.type !== "day") {
      return;
    }

    setVoteDraft({
      phaseId: selectedPhase.id,
      stage: "select_nominator",
      selectedVoterIds: [],
    });
    setPageError("");
  };

  const selectVoteDraftPlayer = (player: Player) => {
    setVoteDraft((current) => {
      if (!current) {
        return current;
      }

      if (current.stage === "select_nominator") {
        if (!player.alive) {
          return current;
        }

        return {
          ...current,
          nominatorPlayerId: player.id,
          nomineePlayerId: undefined,
          selectedVoterIds: [],
          stage: "select_nominee",
        };
      }

      if (current.stage === "select_nominee") {
        if (current.nominatorPlayerId === player.id) {
          return current;
        }

        return {
          ...current,
          nomineePlayerId: player.id,
          selectedVoterIds: [],
          stage: "select_voters",
        };
      }

      return current;
    });
    setPageError("");
  };

  const toggleVoteDraftVoter = (playerId: string) => {
    const availability = voteAvailabilityByPlayerId.get(playerId);

    if (availability === "dead_spent") {
      return;
    }

    setVoteDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        selectedVoterIds: current.selectedVoterIds.includes(playerId)
          ? current.selectedVoterIds.filter((id) => id !== playerId)
          : [...current.selectedVoterIds, playerId],
      };
    });
  };

  const cancelVoteDraft = () => {
    setVoteDraft(null);
  };

  const openExecutionWithoutNominationModal = () => {
    setExecutionPlayerId(selectedPhaseExecutionNote?.executionPlayerId ?? "");
    setExecutionModalOpen(true);
    setPageError("");
  };

  const closeExecutionWithoutNominationModal = () => {
    setExecutionModalOpen(false);
    setExecutionPlayerId("");
  };

  const markVoteRecordAsExecution = async (voteRecordId: string) => {
    if (!gameId || !effectiveSelectedPhaseId) {
      return;
    }

    const now = timestamp();
    const currentVoteRecord = selectedPhaseVoteRecords.find((voteRecord) => voteRecord.id === voteRecordId);

    if (!currentVoteRecord) {
      return;
    }

    try {
      await db.transaction("rw", db.voteRecords, db.notes, db.games, async () => {
        await Promise.all(
          selectedPhaseVoteRecords.map((voteRecord) =>
            db.voteRecords.update(voteRecord.id, {
              resultedInExecution: voteRecord.id === voteRecordId ? !voteRecord.resultedInExecution : false,
              executedPlayerId:
                voteRecord.id === voteRecordId && !voteRecord.resultedInExecution
                  ? voteRecord.nomineePlayerId
                  : undefined,
              updatedAt: now,
            }),
          ),
        );

        if (selectedPhaseExecutionNote) {
          await db.notes.delete(selectedPhaseExecutionNote.id);
        }

        await updateGameTimestamp(now);
      });
      setPageError("");
    } catch {
      setPageError("Не удалось отметить результат казни.");
    }
  };

  const saveExecutionWithoutNomination = async () => {
    if (!gameId || !effectiveSelectedPhaseId || !selectedPhase || !executionPlayerId) {
      setPageError("Выберите, кто был казнён.");
      return;
    }

    const executedPlayer = playersById.get(executionPlayerId);

    if (!executedPlayer) {
      setPageError("Не удалось найти выбранного игрока.");
      return;
    }

    const now = timestamp();
    const executionText = `Казнь без номинации: ${executedPlayer.name}`;

    setExecutionSaving(true);

    try {
      await db.transaction("rw", db.voteRecords, db.notes, db.games, async () => {
        await Promise.all(
          selectedPhaseVoteRecords.map((voteRecord) =>
            db.voteRecords.update(voteRecord.id, {
              resultedInExecution: false,
              executedPlayerId: undefined,
              updatedAt: now,
            }),
          ),
        );

        if (selectedPhaseExecutionNote) {
          await db.notes.update(selectedPhaseExecutionNote.id, {
            text: executionText,
            linkedPlayerIds: [executionPlayerId],
            executionPlayerId,
            executionMode: "without_nomination",
            updatedAt: now,
          });
        } else {
          await db.notes.add({
            id: createId(),
            gameId,
            phaseId: selectedPhase.id,
            kind: "execution",
            text: executionText,
            linkedPlayerIds: [executionPlayerId],
            executionPlayerId,
            executionMode: "without_nomination",
            createdAt: now,
            updatedAt: now,
          });
        }

        await updateGameTimestamp(now);
      });

      closeExecutionWithoutNominationModal();
      setPageError("");
    } catch {
      setPageError("Не удалось сохранить казнь без номинации.");
    } finally {
      setExecutionSaving(false);
    }
  };

  const clearExecutionWithoutNomination = async () => {
    if (!selectedPhaseExecutionNote) {
      return;
    }

    const now = timestamp();

    try {
      await db.transaction("rw", db.notes, db.games, async () => {
        await db.notes.delete(selectedPhaseExecutionNote.id);
        await updateGameTimestamp(now);
      });
      setPageError("");
    } catch {
      setPageError("Не удалось убрать казнь без номинации.");
    }
  };

  const saveVoteDraft = async () => {
    if (!gameId || !voteDraft || !voteDraft.nominatorPlayerId || !voteDraft.nomineePlayerId) {
      return;
    }

    const nominator = playersById.get(voteDraft.nominatorPlayerId);
    const nominee = playersById.get(voteDraft.nomineePlayerId);

    if (!nominator || !nominee) {
      setPageError("Не удалось найти игроков для голосования.");
      return;
    }

    const alivePlayerCount = players.filter((player) => player.alive).length;
    const deadVoterPlayerIds = voteDraft.selectedVoterIds.filter((playerId) => !playersById.get(playerId)?.alive);
    const voterNames = voteDraft.selectedVoterIds
      .map((playerId) => playersById.get(playerId)?.name)
      .filter((name): name is string => Boolean(name));
    const deadVoterNames = deadVoterPlayerIds
      .map((playerId) => playersById.get(playerId)?.name)
      .filter((name): name is string => Boolean(name));
    const now = timestamp();
    const noteText = buildVotingNoteText({
      voteNumber: selectedPhaseVoteRecords.length + 1,
      phaseTitleText: selectedPhase?.title ?? "Дневная фаза",
      nominatorName: nominator.name,
      nomineeName: nominee.name,
      voterNames,
      deadVoterNames,
      alivePlayerCount,
    });
    const note: Note = {
      id: createId(),
      gameId,
      phaseId: voteDraft.phaseId,
      kind: "vote_history",
      text: noteText,
      linkedPlayerIds: Array.from(
        new Set([voteDraft.nominatorPlayerId, voteDraft.nomineePlayerId, ...voteDraft.selectedVoterIds]),
      ),
      createdAt: now,
      updatedAt: now,
    };
    const voteRecord: VoteRecord = {
      id: createId(),
      gameId,
      phaseId: voteDraft.phaseId,
      nominatorPlayerId: voteDraft.nominatorPlayerId,
      nomineePlayerId: voteDraft.nomineePlayerId,
      voterPlayerIds: voteDraft.selectedVoterIds,
      deadVoterPlayerIds,
      createdAt: now,
      updatedAt: now,
    };

    setVoteSaving(true);
    setPageError("");

    try {
      await db.transaction("rw", db.voteRecords, db.notes, db.games, db.players, async () => {
        await db.voteRecords.add(voteRecord);
        await db.notes.add(note);
        await Promise.all(
          deadVoterPlayerIds.map((playerId) =>
            db.players.update(playerId, {
              deadVoteAvailable: false,
              updatedAt: now,
            }),
          ),
        );
        await updateGameTimestamp(now);
      });
      setVoteDraft(null);
    } catch {
      setPageError("Не удалось сохранить голосование.");
    } finally {
      setVoteSaving(false);
    }
  };

  if (gameResult.loading) {
    return (
      <main className="page-shell">
        <div className="content-shell">
          <section className="panel p-6 text-center text-stone-300">Загрузка партии...</section>
        </div>
      </main>
    );
  }

  if (!gameResult.game) {
    return (
      <main className="page-shell">
        <div className="content-shell max-w-2xl space-y-4">
          <section className="panel p-6 text-center">
            <p className="text-xl font-semibold text-stone-50">Партия не найдена.</p>
            <Link to="/" className="primary-button mt-5">
              На главную
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const { game } = gameResult;
  const personalResult = personalResultLabel(game.winner, game.myTeam);
  const personalResultClass =
    game.myTeam === "traveller"
      ? "border-amber-200/45 bg-amber-400/15 text-amber-100"
      : game.winner && game.myTeam && game.winner === game.myTeam
        ? "border-emerald-200/45 bg-emerald-400/15 text-emerald-100"
        : game.status === "finished" && game.winner !== "unknown"
          ? "border-red-200/45 bg-red-400/15 text-red-100"
          : "border-stone-200/20 bg-stone-100/5 text-stone-200";
  const isDayPhase = selectedPhase?.type === "day";

  return (
    <main className={`page-shell ${isDayPhase ? "day-phase-theme" : ""}`}>
      <div className="content-shell min-w-0 space-y-4 sm:space-y-5">
        <header className="panel p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/" className="secondary-button min-h-10 shrink-0 px-3">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-ember-100/75 sm:text-sm">{formatDate(game.date)}</p>
              <h1 className="truncate pr-1 text-base font-bold leading-tight text-stone-50 sm:text-xl">
                {gameDisplayTitle(game)}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setGameInfoOpen((current) => !current)}
              className={`secondary-button min-h-10 shrink-0 px-3 ${gameInfoOpen ? "border-ember-200/45 bg-ember-200/10 text-ember-100" : ""}`}
              aria-label={gameInfoOpen ? "Скрыть информацию о партии" : "Показать информацию о партии"}
              title={gameInfoOpen ? "Скрыть информацию о партии" : "Показать информацию о партии"}
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>

          {gameInfoOpen ? (
            <div className="mt-4 space-y-4 border-t border-ember-200/10 pt-4">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {game.storyteller ? <span className="chip">Ведущий: {game.storyteller}</span> : null}
                {game.scriptName ? <span className="chip">Сценарий: {game.scriptName}</span> : null}
                <span className="chip">{game.playerCount} игроков</span>
                <span className="chip">
                  {game.status === "finished" ? `Завершена: ${winnerLabel(game.winner)}` : "Активная"}
                </span>
                {game.myRoleId ? (
                  <span className="chip">Мой жетон: {getRoleLabel(game.myRoleId, game.scriptRoles)}</span>
                ) : null}
                {game.myTeam ? <span className="chip">Моя команда: {personalTeamLabel(game.myTeam)}</span> : null}
                {game.status === "finished" ? (
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${personalResultClass}`}>
                    {personalResult}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <button type="button" onClick={() => setSetupOpen(true)} className="secondary-button w-full">
                  <Settings className="h-4 w-4" />
                  Setup
                </button>
                <button type="button" onClick={duplicateSetup} className="secondary-button w-full">
                  <Save className="h-4 w-4" />
                  Дублировать setup
                </button>
                {game.status === "finished" ? (
                  <button type="button" onClick={reopenGame} className="secondary-button w-full">
                    <ArrowLeft className="h-4 w-4" />
                    Сделать активной
                  </button>
                ) : null}
                <button type="button" onClick={openFinishForm} className="secondary-button w-full">
                  <CheckCircle2 className="h-4 w-4" />
                  {game.status === "finished" ? "Итог партии" : "Завершить партию"}
                </button>
              </div>

              {game.finalNotes ? (
                <p className="rounded-2xl border border-ember-200/10 bg-black/18 p-4 text-sm leading-6 text-stone-300">
                  {game.finalNotes}
                </p>
              ) : null}
            </div>
          ) : null}
        </header>

        {pageError ? (
          <div className="rounded-2xl border border-red-300/20 bg-red-950/30 p-4 text-sm text-red-100">
            {pageError}
          </div>
        ) : null}

        <div className="grid min-w-0 gap-4 xl:grid-cols-[0.95fr_minmax(0,1.05fr)] xl:gap-5">
          <PlayerCircle
            players={players}
            notes={notes}
            phases={phases}
            currentPhase={selectedPhase}
            scriptRoles={game.scriptRoles}
            myPlayerId={effectiveMyPlayerId}
            myRoleId={game.myRoleId}
            customTokenPositions={game.customTokenPositions}
            grimoireStyle={game.grimoireStyle}
            activeFabledIds={game.activeFabledIds}
            activeLoricIds={game.activeLoricIds}
            voteDraft={voteDraft}
            showVoteMarkers={voteDraft?.stage === "select_voters"}
            voteAvailabilityByPlayerId={voteAvailabilityByPlayerId}
            onToggleVoteVoter={voteDraft ? toggleVoteDraftVoter : undefined}
            onSelectVotingPlayer={voteDraft ? selectVoteDraftPlayer : undefined}
            onSaveVoteDraft={voteDraft?.stage === "select_voters" ? saveVoteDraft : undefined}
            onCancelVoteDraft={voteDraft ? cancelVoteDraft : undefined}
            voteSaving={voteSaving}
            onUpdateTokenPosition={updateTokenPosition}
            onUpdateGrimoireStyle={updateGrimoireStyle}
            onUpdateSpecialRoles={updateSpecialRoles}
            onAddTraveller={addTraveller}
            onPlayerClick={(player) => setSelectedPlayerId(player.id)}
          />

          <div className="min-w-0 space-y-4 sm:space-y-5">
            <PhaseTabs
              phases={phases}
              selectedPhaseId={effectiveSelectedPhaseId}
              onSelect={setSelectedPhaseId}
              onAddNextPhase={addNextPhase}
            />
            <section className="panel p-2 sm:p-3">
              <div className={`grid gap-2 ${selectedPhase?.type === "day" ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-2"}`}>
                <button
                  type="button"
                  onClick={() => setContentTab("notes")}
                  className={contentTab === "notes" ? "primary-button w-full" : "secondary-button w-full"}
                >
                  Заметки
                </button>
                {selectedPhase?.type === "day" ? (
                <button
                  type="button"
                  onClick={() => setContentTab("voting")}
                  className={contentTab === "voting" ? "primary-button w-full" : "secondary-button w-full"}
                >
                    Голосования
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setContentTab("reference")}
                  className={contentTab === "reference" ? "primary-button w-full" : "secondary-button w-full"}
                >
                  Роли
                </button>
              </div>
            </section>
            {contentTab === "voting" && selectedPhase?.type === "day" ? (
              <section className="panel min-w-0 p-3 sm:p-5">
                {voteDraft ? (
                  <div className="mt-4 space-y-3 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:p-4">
                    <h2 className="text-lg font-semibold text-stone-50">Голосование</h2>
                    <p className="text-sm leading-6 text-stone-300">
                      {voteDraft.stage === "select_nominator"
                        ? "На круге выберите игрока, который номинировал."
                        : voteDraft.stage === "select_nominee"
                          ? "Теперь выберите игрока, которого номинировали."
                          : "На круге отметьте всех, кто голосовал по этой номинации, затем сохраните результат."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {voteDraft.nominatorPlayerId ? (
                        <span className="chip">
                          Номинировал: {playersById.get(voteDraft.nominatorPlayerId)?.name ?? "?"}
                        </span>
                      ) : null}
                      {voteDraft.nomineePlayerId ? (
                        <span className="chip">
                          Номинирован: {playersById.get(voteDraft.nomineePlayerId)?.name ?? "?"}
                        </span>
                      ) : null}
                      {voteDraft.stage === "select_voters" ? (
                        <span className="chip">Отмечено голосов: {voteDraft.selectedVoterIds.length}</span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={beginVoteDraft} className="secondary-button w-full sm:w-auto">
                      <CheckCircle2 className="h-4 w-4" />
                      Номинация
                    </button>
                    <button
                      type="button"
                      onClick={openExecutionWithoutNominationModal}
                      className={`secondary-button w-full sm:w-auto ${
                        selectedPhaseExecutionNote ? "border-amber-700/25 bg-amber-200/20 text-stone-900" : ""
                      }`}
                    >
                      <Crown className="h-4 w-4" />
                      Казнь без номинации
                    </button>
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  {selectedPhaseVoteAnalysesDesc.length === 0 &&
                  selectedPhaseVoteNotes.length === 0 &&
                  !selectedPhaseExecutionNote ? (
                    <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                      В этой фазе пока нет истории голосований.
                    </div>
                  ) : (
                    <>
                      {selectedPhaseExecutionNote ? (
                        <article className="rounded-[20px] border border-amber-700/20 bg-amber-200/18 p-2.5 shadow-[0_6px_20px_rgba(165,120,35,0.12)]">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-300 text-stone-900 shadow-lg shadow-amber-950/10">
                                <Crown className="h-4 w-4" />
                              </span>
                              <div>
                                <h3 className="text-sm font-semibold text-stone-50">Казнь без номинации</h3>
                                <p className="text-xs text-stone-100">
                                  Казнён: {playersById.get(selectedPhaseExecutionNote.executionPlayerId ?? "")?.name ?? "Неизвестно"}
                                </p>
                              </div>
                            </div>
                            <button type="button" onClick={clearExecutionWithoutNomination} className="secondary-button min-h-8 px-2.5 text-stone-900">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </article>
                      ) : null}

                      {selectedPhaseVoteAnalysesDesc.map((analysis, index) => {
                        const { voteRecord } = analysis;
                        const nominatorName = playersById.get(voteRecord.nominatorPlayerId)?.name ?? "Неизвестно";
                        const nomineeName = playersById.get(voteRecord.nomineePlayerId)?.name ?? "Неизвестно";
                        const voterNames = voteRecord.voterPlayerIds
                          .map((playerId) => playersById.get(playerId)?.name)
                          .filter((name): name is string => Boolean(name));
                        const deadVoterNames = voteRecord.deadVoterPlayerIds
                          .map((playerId) => playersById.get(playerId)?.name)
                          .filter((name): name is string => Boolean(name));
                        const leadsToExecution = Boolean(voteRecord.resultedInExecution);

                        return (
                          <article
                            key={voteRecord.id}
                            className={`rounded-[20px] border p-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.09)] ${
                              index === 0
                                ? "border-amber-500/45 bg-amber-200/28 shadow-[0_0_0_2px_rgba(245,158,11,0.18),0_0_0_8px_rgba(51,51,56,0.16),0_18px_34px_rgba(32,28,24,0.24)]"
                                : leadsToExecution
                                  ? "border-emerald-700/20 bg-emerald-200/14"
                                  : "border-ember-200/15 bg-black/18"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-1.5">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-amber-300 text-stone-900 shadow-lg shadow-amber-950/10">
                                    <Gavel className="h-3.5 w-3.5" />
                                  </span>
                                  <div>
                                    <h3 className="text-sm font-semibold leading-tight text-stone-100">{analysis.voteNumber}</h3>
                                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-stone-500">
                                      <Clock3 className="h-2.5 w-2.5 text-stone-700" />
                                      {formatDate(voteRecord.createdAt)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <span className="inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-stone-800">
                                  {analysis.voteCountLabel}
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    leadsToExecution
                                      ? "bg-emerald-500 text-white ring-1 ring-emerald-700/20 shadow-[0_8px_18px_rgba(16,185,129,0.28)]"
                                      : analysis.isOnTheBlock
                                        ? "bg-emerald-400/90 text-emerald-950 ring-1 ring-emerald-700/15"
                                        : analysis.removedPreviousFromBlock
                                          ? "bg-amber-300/70 text-amber-950 ring-1 ring-amber-700/15"
                                          : "bg-stone-200/16 text-stone-700 ring-1 ring-stone-500/12"
                                  }`}
                                >
                                  {leadsToExecution ? "Казнь выбрана" : analysis.statusLabel}
                                </span>
                                {analysis.removedPreviousFromBlock && analysis.isOnTheBlock ? (
                                  <span className="inline-flex items-center rounded-full bg-amber-200/75 px-2 py-0.5 text-[10px] font-medium text-amber-950">
                                    Предыдущего сняли
                                  </span>
                                ) : null}
                                {analysis.removedPreviousFromBlock && !analysis.isOnTheBlock ? (
                                  <span className="inline-flex items-center rounded-full bg-stone-200/70 px-2 py-0.5 text-[10px] font-medium text-stone-800">
                                    Никто не номинирован
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => void markVoteRecordAsExecution(voteRecord.id)}
                                  className={`secondary-button min-h-7 w-7 shrink-0 px-0 ${
                                    leadsToExecution
                                      ? "border-emerald-700/20 bg-emerald-300/18 text-emerald-950"
                                      : "text-stone-900"
                                  }`}
                                  aria-label={leadsToExecution ? "Снять казнь" : "Казнь состоялась"}
                                  title={leadsToExecution ? "Снять казнь" : "Казнь состоялась"}
                                >
                                  <Skull className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-2.5 grid gap-1.5 text-[12px] leading-4 text-stone-200">
                              <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,2.2fr)_minmax(0,1fr)]">
                                <div className="flex items-start gap-1.5 rounded-2xl bg-black/10 px-2 py-1.5">
                                  <span className="mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-lg bg-amber-200/85 text-amber-900">
                                    <Target className="h-3 w-3" />
                                  </span>
                                  <div className="space-y-0.5">
                                    <p>{nominatorName}</p>
                                    <p>{nomineeName}</p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-1.5 rounded-2xl bg-black/10 px-2 py-1.5">
                                  <span className="mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-lg bg-sky-200/85 text-sky-900">
                                    <Users className="h-3 w-3" />
                                  </span>
                                  <p className="line-clamp-2">{voterNames.length > 0 ? voterNames.join(", ") : "никто"}</p>
                                </div>

                                <div className="rounded-2xl bg-black/10 px-2 py-1.5 text-[11px] leading-4">
                                  <p>Живых: {analysis.remainingAliveVotes}</p>
                                  <p>Мёртвых: {analysis.remainingDeadVotes}</p>
                                </div>
                              </div>

                              <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <div className="flex items-start gap-1.5 rounded-2xl bg-black/10 px-2 py-1.5">
                                  <span className="mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-lg bg-rose-200/85 text-rose-900">
                                    <Skull className="h-3 w-3" />
                                  </span>
                                  <p>{deadVoterNames.length > 0 ? deadVoterNames.join(", ") : "нет"}</p>
                                </div>

                                <div className="ml-auto flex items-start gap-1.5 rounded-2xl bg-black/10 px-2 py-1.5 sm:justify-self-end">
                                  <span className="mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-lg bg-yellow-200/85 text-yellow-900">
                                    <CheckCircle2 className="h-3 w-3" />
                                  </span>
                                  <p>{analysis.thresholdLabel}</p>
                                </div>
                              </div>

                              <div className="rounded-2xl bg-black/10 px-2 py-1.5 text-[11px] leading-4 text-stone-600">
                                {analysis.prognosisLabel}
                              </div>
                            </div>
                          </article>
                        );
                      })}

                      {selectedPhaseVoteAnalysesDesc.length === 0
                        ? selectedPhaseVoteNotes.map((note) => (
                            <article key={note.id} className="rounded-2xl border border-ember-200/10 bg-black/18 p-3 sm:p-4">
                              <p className="whitespace-pre-wrap text-sm leading-6 text-stone-100">{note.text}</p>
                            </article>
                          ))
                        : null}
                    </>
                  )}
                </div>
              </section>
            ) : null}
            {contentTab === "notes" ? (
              <PhaseNotes
                phase={selectedPhase}
                notes={selectedPhaseNotes}
                players={players}
                onAddNote={addNote}
                onDeleteNote={deleteNote}
                onUpdateNote={updateNote}
              />
            ) : null}
            {contentTab === "reference" ? (
              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReferenceTab("roles")}
                    className={referenceTab === "roles" ? "primary-button w-full" : "secondary-button w-full"}
                  >
                    Роли
                  </button>
                  <button
                    type="button"
                    onClick={() => setReferenceTab("nightOrder")}
                    className={referenceTab === "nightOrder" ? "primary-button w-full" : "secondary-button w-full"}
                  >
                    Ночной порядок
                  </button>
                </div>

                {referenceTab === "nightOrder" ? (
                  <NightOrderPanel
                    phase={selectedPhase}
                    roles={roleReferenceRoles}
                    nightOrder={referenceData?.nightOrder ?? null}
                    referenceMap={referenceData?.roleMap ?? new Map()}
                  />
                ) : (
                  <RoleReferencePanel
                    roles={roleReferenceRoles}
                    referenceMap={referenceData?.roleMap ?? new Map()}
                  />
                )}
              </section>
            ) : null}
          </div>
        </div>
      </div>

      <PlayerDetailModal
        player={selectedPlayer}
        isMyToken={Boolean(selectedPlayer && effectiveMyPlayerId === selectedPlayer.id)}
        myTokenLocked={Boolean(selectedPlayer && effectiveMyPlayerId && effectiveMyPlayerId !== selectedPlayer.id)}
        myTeam={selectedPlayer && effectiveMyPlayerId === selectedPlayer.id ? game.myTeam : undefined}
        notes={notes.filter((note) => note.kind !== "vote_history" && note.kind !== "execution")}
        players={players}
        phases={phases}
        scriptRoles={game.scriptRoles}
        onClose={() => setSelectedPlayerId(null)}
        onSave={savePlayer}
        onAddNote={addNoteToPhase}
        onDeleteNote={deleteNote}
        onUpdateNote={updateNote}
      />

      {executionModalOpen && selectedPhase?.type === "day" ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/55 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6">
          <section className="w-full rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:max-w-md sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-50">Казнь без номинации</h2>
                <p className="mt-1 text-sm text-stone-200">Выберите, кто был казнён в этой дневной фазе.</p>
              </div>
              <button type="button" onClick={closeExecutionWithoutNominationModal} className="secondary-button px-3">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <select
                value={executionPlayerId}
                onChange={(event) => setExecutionPlayerId(event.target.value)}
                className="field"
              >
                <option value="">Кто казнён?</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveExecutionWithoutNomination()}
                  disabled={executionSaving || !executionPlayerId}
                  className="primary-button"
                >
                  <Save className="h-4 w-4" />
                  Сохранить
                </button>
                <button type="button" onClick={closeExecutionWithoutNominationModal} className="secondary-button">
                  Отмена
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <SetupEditorModal
        game={setupOpen ? game : null}
        players={players}
        onClose={() => setSetupOpen(false)}
        onSave={saveSetup}
      />

      {finishOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6">
          <section className="w-full rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:max-w-xl sm:rounded-3xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-stone-400">Завершение партии</p>
                <h2 className="text-2xl font-bold text-stone-50">Итог</h2>
              </div>
              <button type="button" onClick={() => setFinishOpen(false)} className="secondary-button px-3">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="label">Победитель</span>
                <select
                  value={finishWinner}
                  onChange={(event) => setFinishWinner(event.target.value as Winner)}
                  className="field"
                >
                  <option value="good">Добро</option>
                  <option value="evil">Зло</option>
                  <option value="other">Другое</option>
                  <option value="unknown">Неизвестно</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="label">Время окончания партии</span>
                <input
                  type="time"
                  value={finishTime}
                  onChange={(event) => setFinishTime(event.target.value)}
                  className="field"
                />
                <p className="text-xs leading-4 text-stone-500">
                  Если не указывать время, автоматически сохранится текущее.
                </p>
              </label>

              <label className="block space-y-2">
                <span className="label">Итоговые заметки</span>
                <textarea
                  value={finishNotes}
                  onChange={(event) => setFinishNotes(event.target.value)}
                  className="field min-h-32 resize-y"
                  placeholder="Что важно запомнить по партии?"
                />
              </label>

              <button type="button" onClick={finishGame} className="primary-button w-full">
                <CheckCircle2 className="h-4 w-4" />
                Сохранить итог
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
