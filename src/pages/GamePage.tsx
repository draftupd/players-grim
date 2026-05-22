import { ArrowLeft, CheckCircle2, Save, Settings, X } from "lucide-react";
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
import VotingSetupModal from "../components/VotingSetupModal";
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
  nominatorName,
  nomineeName,
  voterNames,
  deadVoterNames,
  alivePlayerCount,
}: {
  voteNumber: number;
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
    `Номинировал: ${nominatorName}`,
    `Номинирован: ${nomineeName}`,
    `Голосовали (${voteCount}): ${voterNames.length > 0 ? voterNames.join(", ") : "никто"}`,
    `Мертвые голоса: ${deadVoterNames.length > 0 ? deadVoterNames.join(", ") : "нет"}`,
    `Порог: ${threshold} из ${alivePlayerCount} живых`,
    `Итог: ${outcome}`,
  ].join("\n");
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
  const [votingSetupOpen, setVotingSetupOpen] = useState(false);
  const [voteDraft, setVoteDraft] = useState<VoteDraft | null>(null);
  const [voteSaving, setVoteSaving] = useState(false);
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
    () => notes.filter((note) => note.phaseId === effectiveSelectedPhaseId && note.kind !== "vote_history"),
    [notes, effectiveSelectedPhaseId],
  );
  const selectedPhaseVoteNotes = useMemo(
    () => notes.filter((note) => note.phaseId === effectiveSelectedPhaseId && note.kind === "vote_history"),
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
      setVotingSetupOpen(false);
    }
  }, [selectedPhase?.type]);

  useEffect(() => {
    if (selectedPhase?.type !== "night" && referenceTab === "nightOrder") {
      setReferenceTab("roles");
    }
  }, [referenceTab, selectedPhase?.type]);

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

  const beginVoteDraft = (nominatorPlayerId: string, nomineePlayerId: string) => {
    if (!selectedPhase || selectedPhase.type !== "day") {
      return;
    }

    setVoteDraft({
      phaseId: selectedPhase.id,
      nominatorPlayerId,
      nomineePlayerId,
      selectedVoterIds: [],
    });
    setVotingSetupOpen(false);
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
    setVotingSetupOpen(false);
  };

  const saveVoteDraft = async () => {
    if (!gameId || !voteDraft) {
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
            showVoteMarkers={selectedPhase?.type === "day" || Boolean(voteDraft)}
            voteAvailabilityByPlayerId={voteAvailabilityByPlayerId}
            onToggleVoteVoter={voteDraft ? toggleVoteDraftVoter : undefined}
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
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-lg font-semibold text-stone-50">Голосование</h2>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={saveVoteDraft}
                          disabled={voteSaving}
                          className="primary-button w-full sm:w-auto"
                        >
                          <Save className="h-4 w-4" />
                          {voteSaving ? "Сохранение" : "Сохранить голосование"}
                        </button>
                        <button type="button" onClick={cancelVoteDraft} className="secondary-button w-full sm:w-auto">
                          <X className="h-4 w-4" />
                          Отмена
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="chip">
                        Номинировал: {playersById.get(voteDraft.nominatorPlayerId)?.name ?? "?"}
                      </span>
                      <span className="chip">
                        Номинирован: {playersById.get(voteDraft.nomineePlayerId)?.name ?? "?"}
                      </span>
                      <span className="chip">Отмечено голосов: {voteDraft.selectedVoterIds.length}</span>
                    </div>
                    <p className="text-sm leading-6 text-stone-300">
                      На круге появились чекбоксы. Отметь всех, кто голосовал по этой номинации, затем сохрани результат.
                    </p>
                  </div>
                ) : (
                  <button type="button" onClick={() => setVotingSetupOpen(true)} className="secondary-button w-full sm:w-auto">
                    <CheckCircle2 className="h-4 w-4" />
                    Номинация
                  </button>
                )}

                <div className="mt-4 space-y-3">
                  {selectedPhaseVoteNotes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                      В этой фазе пока нет истории голосований.
                    </div>
                  ) : (
                    selectedPhaseVoteNotes.map((note) => (
                      <article key={note.id} className="rounded-2xl border border-ember-200/10 bg-black/18 p-3 sm:p-4">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-stone-100">{note.text}</p>
                      </article>
                    ))
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
        notes={notes.filter((note) => note.kind !== "vote_history")}
        players={players}
        phases={phases}
        scriptRoles={game.scriptRoles}
        onClose={() => setSelectedPlayerId(null)}
        onSave={savePlayer}
        onAddNote={addNoteToPhase}
        onDeleteNote={deleteNote}
        onUpdateNote={updateNote}
      />

      <SetupEditorModal
        game={setupOpen ? game : null}
        players={players}
        onClose={() => setSetupOpen(false)}
        onSave={saveSetup}
      />

      <VotingSetupModal
        open={votingSetupOpen}
        phase={selectedPhase?.type === "day" ? selectedPhase : undefined}
        players={players}
        onClose={() => setVotingSetupOpen(false)}
        onConfirm={beginVoteDraft}
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
