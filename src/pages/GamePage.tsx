import {
  ArrowLeft,
  BedDouble,
  CheckCircle2,
  Clock3,
  Crown,
  Edit3,
  Gavel,
  Play,
  Save,
  Settings,
  Skull,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import NightOrderPanel from "../components/NightOrderPanel";
import PhaseNotes from "../components/PhaseNotes";
import PlayerCircle from "../components/PlayerCircle";
import PlayerDetailModal from "../components/PlayerDetailModal";
import RoleIntelPanel from "../components/RoleIntelPanel";
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
  formatTime,
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
import { mergeManualAndMentionLinks } from "../utils/mentions";
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
  voteType,
  phaseTitleText,
  nominatorName,
  nomineeName,
  voterNames,
  deadVoterNames,
  threshold,
  thresholdText,
}: {
  voteNumber: number;
  voteType: "execution" | "traveller_exile";
  phaseTitleText: string;
  nominatorName: string;
  nomineeName: string;
  voterNames: string[];
  deadVoterNames: string[];
  threshold: number;
  thresholdText: string;
}) => {
  const voteCount = voterNames.length;
  const outcome =
    voteCount >= threshold
      ? voteType === "traveller_exile"
        ? "достаточно голосов для изгнания"
        : "достаточно голосов для казни"
      : "недостаточно голосов";

  return [
    `${voteType === "traveller_exile" ? "Изгнание Traveller" : "Голосование"} #${voteNumber}`,
    `Фаза: ${phaseTitleText}`,
    `Номинировал: ${nominatorName}`,
    `Номинирован: ${nomineeName}`,
    `Голосовали (${voteCount}): ${voterNames.length > 0 ? voterNames.join(", ") : "никто"}`,
    `Мертвые голоса: ${deadVoterNames.length > 0 ? deadVoterNames.join(", ") : "нет"}`,
    `Порог: ${thresholdText}`,
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
  voteType: "execution" | "traveller_exile";
};

const resolveVoteType = (voteRecord: VoteRecord) => voteRecord.voteType ?? "execution";

const getExecutionThreshold = (alivePlayerCount: number) => Math.ceil(alivePlayerCount / 2);

const getTravellerExileThreshold = (participantCount: number) =>
  participantCount % 2 === 0 ? participantCount / 2 : Math.floor(participantCount / 2) + 1;

type SummaryItem =
  | {
      id: string;
      createdAt: string;
      kind: "note";
      phase?: Phase;
      note: Note;
    }
  | {
      id: string;
      createdAt: string;
      kind: "execution";
      phase?: Phase;
      note: Note;
    }
  | {
      id: string;
      createdAt: string;
      kind: "vote";
      phase?: Phase;
      voteRecord: VoteRecord;
      analysis?: VoteAnalysis;
    };

const countVotesLabel = (count: number) =>
  `${count} ${count === 1 ? "голос" : count >= 2 && count <= 4 ? "голоса" : "голосов"}`;

const buildPhase = (gameId: string, number: number, type: Phase["type"], createdAt: string): Phase => ({
  id: createId(),
  gameId,
  number,
  type,
  title: phaseTitle(number, type),
  createdAt,
});

const inferCurrentPhaseId = ({
  game,
  phases,
  notes,
  voteRecords,
}: {
  game?: Game;
  phases: Phase[];
  notes: Note[];
  voteRecords: VoteRecord[];
}) => {
  if (game?.currentPhaseId && phases.some((phase) => phase.id === game.currentPhaseId)) {
    return game.currentPhaseId;
  }

  const recentPhaseId =
    [...voteRecords]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((voteRecord) => voteRecord.phaseId)
      .find((phaseId) => phases.some((phase) => phase.id === phaseId)) ??
    [...notes]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((note) => note.phaseId)
      .find((phaseId) => phases.some((phase) => phase.id === phaseId));

  if (recentPhaseId) {
    return recentPhaseId;
  }

  if (game?.hasStarted || game?.startedAt) {
    return phases.at(-1)?.id;
  }

  return undefined;
};

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
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
  const [executionPhaseId, setExecutionPhaseId] = useState<string | null>(null);
  const [pageError, setPageError] = useState("");
  const [contentTab, setContentTab] = useState<"notes" | "roleIntel" | "reference" | "voting" | "summary">("notes");
  const [referenceTab, setReferenceTab] = useState<"roles" | "nightOrder">("roles");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [editingVoteRecordId, setEditingVoteRecordId] = useState<string | null>(null);
  const [editingVoteDraft, setEditingVoteDraft] = useState<VoteDraft | null>(null);
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
        ? db.notes
            .where("[gameId+createdAt]")
            .between([gameId, ""], [gameId, "\uffff"])
            .toArray()
        : [],
    [gameId],
    [],
  );

  const voteRecords = useLiveQuery(
    async (): Promise<VoteRecord[]> =>
      gameId
        ? db.voteRecords
            .where("[gameId+createdAt]")
            .between([gameId, ""], [gameId, "\uffff"])
            .toArray()
        : [],
    [gameId],
    [],
  );

  const effectiveSelectedPhaseId = inferCurrentPhaseId({
    game: gameResult.game,
    phases,
    notes,
    voteRecords,
  });
  const selectedPhase = phases.find((phase) => phase.id === effectiveSelectedPhaseId);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const phasesById = useMemo(
    () => new Map(phases.map((phase) => [phase.id, phase])),
    [phases],
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
          note.kind !== "execution" &&
          note.kind !== "role_intel",
      ),
    [notes, effectiveSelectedPhaseId],
  );
  const selectedPhaseRoleIntelNotes = useMemo(
    () =>
      notes
        .filter((note) => note.phaseId === effectiveSelectedPhaseId && note.kind === "role_intel")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
  const selectedPhaseExecutionVoteRecords = useMemo(
    () => selectedPhaseVoteRecords.filter((voteRecord) => resolveVoteType(voteRecord) === "execution"),
    [selectedPhaseVoteRecords],
  );
  const usedExecutionNominatorIds = useMemo(
    () => new Set(selectedPhaseExecutionVoteRecords.map((voteRecord) => voteRecord.nominatorPlayerId)),
    [selectedPhaseExecutionVoteRecords],
  );
  const usedExecutionNomineeIds = useMemo(
    () => new Set(selectedPhaseExecutionVoteRecords.map((voteRecord) => voteRecord.nomineePlayerId)),
    [selectedPhaseExecutionVoteRecords],
  );
  const selectableExecutionNominatorIds = useMemo(
    () =>
      new Set(
        players
          .filter((player) => player.alive && !usedExecutionNominatorIds.has(player.id))
          .map((player) => player.id),
      ),
    [players, usedExecutionNominatorIds],
  );
  const selectableTravellerExileNominatorIds = useMemo(
    () => new Set(players.map((player) => player.id)),
    [players],
  );
  const selectableExecutionNomineeIds = useMemo(
    () =>
      new Set(
        players
          .filter((player) => player.alive && !player.isTraveller && !usedExecutionNomineeIds.has(player.id))
          .map((player) => player.id),
      ),
    [players, usedExecutionNomineeIds],
  );
  const selectableTravellerExileNomineeIds = useMemo(
    () => new Set(players.filter((player) => player.isTraveller).map((player) => player.id)),
    [players],
  );
  const selectedPhaseVoteAnalysesAsc = useMemo<VoteAnalysis[]>(() => {
    const selectedVoteRecordsAsc = [...selectedPhaseVoteRecords].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const alivePlayerCount = players.filter((player) => player.alive).length;
    const participantCount = players.length;
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
      const voteType = resolveVoteType(voteRecord);
      const threshold =
        voteType === "traveller_exile"
          ? getTravellerExileThreshold(participantCount)
          : getExecutionThreshold(alivePlayerCount);
      const previousHighestVotes = highestVotes;
      const previousBlockVoteRecordId = currentBlockVoteRecordId;
      const voteCount = voteRecord.voterPlayerIds.length;
      const enoughVotes = voteCount >= threshold;
      let removedPreviousFromBlock = false;

      if (voteType === "execution" && enoughVotes) {
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
      const currentTargetVotes = voteType === "traveller_exile" ? threshold : highestVotes > 0 ? highestVotes : threshold;
      const neededToTie = currentTargetVotes;
      const neededToBeat = voteType === "traveller_exile" ? threshold : highestVotes > 0 ? highestVotes + 1 : threshold;
      const canTie = remainingPotentialVotes >= neededToTie;
      const canBeat = remainingPotentialVotes >= neededToBeat;
      const isOnTheBlock = voteType === "traveller_exile" ? enoughVotes : currentBlockVoteRecordId === voteRecord.id;

      let statusLabel = voteType === "traveller_exile" ? "Голосов не хватило" : "Ниже порога";

      if (voteType === "traveller_exile") {
        statusLabel = enoughVotes ? "Изгнание проходит" : "Голосов не хватило";
      } else if (isOnTheBlock) {
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

      if (voteType === "traveller_exile") {
        prognosisLabel = enoughVotes
          ? "Голосов хватает для изгнания Traveller"
          : `Для изгнания нужно ещё ${Math.max(0, threshold - voteCount)}`;
      } else if (highestVotes === 0) {
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
        thresholdLabel:
          voteType === "traveller_exile"
            ? `Нужно ${threshold} ${threshold === 1 ? "голос" : threshold < 5 ? "голоса" : "голосов"} для изгнания`
            : `Нужно ${threshold} ${threshold === 1 ? "голос" : threshold < 5 ? "голоса" : "голосов"} для казни`,
        voteCountLabel: countVotesLabel(voteCount),
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
        voteType,
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
  const executionNoteByPhaseId = useMemo(
    () =>
      new Map(
        notes
          .filter((note) => note.kind === "execution")
          .map((note) => [note.phaseId, note] as const),
      ),
    [notes],
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
    const modalPhase = phasesById.get(executionPhaseId ?? selectedPhase?.id ?? "");

    if (modalPhase?.type !== "day") {
      setVoteDraft(null);
      setExecutionModalOpen(false);
    }
  }, [executionPhaseId, phasesById, selectedPhase?.id, selectedPhase?.type]);

  const updateGameTimestamp = async (now = timestamp()) => {
    if (gameId) {
      await db.games.update(gameId, { updatedAt: now });
    }
  };

  const ensurePhaseExists = async (number: number, type: Phase["type"], now = timestamp()) => {
    if (!gameId) {
      return undefined;
    }

    const existingPhase = phases.find((phase) => phase.number === number && phase.type === type);

    if (existingPhase) {
      return existingPhase;
    }

    const nextPhase = buildPhase(gameId, number, type, now);
    await db.phases.add(nextPhase);
    return nextPhase;
  };

  const setCurrentPhase = async (phase: Phase, now = timestamp(), options?: { startGame?: boolean }) => {
    if (!gameId) {
      return;
    }

    await db.games.update(gameId, {
      currentPhaseId: phase.id,
      hasStarted: true,
      startedAt: options?.startGame ? gameResult.game?.startedAt ?? now : gameResult.game?.startedAt,
      updatedAt: now,
    });
  };

  const reconcileDeadVoteAvailability = async (now = timestamp()) => {
    if (!gameId) {
      return;
    }

    const allVoteRecords = await db.voteRecords
      .where("[gameId+createdAt]")
      .between([gameId, ""], [gameId, "\uffff"])
      .toArray();
    const spentDeadVotes = new Set(allVoteRecords.flatMap((voteRecord) => voteRecord.deadVoterPlayerIds));

    await Promise.all(
      players.map((player) =>
        db.players.update(player.id, {
          deadVoteAvailable: player.alive ? true : !spentDeadVotes.has(player.id),
          updatedAt: now,
        }),
      ),
    );
  };

  const startGame = async () => {
    if (!gameId) {
      return;
    }

    const now = timestamp();

    try {
      await db.transaction("rw", db.phases, db.games, async () => {
        const firstNight = (await ensurePhaseExists(1, "night", now)) ?? buildPhase(gameId, 1, "night", now);
        await setCurrentPhase(firstNight, now, { startGame: true });
      });
      setPageError("");
      setContentTab("notes");
    } catch {
      setPageError("Не удалось начать игру.");
    }
  };

  const advanceToNextPhase = async (mode: "night_to_day" | "day_to_night") => {
    if (!gameId || !selectedPhase) {
      return;
    }

    const now = timestamp();
    const nextNumber = mode === "night_to_day" ? selectedPhase.number : selectedPhase.number + 1;
    const nextType: Phase["type"] = mode === "night_to_day" ? "day" : "night";

    try {
      await db.transaction("rw", db.phases, db.games, async () => {
        const nextPhase =
          (await ensurePhaseExists(nextNumber, nextType, now)) ??
          buildPhase(gameId, nextNumber, nextType, now);
        await setCurrentPhase(nextPhase, now);
      });
      setPageError("");
      setContentTab(nextType === "day" ? "notes" : "notes");
    } catch {
      setPageError("Не удалось перейти к следующей фазе.");
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
      hasStarted: false,
      currentPhaseId: undefined,
      winner: undefined,
      finalNotes: undefined,
      startedAt: undefined,
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
      buildPhase(newGameId, 1, "night", now),
      buildPhase(newGameId, 1, "day", now),
    ];

    await db.transaction("rw", db.games, db.players, db.phases, async () => {
      await db.games.add(duplicatedGame);
      await db.players.bulkAdd(duplicatedPlayers);
      await db.phases.bulkAdd(duplicatedPhases);
    });

    navigate(`/games/${newGameId}`);
  };
  const addNoteToPhase = async (
    phaseId: string,
    text: string,
    linkedPlayerIds: string[],
    options?: { kind?: Note["kind"]; roleId?: string },
  ) => {
    if (!gameId) {
      return;
    }

    const now = timestamp();
    const note: Note = {
      id: createId(),
      gameId,
      phaseId,
      kind: options?.kind ?? "general",
      roleId: options?.roleId,
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

  const addRoleIntelNote = async (roleId: string, text: string, linkedPlayerIds: string[]) => {
    if (!selectedPhase) {
      return;
    }

    await addNoteToPhase(selectedPhase.id, text, linkedPlayerIds, {
      kind: "role_intel",
      roleId,
    });
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

    await db.transaction("rw", db.players, db.games, db.notes, async () => {
      await db.players.update(playerId, {
        ...values,
        updatedAt: now,
      });
      if (currentPlayer?.alive && !values.alive && selectedPhase) {
        await db.notes.add({
          id: createId(),
          gameId: gameId!,
          phaseId: selectedPhase.id,
          kind: "general",
          text: `${values.name} умер${selectedPhase.type === "day" ? " днём" : " ночью"}.`,
          linkedPlayerIds: [playerId],
          createdAt: now,
          updatedAt: now,
        });
      }
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

  const beginVoteDraft = (voteType: "execution" | "traveller_exile") => {
    if (!selectedPhase || selectedPhase.type !== "day") {
      return;
    }

    if (voteType === "execution" && selectableExecutionNominatorIds.size === 0) {
      setPageError("В этой дневной фазе больше некому номинировать на казнь.");
      return;
    }

    if (voteType === "traveller_exile" && selectableTravellerExileNomineeIds.size === 0) {
      setPageError("Сейчас в игре нет Traveller для изгнания.");
      return;
    }

    setVoteDraft({
      phaseId: selectedPhase.id,
      voteType,
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
        const canSelect =
          (current.voteType ?? "execution") === "traveller_exile"
            ? selectableTravellerExileNominatorIds.has(player.id)
            : selectableExecutionNominatorIds.has(player.id);

        if (!canSelect) {
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
        const canSelect =
          (current.voteType ?? "execution") === "traveller_exile"
            ? selectableTravellerExileNomineeIds.has(player.id)
            : selectableExecutionNomineeIds.has(player.id);

        if (current.nominatorPlayerId === player.id || !canSelect) {
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

  const openExecutionWithoutNominationModal = (phaseId = selectedPhase?.id, executionNote = selectedPhaseExecutionNote) => {
    setExecutionPhaseId(phaseId ?? null);
    setExecutionPlayerId(executionNote?.executionPlayerId ?? "");
    setExecutionModalOpen(true);
    setPageError("");
  };

  const closeExecutionWithoutNominationModal = () => {
    setExecutionModalOpen(false);
    setExecutionPlayerId("");
    setExecutionPhaseId(null);
  };

  const markVoteRecordAsExecution = async (voteRecordId: string) => {
    if (!gameId || !effectiveSelectedPhaseId || !selectedPhase) {
      return;
    }

    const now = timestamp();
    const currentVoteRecord = selectedPhaseVoteRecords.find((voteRecord) => voteRecord.id === voteRecordId);

    if (!currentVoteRecord) {
      return;
    }

    const nextWillExecute = !currentVoteRecord.resultedInExecution;

    try {
      await db.transaction("rw", db.voteRecords, db.notes, db.games, db.players, async () => {
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

        if (!currentVoteRecord.resultedInExecution) {
          await db.players.update(currentVoteRecord.nomineePlayerId, {
            alive: false,
            deadVoteAvailable: false,
            updatedAt: now,
          });
        }

        if (selectedPhaseExecutionNote) {
          await db.notes.delete(selectedPhaseExecutionNote.id);
        }

        await updateGameTimestamp(now);
      });
      if (nextWillExecute) {
        await advanceToNextPhase("day_to_night");
      }
      setPageError("");
    } catch {
      setPageError("Не удалось отметить результат казни.");
    }
  };

  const saveExecutionWithoutNomination = async () => {
    const targetPhaseId = executionPhaseId ?? selectedPhase?.id;
    const targetPhase = phasesById.get(targetPhaseId ?? "");
    const targetExecutionNote = executionNoteByPhaseId.get(targetPhaseId ?? "");
    const phaseVoteRecords = voteRecords.filter((voteRecord) => voteRecord.phaseId === targetPhaseId);

    if (!gameId || !targetPhaseId || !targetPhase || !executionPlayerId) {
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
      await db.transaction("rw", db.voteRecords, db.notes, db.games, db.players, async () => {
        await Promise.all(
          phaseVoteRecords.map((voteRecord) =>
            db.voteRecords.update(voteRecord.id, {
              resultedInExecution: false,
              executedPlayerId: undefined,
              updatedAt: now,
            }),
          ),
        );

        if (targetExecutionNote) {
          await db.notes.update(targetExecutionNote.id, {
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
            phaseId: targetPhase.id,
            kind: "execution",
            text: executionText,
            linkedPlayerIds: [executionPlayerId],
            executionPlayerId,
            executionMode: "without_nomination",
            createdAt: now,
            updatedAt: now,
          });
        }

        await db.players.update(executionPlayerId, {
          alive: false,
          deadVoteAvailable: false,
          updatedAt: now,
        });

        await updateGameTimestamp(now);
      });

      closeExecutionWithoutNominationModal();
      if (selectedPhase?.id === targetPhase.id && targetPhase.type === "day") {
        await advanceToNextPhase("day_to_night");
      }
      setPageError("");
    } catch {
      setPageError("Не удалось сохранить казнь без номинации.");
    } finally {
      setExecutionSaving(false);
    }
  };

  const clearExecutionWithoutNomination = async () => {
    const targetExecutionNote = executionNoteByPhaseId.get(executionPhaseId ?? selectedPhase?.id ?? "");

    if (!targetExecutionNote) {
      return;
    }

    const now = timestamp();

    try {
      await db.transaction("rw", db.notes, db.games, async () => {
        await db.notes.delete(targetExecutionNote.id);
        await updateGameTimestamp(now);
      });
      closeExecutionWithoutNominationModal();
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

    const voteType = voteDraft.voteType ?? "execution";
    const alivePlayerCount = players.filter((player) => player.alive).length;
    const participantCount = players.length;

    if (voteType === "execution") {
      if (!nominator.alive) {
        setPageError("Мёртвый игрок не может номинировать на казнь.");
        return;
      }

      if (!nominee.alive) {
        setPageError("Мёртвого игрока нельзя номинировать на казнь.");
        return;
      }

      if (nominee.isTraveller) {
        setPageError("Traveller нельзя номинировать на казнь. Используйте изгнание.");
        return;
      }

      if (usedExecutionNominatorIds.has(nominator.id)) {
        setPageError("Этот игрок уже номинировал в текущий день.");
        return;
      }

      if (usedExecutionNomineeIds.has(nominee.id)) {
        setPageError("Этот игрок уже был номинирован в текущий день.");
        return;
      }
    }

    if (voteType === "traveller_exile" && !nominee.isTraveller) {
      setPageError("На изгнание можно номинировать только Traveller.");
      return;
    }

    const deadVoterPlayerIds = voteDraft.selectedVoterIds.filter((playerId) => !playersById.get(playerId)?.alive);
    const voterNames = voteDraft.selectedVoterIds
      .map((playerId) => playersById.get(playerId)?.name)
      .filter((name): name is string => Boolean(name));
    const deadVoterNames = deadVoterPlayerIds
      .map((playerId) => playersById.get(playerId)?.name)
      .filter((name): name is string => Boolean(name));
    const threshold =
      voteType === "traveller_exile"
        ? getTravellerExileThreshold(participantCount)
        : getExecutionThreshold(alivePlayerCount);
    const now = timestamp();
    const noteText = buildVotingNoteText({
      voteNumber: selectedPhaseVoteRecords.length + 1,
      voteType,
      phaseTitleText: selectedPhase?.title ?? "Дневная фаза",
      nominatorName: nominator.name,
      nomineeName: nominee.name,
      voterNames,
      deadVoterNames,
      threshold,
      thresholdText:
        voteType === "traveller_exile"
          ? `${threshold} из ${participantCount} всех участников`
          : `${threshold} из ${alivePlayerCount} живых`,
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
      voteType,
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
        await reconcileDeadVoteAvailability(now);
        await updateGameTimestamp(now);
      });
      setVoteDraft(null);
    } catch {
      setPageError("Не удалось сохранить голосование.");
    } finally {
      setVoteSaving(false);
    }
  };

  const startEditingHistoryNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
    setEditingVoteRecordId(null);
    setEditingVoteDraft(null);
  };

  const cancelEditingHistoryNote = () => {
    setEditingNoteId(null);
    setEditingNoteText("");
  };

  const saveHistoryNote = async (note: Note) => {
    const trimmed = editingNoteText.trim();

    if (!trimmed) {
      setPageError("Текст карточки не должен быть пустым.");
      return;
    }

    const now = timestamp();

    try {
      await db.transaction("rw", db.notes, db.games, async () => {
        await db.notes.update(note.id, {
          text: trimmed,
          linkedPlayerIds: mergeManualAndMentionLinks(trimmed, players, note.linkedPlayerIds),
          updatedAt: now,
        });
        await updateGameTimestamp(now);
      });
      cancelEditingHistoryNote();
      setPageError("");
    } catch {
      setPageError("Не удалось обновить карточку истории.");
    }
  };

  const startEditingVoteRecord = (voteRecord: VoteRecord) => {
    setEditingVoteRecordId(voteRecord.id);
    setEditingVoteDraft({
      phaseId: voteRecord.phaseId,
      stage: "select_voters",
      nominatorPlayerId: voteRecord.nominatorPlayerId,
      nomineePlayerId: voteRecord.nomineePlayerId,
      selectedVoterIds: voteRecord.voterPlayerIds,
    });
    setEditingNoteId(null);
    setEditingNoteText("");
  };

  const cancelEditingVoteRecord = () => {
    setEditingVoteRecordId(null);
    setEditingVoteDraft(null);
  };

  const toggleEditingVoteRecordVoter = (playerId: string) => {
    setEditingVoteDraft((current) => {
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

  const saveEditedVoteRecord = async (voteRecord: VoteRecord) => {
    if (!gameId || !editingVoteDraft?.nominatorPlayerId || !editingVoteDraft.nomineePlayerId) {
      return;
    }

    const nominator = playersById.get(editingVoteDraft.nominatorPlayerId);
    const nominee = playersById.get(editingVoteDraft.nomineePlayerId);

    if (!nominator || !nominee) {
      setPageError("Не удалось сохранить номинацию.");
      return;
    }

    const deadVoterPlayerIds = editingVoteDraft.selectedVoterIds.filter((playerId) => !playersById.get(playerId)?.alive);
    const voterNames = editingVoteDraft.selectedVoterIds
      .map((playerId) => playersById.get(playerId)?.name)
      .filter((name): name is string => Boolean(name));
    const deadVoterNames = deadVoterPlayerIds
      .map((playerId) => playersById.get(playerId)?.name)
      .filter((name): name is string => Boolean(name));
    const alivePlayerCount = players.filter((player) => player.alive).length;
    const participantCount = players.length;
    const voteType = resolveVoteType(voteRecord);
    const threshold =
      voteType === "traveller_exile"
        ? getTravellerExileThreshold(participantCount)
        : getExecutionThreshold(alivePlayerCount);
    const now = timestamp();
    const historyNote = notes.find(
      (note) =>
        note.phaseId === voteRecord.phaseId &&
        note.kind === "vote_history" &&
        note.createdAt === voteRecord.createdAt,
    );
    const phaseVoteNumber =
      voteRecords
        .filter((currentVoteRecord) => currentVoteRecord.phaseId === voteRecord.phaseId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .findIndex((currentVoteRecord) => currentVoteRecord.id === voteRecord.id) + 1;
    const noteText = buildVotingNoteText({
      voteNumber: Math.max(phaseVoteNumber, 1),
      voteType,
      phaseTitleText: phasesById.get(voteRecord.phaseId)?.title ?? "Дневная фаза",
      nominatorName: nominator.name,
      nomineeName: nominee.name,
      voterNames,
      deadVoterNames,
      threshold,
      thresholdText:
        voteType === "traveller_exile"
          ? `${threshold} из ${participantCount} всех участников`
          : `${threshold} из ${alivePlayerCount} живых`,
    });

    try {
      await db.transaction("rw", db.voteRecords, db.notes, db.games, db.players, async () => {
        await db.voteRecords.update(voteRecord.id, {
          nominatorPlayerId: editingVoteDraft.nominatorPlayerId,
          nomineePlayerId: editingVoteDraft.nomineePlayerId,
          voterPlayerIds: editingVoteDraft.selectedVoterIds,
          deadVoterPlayerIds,
          executedPlayerId: voteRecord.resultedInExecution ? editingVoteDraft.nomineePlayerId : voteRecord.executedPlayerId,
          updatedAt: now,
        });

        if (historyNote) {
          await db.notes.update(historyNote.id, {
            text: noteText,
            linkedPlayerIds: Array.from(
              new Set([
                editingVoteDraft.nominatorPlayerId,
                editingVoteDraft.nomineePlayerId,
                ...editingVoteDraft.selectedVoterIds,
              ]),
            ),
            updatedAt: now,
          });
        }

        await reconcileDeadVoteAvailability(now);
        await updateGameTimestamp(now);
      });

      cancelEditingVoteRecord();
      setPageError("");
    } catch {
      setPageError("Не удалось обновить номинацию.");
    }
  };

  const deleteVoteRecord = async (voteRecord: VoteRecord) => {
    const now = timestamp();
    const historyNote = notes.find(
      (note) =>
        note.phaseId === voteRecord.phaseId &&
        note.kind === "vote_history" &&
        note.createdAt === voteRecord.createdAt,
    );

    try {
      await db.transaction("rw", db.voteRecords, db.notes, db.games, db.players, async () => {
        await db.voteRecords.delete(voteRecord.id);

        if (historyNote) {
          await db.notes.delete(historyNote.id);
        }

        await reconcileDeadVoteAvailability(now);
        await updateGameTimestamp(now);
      });
      setPageError("");
    } catch {
      setPageError("Не удалось удалить номинацию.");
    }
  };

  const summaryItems = useMemo<SummaryItem[]>(() => {
    return [
      ...notes
        .filter((note) => note.kind !== "vote_history")
        .map((note) => ({
          id: note.id,
          createdAt: note.createdAt,
          kind: note.kind === "execution" ? "execution" : "note",
          phase: phasesById.get(note.phaseId),
          note,
        })),
      ...voteRecords.map((voteRecord) => ({
        id: voteRecord.id,
        createdAt: voteRecord.createdAt,
        kind: "vote" as const,
        phase: phasesById.get(voteRecord.phaseId),
        voteRecord,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [notes, phasesById, voteRecords]);

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
  const gameHasStarted = game.hasStarted ?? Boolean(game.startedAt || effectiveSelectedPhaseId);
  const isDayPhase = !selectedPhase || selectedPhase.type === "day";

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
            selectableNominatorIds={
              (voteDraft?.voteType ?? "execution") === "traveller_exile"
                ? selectableTravellerExileNominatorIds
                : selectableExecutionNominatorIds
            }
            selectableNomineeIds={
              (voteDraft?.voteType ?? "execution") === "traveller_exile"
                ? selectableTravellerExileNomineeIds
                : selectableExecutionNomineeIds
            }
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
            <section className="panel space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-stone-50">
                    {gameHasStarted && selectedPhase ? selectedPhase.title : "Игра ещё не началась"}
                  </h2>
                  <p className="mt-1 text-sm text-stone-400">
                    {gameHasStarted && selectedPhase
                      ? selectedPhase.type === "night"
                        ? "Ночная фаза в процессе."
                        : "Дневная фаза в процессе."
                      : "До старта интерфейс остаётся светлым, а заметки и голосования начнутся после кнопки «Начать игру»."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!gameHasStarted ? (
                    <button type="button" onClick={startGame} className="primary-button">
                      <Play className="h-4 w-4" />
                      Начать игру
                    </button>
                  ) : !selectedPhase ? (
                    <button type="button" disabled className="secondary-button opacity-60">
                      Фаза не найдена
                    </button>
                  ) : selectedPhase?.type === "night" ? (
                    <button type="button" onClick={() => void advanceToNextPhase("night_to_day")} className="primary-button">
                      <CheckCircle2 className="h-4 w-4" />
                      Ночь завершилась
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void advanceToNextPhase("day_to_night")}
                      className="secondary-button"
                    >
                      <BedDouble className="h-4 w-4" />
                      Ушли спать без казни
                    </button>
                  )}
                </div>
              </div>
            </section>
            <section className="panel p-2 sm:p-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setContentTab("notes")}
                  className={contentTab === "notes" ? "primary-button min-h-10 px-3 whitespace-nowrap" : "secondary-button min-h-10 px-3 whitespace-nowrap"}
                >
                  Заметки
                </button>
                <button
                  type="button"
                  onClick={() => setContentTab("roleIntel")}
                  className={contentTab === "roleIntel" ? "primary-button min-h-10 px-3 whitespace-nowrap" : "secondary-button min-h-10 px-3 whitespace-nowrap"}
                >
                  По ролям
                </button>
                {gameHasStarted && selectedPhase?.type === "day" ? (
                <button
                  type="button"
                  onClick={() => setContentTab("voting")}
                  className={contentTab === "voting" ? "primary-button min-h-10 px-3 whitespace-nowrap" : "secondary-button min-h-10 px-3 whitespace-nowrap"}
                >
                    Голосования
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setContentTab("reference")}
                  className={contentTab === "reference" ? "primary-button min-h-10 px-3 whitespace-nowrap" : "secondary-button min-h-10 px-3 whitespace-nowrap"}
                >
                  Роли
                </button>
                <button
                  type="button"
                  onClick={() => setContentTab("summary")}
                  className={contentTab === "summary" ? "primary-button min-h-10 px-3 whitespace-nowrap" : "secondary-button min-h-10 px-3 whitespace-nowrap"}
                >
                  Summary
                </button>
              </div>
            </section>
            {!gameHasStarted && contentTab !== "summary" ? (
              <section className="panel p-5 text-center text-stone-500">
                Игра ещё не началась. Нажмите «Начать игру», чтобы перейти в 1 ночь.
              </section>
            ) : null}
            {gameHasStarted && contentTab === "voting" && selectedPhase?.type === "day" ? (
              <section className="panel min-w-0 p-3 sm:p-5">
                {voteDraft ? (
                  <div className="mt-4 space-y-3 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:p-4">
                    <h2 className="text-lg font-semibold text-stone-50">Голосование</h2>
                    <p className="text-sm leading-6 text-stone-300">
                      {voteDraft.stage === "select_nominator"
                        ? voteDraft.voteType === "traveller_exile"
                          ? "На круге выберите игрока, который номинировал Traveller на изгнание."
                          : "На круге выберите игрока, который номинировал."
                        : voteDraft.stage === "select_nominee"
                          ? voteDraft.voteType === "traveller_exile"
                            ? "Теперь выберите Traveller, которого номинировали на изгнание."
                            : "Теперь выберите игрока, которого номинировали."
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
                    <button type="button" onClick={() => beginVoteDraft("execution")} className="secondary-button w-full sm:w-auto">
                      <CheckCircle2 className="h-4 w-4" />
                      Номинация
                    </button>
                    {players.some((player) => player.isTraveller) ? (
                      <button type="button" onClick={() => beginVoteDraft("traveller_exile")} className="secondary-button w-full sm:w-auto">
                        <Crown className="h-4 w-4" />
                        Изгнание Traveller
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openExecutionWithoutNominationModal()}
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
                        const isTravellerExile = analysis.voteType === "traveller_exile";

                        return (
                          <article
                            key={voteRecord.id}
                            className={`rounded-[20px] border p-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.09)] ${
                              index === 0
                                ? "border-amber-500/45 bg-amber-200/28 shadow-[0_0_0_2px_rgba(245,158,11,0.18),0_0_0_8px_rgba(51,51,56,0.16),0_18px_34px_rgba(32,28,24,0.24)]"
                                : isTravellerExile
                                  ? "border-sky-600/25 bg-sky-200/18 shadow-[0_8px_22px_rgba(59,130,246,0.12)]"
                                : leadsToExecution
                                  ? "border-emerald-700/20 bg-emerald-200/14"
                                  : "border-ember-200/15 bg-black/18"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-1.5">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-amber-300 text-stone-900 shadow-lg shadow-amber-950/10">
                                    {isTravellerExile ? <Crown className="h-3.5 w-3.5" /> : <Gavel className="h-3.5 w-3.5" />}
                                  </span>
                                  <div>
                                    <h3 className="text-sm font-semibold leading-tight text-stone-100">
                                      {isTravellerExile ? `Изгнание ${analysis.voteNumber}` : analysis.voteNumber}
                                    </h3>
                                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-stone-500">
                                      <Clock3 className="h-2.5 w-2.5 text-stone-700" />
                                      {formatDate(voteRecord.createdAt)} · {formatTime(voteRecord.createdAt)}
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
                                      : isTravellerExile
                                        ? "bg-sky-300/80 text-sky-950 ring-1 ring-sky-700/15"
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
                                {!isTravellerExile ? (
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
                                ) : null}
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
            {gameHasStarted && contentTab === "notes" ? (
              <PhaseNotes
                phase={selectedPhase}
                notes={selectedPhaseNotes}
                players={players}
                onAddNote={addNote}
                onDeleteNote={deleteNote}
                onUpdateNote={updateNote}
              />
            ) : null}
            {gameHasStarted && contentTab === "roleIntel" ? (
              <RoleIntelPanel
                phase={selectedPhase}
                notes={selectedPhaseRoleIntelNotes}
                players={players}
                roles={roleReferenceRoles}
                onAddNote={addRoleIntelNote}
                onDeleteNote={deleteNote}
                onUpdateNote={updateNote}
              />
            ) : null}
            {gameHasStarted && contentTab === "reference" ? (
              <section className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setReferenceTab("roles")}
                    className={referenceTab === "roles" ? "primary-button min-h-10 px-3 whitespace-nowrap" : "secondary-button min-h-10 px-3 whitespace-nowrap"}
                  >
                    Роли
                  </button>
                  <button
                    type="button"
                    onClick={() => setReferenceTab("nightOrder")}
                    className={referenceTab === "nightOrder" ? "primary-button min-h-10 px-3 whitespace-nowrap" : "secondary-button min-h-10 px-3 whitespace-nowrap"}
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
            {contentTab === "summary" ? (
              <section className="panel min-w-0 p-3 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-stone-50">Summary</h2>
                  <p className="text-sm text-stone-400">
                    История заметок, номинаций и казней. Новые карточки сверху.
                  </p>
                </div>

                <div className="space-y-3">
                  {summaryItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                      История пока пустая.
                    </div>
                  ) : (
                    summaryItems.map((item) => {
                      if (item.kind === "vote") {
                        const voteRecord = item.voteRecord;
                        const isEditingVote = editingVoteRecordId === voteRecord.id;
                        const nominatorName = playersById.get(voteRecord.nominatorPlayerId)?.name ?? "Неизвестно";
                        const nomineeName = playersById.get(voteRecord.nomineePlayerId)?.name ?? "Неизвестно";
                        const voterNames = voteRecord.voterPlayerIds
                          .map((playerId) => playersById.get(playerId)?.name)
                          .filter((name): name is string => Boolean(name));

                        return (
                          <article key={item.id} className="rounded-2xl border border-ember-200/12 bg-black/18 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-300 text-stone-900">
                                    <Gavel className="h-4 w-4" />
                                  </span>
                                  <div>
                                    <h3 className="text-sm font-semibold text-stone-100">
                                      {item.phase?.title ?? "Дневная фаза"}
                                    </h3>
                                    <p className="text-xs text-stone-500">
                                      {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => startEditingVoteRecord(voteRecord)} className="secondary-button min-h-10 px-3">
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => void deleteVoteRecord(voteRecord)} className="danger-button">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {isEditingVote && editingVoteDraft ? (
                              <div className="mt-3 space-y-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <select
                                    value={editingVoteDraft.nominatorPlayerId ?? ""}
                                    onChange={(event) =>
                                      setEditingVoteDraft((current) =>
                                        current ? { ...current, nominatorPlayerId: event.target.value } : current,
                                      )
                                    }
                                    className="field"
                                  >
                                    <option value="">Кто номинировал?</option>
                                    {players.map((player) => (
                                      <option key={player.id} value={player.id}>
                                        {player.name}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={editingVoteDraft.nomineePlayerId ?? ""}
                                    onChange={(event) =>
                                      setEditingVoteDraft((current) =>
                                        current ? { ...current, nomineePlayerId: event.target.value } : current,
                                      )
                                    }
                                    className="field"
                                  >
                                    <option value="">Кого номинировали?</option>
                                    {players.map((player) => (
                                      <option key={player.id} value={player.id}>
                                        {player.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {players.map((player) => {
                                    const selected = editingVoteDraft.selectedVoterIds.includes(player.id);

                                    return (
                                      <button
                                        key={player.id}
                                        type="button"
                                        onClick={() => toggleEditingVoteRecordVoter(player.id)}
                                        className={`rounded-xl border px-3 py-2 text-sm transition ${
                                          selected
                                            ? "border-emerald-300/35 bg-emerald-300/12 text-emerald-100"
                                            : "border-ember-200/10 bg-black/20 text-stone-200"
                                        }`}
                                      >
                                        {player.name}
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button type="button" onClick={() => void saveEditedVoteRecord(voteRecord)} className="primary-button">
                                    <Save className="h-4 w-4" />
                                    Сохранить
                                  </button>
                                  <button type="button" onClick={cancelEditingVoteRecord} className="secondary-button">
                                    <X className="h-4 w-4" />
                                    Отмена
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 grid gap-2 text-sm text-stone-200 sm:grid-cols-2">
                                <div className="rounded-2xl bg-black/10 px-3 py-2">
                                  <p>{nominatorName}</p>
                                  <p>{nomineeName}</p>
                                </div>
                                <div className="rounded-2xl bg-black/10 px-3 py-2">
                                  <p>{countVotesLabel(voteRecord.voterPlayerIds.length)}</p>
                                  <p className="line-clamp-2">{voterNames.length > 0 ? voterNames.join(", ") : "никто"}</p>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      }

                      const note = item.note;
                      const linkedPlayers = note.linkedPlayerIds
                        .map((playerId) => playersById.get(playerId))
                        .filter((player): player is Player => Boolean(player));
                      const isEditingNote = editingNoteId === note.id;

                      return (
                        <article key={item.id} className="rounded-2xl border border-ember-200/12 bg-black/18 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-stone-100">
                                {item.kind === "execution" ? "Казнь" : item.phase?.title ?? "История"}
                              </h3>
                              <p className="text-xs text-stone-500">
                                {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.kind === "execution") {
                                    openExecutionWithoutNominationModal(note.phaseId, note);
                                    return;
                                  }

                                  startEditingHistoryNote(note);
                                }}
                                className="secondary-button min-h-10 px-3"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => void deleteNote(note.id)} className="danger-button">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {isEditingNote ? (
                            <div className="mt-3 space-y-3">
                              <textarea
                                value={editingNoteText}
                                onChange={(event) => setEditingNoteText(event.target.value)}
                                className="field min-h-28"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => void saveHistoryNote(note)} className="primary-button">
                                  <Save className="h-4 w-4" />
                                  Сохранить
                                </button>
                                <button type="button" onClick={cancelEditingHistoryNote} className="secondary-button">
                                  <X className="h-4 w-4" />
                                  Отмена
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-100">{note.text}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {linkedPlayers.length > 0 ? (
                                  linkedPlayers.map((player) => (
                                    <span key={player.id} className="chip">
                                      {player.name}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-stone-500">Без привязки к игрокам</span>
                                )}
                              </div>
                            </>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
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

      {executionModalOpen && phasesById.get(executionPhaseId ?? selectedPhase?.id ?? "")?.type === "day" ? (
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
                {executionNoteByPhaseId.get(executionPhaseId ?? selectedPhase?.id ?? "") ? (
                  <button type="button" onClick={() => void clearExecutionWithoutNomination()} className="danger-button">
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </button>
                ) : null}
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
        lightTheme={isDayPhase || !gameHasStarted}
        onClose={() => setSetupOpen(false)}
        onSave={saveSetup}
      />

      {finishOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6">
          <section
            className={`w-full rounded-t-3xl border p-4 shadow-2xl sm:mx-auto sm:max-w-xl sm:rounded-3xl sm:p-6 ${
              isDayPhase || !gameHasStarted
                ? "border-amber-700/16 bg-[#f7eddc] shadow-[0_22px_60px_rgba(60,44,20,0.18)]"
                : "border-ember-200/15 bg-ink-850"
            }`}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className={`text-sm ${isDayPhase || !gameHasStarted ? "text-stone-500" : "text-stone-400"}`}>Завершение партии</p>
                <h2 className={`text-2xl font-bold ${isDayPhase || !gameHasStarted ? "text-stone-800" : "text-stone-50"}`}>Итог</h2>
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
