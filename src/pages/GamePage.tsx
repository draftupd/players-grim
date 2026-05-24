import {
  ArrowLeft,
  CheckCircle2,
  MoonStar,
  Play,
  Save,
  Settings,
  Skull,
  SunMedium,
  Trash2,
  X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import NightOrderPanel from "../components/NightOrderPanel";
import PhaseNotes from "../components/PhaseNotes";
import PlayerCircle from "../components/PlayerCircle";
import PlayerDetailModal from "../components/PlayerDetailModal";
import RoleIconGrid from "../components/RoleIconGrid";
import RoleIntelPanel from "../components/RoleIntelPanel";
import RoleReferencePanel from "../components/RoleReferencePanel";
import RoleTokenImage from "../components/RoleTokenImage";
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
  todayInputValue,
  winnerLabel,
} from "../utils/dates";
import { createId } from "../utils/ids";
import { mergeManualAndMentionLinks } from "../utils/mentions";
import { getRoleLabel, groupRolesByType, normalizeRoleId } from "../utils/scripts";
import { mergeReferenceRoles, useReferenceData } from "../utils/referenceData";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
    }
  | {
      id: string;
      createdAt: string;
      kind: "day_result";
      phase: Phase;
      text: string;
      linkedPlayerIds: string[];
      className: string;
    }
  | {
      id: string;
      createdAt: string;
      kind: "role_group";
      roleId?: string;
      notes: Note[];
    };

const countVotesLabel = (count: number) =>
  `${count} ${count === 1 ? "голос" : count >= 2 && count <= 4 ? "голоса" : "голосов"}`;

const DAY_DEATH_ROLE_IDS = new Set([
  "boomdandy",
  "cerenovus",
  "daoke",
  "doomsayer",
  "gnome",
  "golem",
  "gunslinger",
  "harpy",
  "mutant",
  "psychopath",
  "riot",
  "scapegoat",
  "slayer",
  "tinker",
  "virgin",
  "vizier",
  "witch",
]);

const EXECUTION_SURVIVAL_ROLE_IDS = new Set([
  "devilsadvocate",
  "fool",
  "jinyiwei",
  "lleech",
  "pacifist",
  "sailor",
  "tealady",
  "zombuul",
]);

const buildDayDeathSummaryText = (playerNames: string[]) =>
  playerNames.length === 0
    ? "Дневная смерть"
    : playerNames.length === 1
      ? `Умер: ${playerNames[0]}`
      : `Умерли: ${playerNames.join(", ")}`;

const buildDayDeathNoteText = (playerNames: string[], roleLabel: string) =>
  playerNames.length === 1
    ? `Днём умер по роли ${roleLabel}: ${playerNames[0]}.`
    : `Днём умерли по роли ${roleLabel}: ${playerNames.join(", ")}.`;

const buildExecutionSurvivalSummaryText = (playerName: string) => `Выжил после казни: ${playerName}`;
const NIGHT_RESULT_EMPTY_TEXT = "Этой ночью никто не умер.";
const buildNightDeathNoteText = (playerName: string) => `${playerName} умер ночью.`;
const isNightResultNote = (note: Note) =>
  note.kind === "general" && (note.text === NIGHT_RESULT_EMPTY_TEXT || note.text.endsWith(" умер ночью."));

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
  const [specialFormOpen, setSpecialFormOpen] = useState(false);
  const [specialFormRoleType, setSpecialFormRoleType] = useState<"fabled" | "loric">("fabled");
  const [travellerFormOpen, setTravellerFormOpen] = useState(false);
  const [localMyPlayerId, setLocalMyPlayerId] = useState<string | null | undefined>();
  const [voteDraft, setVoteDraft] = useState<VoteDraft | null>(null);
  const [voteSaving, setVoteSaving] = useState(false);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [executionPlayerId, setExecutionPlayerId] = useState("");
  const [executionSaving, setExecutionSaving] = useState(false);
  const [executionPhaseId, setExecutionPhaseId] = useState<string | null>(null);
  const [executionFinishPromptVoteRecordId, setExecutionFinishPromptVoteRecordId] = useState<string | null>(null);
  const [executionFinishPromptOutcome, setExecutionFinishPromptOutcome] = useState<"died" | "survived">("died");
  const [executionFinishPromptProtectionRoleId, setExecutionFinishPromptProtectionRoleId] = useState("");
  const [executionFinishPromptSaving, setExecutionFinishPromptSaving] = useState(false);
  const [nightResultModalOpen, setNightResultModalOpen] = useState(false);
  const [nightDeathPlayerIds, setNightDeathPlayerIds] = useState<string[]>([]);
  const [nightResultSaving, setNightResultSaving] = useState(false);
  const [nightResultCandidatePlayerIds, setNightResultCandidatePlayerIds] = useState<string[]>([]);
  const [nightResultSnapshot, setNightResultSnapshot] = useState<{
    phaseId: string;
    playerStates: Array<{ id: string; alive: boolean; deadVoteAvailable?: boolean }>;
  } | null>(null);
  const [dayDeathModalOpen, setDayDeathModalOpen] = useState(false);
  const [dayDeathPlayerIds, setDayDeathPlayerIds] = useState<string[]>([]);
  const [dayDeathRoleId, setDayDeathRoleId] = useState("");
  const [dayDeathPhaseId, setDayDeathPhaseId] = useState<string | null>(null);
  const [dayDeathEditingNoteId, setDayDeathEditingNoteId] = useState<string | null>(null);
  const [dayDeathSaving, setDayDeathSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [contentTab, setContentTab] = useState<
    "notes" | "roleIntel" | "reference" | "summaryDeaths" | "summaryRoles" | null
  >(null);
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
          note.kind !== "role_intel" &&
          note.kind !== "day_death",
      ),
    [notes, effectiveSelectedPhaseId],
  );
  const selectedPhaseRoleIntelNotes = useMemo(
    () =>
      notes
        .filter((note) => note.kind === "role_intel")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notes],
  );
  const selectedPhaseDayDeathNotes = useMemo(
    () =>
      notes
        .filter((note) => note.phaseId === effectiveSelectedPhaseId && note.kind === "day_death")
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
  const scenarioReferenceRoles = useMemo(
    () =>
      mergeReferenceRoles(
        gameResult.game?.scriptRoles ?? [],
        referenceData?.roleMap ?? new Map(),
      ),
    [gameResult.game?.scriptRoles, referenceData?.roleMap],
  );
  const dayDeathRoles = useMemo(() => {
    const matchingRoles = scenarioReferenceRoles.filter((role) => DAY_DEATH_ROLE_IDS.has(normalizeRoleId(role.id)));

    if (matchingRoles.length > 0) {
      return matchingRoles;
    }

    return (referenceData?.roles ?? []).filter((role) => DAY_DEATH_ROLE_IDS.has(normalizeRoleId(role.id)));
  }, [referenceData?.roles, scenarioReferenceRoles]);
  const executionProtectionRoles = useMemo(() => {
    const matchingRoles = roleReferenceRoles.filter((role) => EXECUTION_SURVIVAL_ROLE_IDS.has(normalizeRoleId(role.id)));

    if (matchingRoles.length > 0) {
      return matchingRoles;
    }

    return (referenceData?.roles ?? []).filter((role) => EXECUTION_SURVIVAL_ROLE_IDS.has(normalizeRoleId(role.id)));
  }, [referenceData?.roles, roleReferenceRoles]);
  const dayDeathRoleGroups = useMemo(
    () =>
      groupRolesByType(dayDeathRoles).map((group) => ({
        key: group.type,
        label: group.label,
        roleIds: group.roles.map((role) => role.id),
      })),
    [dayDeathRoles],
  );
  const executionProtectionRoleGroups = useMemo(
    () =>
      groupRolesByType(executionProtectionRoles).map((group) => ({
        key: group.type,
        label: group.label,
        roleIds: group.roles.map((role) => role.id),
      })),
    [executionProtectionRoles],
  );
  const roleMentionEntries = useMemo(() => {
    const mentions = new Map<string, string>();

    roleReferenceRoles.forEach((role) => {
      [role.name, getRoleLabel(role.id, roleReferenceRoles)].forEach((label) => {
        const trimmed = label.trim();

        if (trimmed) {
          mentions.set(trimmed, role.id);
        }
      });
    });

    return Array.from(mentions.entries()).sort((a, b) => b[0].length - a[0].length);
  }, [roleReferenceRoles]);
  const nightResultModalPlayers = useMemo(() => {
    if (nightResultCandidatePlayerIds.length === 0) {
      return [];
    }

    const candidateIds = new Set(nightResultCandidatePlayerIds);

    return [...players]
      .filter((player) => candidateIds.has(player.id))
      .sort((a, b) => a.seatIndex - b.seatIndex);
  }, [nightResultCandidatePlayerIds, players]);
  const roleMentionMap = useMemo(() => new Map(roleMentionEntries), [roleMentionEntries]);
  const roleMentionRegex = useMemo(
    () =>
      roleMentionEntries.length > 0
        ? new RegExp(`(${roleMentionEntries.map(([label]) => escapeRegExp(label)).join("|")})`, "g")
        : null,
    [roleMentionEntries],
  );
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

      let statusLabel = voteType === "traveller_exile" ? "Голосов не хватило" : "Не хватило";

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
  const currentBlockPlayerId = useMemo(() => {
    let current: string | null = null;

    selectedPhaseVoteAnalysesAsc.forEach((analysis) => {
      if (analysis.voteType !== "execution") {
        return;
      }

      if (analysis.removedPreviousFromBlock && !analysis.isOnTheBlock) {
        current = null;
        return;
      }

      if (analysis.isOnTheBlock) {
        current = analysis.voteRecord.nomineePlayerId;
      }
    });

    return current;
  }, [selectedPhaseVoteAnalysesAsc]);
  const selectedPhaseExecutionNote = useMemo(
    () => notes.find((note) => note.phaseId === effectiveSelectedPhaseId && note.kind === "execution"),
    [notes, effectiveSelectedPhaseId],
  );
  const dayDeathNoteById = useMemo(
    () =>
      new Map(
        notes
          .filter((note) => note.kind === "day_death")
          .map((note) => [note.id, note] as const),
      ),
    [notes],
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
  const voteRequirementSummary = useMemo(() => {
    if (!voteDraft || !selectedPhase || selectedPhase.type !== "day") {
      return null;
    }

    const aliveVotes = players.filter((player) => player.alive).length;
    const deadVotes = players.filter((player) => !player.alive && voteAvailabilityByPlayerId.get(player.id) === "dead_available").length;
    const totalVotes = aliveVotes + deadVotes;

    if ((voteDraft.voteType ?? "execution") === "traveller_exile") {
      const threshold = getTravellerExileThreshold(players.length);

      return {
        headline: `Нужно ${threshold} голосов, чтобы изгнать Traveller`,
        aliveVotes,
        deadVotes,
        totalVotes,
      };
    }

    const threshold = getExecutionThreshold(aliveVotes);
    let highestVotes = 0;

    [...selectedPhaseVoteRecords]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((voteRecord) => {
        if (resolveVoteType(voteRecord) !== "execution") {
          return;
        }

        const voteCount = voteRecord.voterPlayerIds.length;

        if (voteCount < threshold) {
          return;
        }

        if (voteCount > highestVotes) {
          highestVotes = voteCount;
          return;
        }

        if (voteCount === highestVotes) {
          highestVotes = voteCount;
        }
      });

    return {
      headline:
        highestVotes === 0
          ? `Нужно ${threshold} голосов, чтобы номинировать`
          : `Нужно ${highestVotes} голосов, чтобы сровнять, и ${highestVotes + 1} — чтобы номинировать`,
      aliveVotes,
      deadVotes,
      totalVotes,
    };
  }, [players, selectedPhase, selectedPhaseVoteRecords, voteAvailabilityByPlayerId, voteDraft]);

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

  useEffect(() => {
    const modalPhase = phasesById.get(dayDeathPhaseId ?? selectedPhase?.id ?? "");

    if (modalPhase?.type !== "day") {
      setDayDeathModalOpen(false);
      setDayDeathPlayerIds([]);
      setDayDeathRoleId("");
      setDayDeathPhaseId(null);
      setDayDeathEditingNoteId(null);
    }
  }, [dayDeathPhaseId, phasesById, selectedPhase?.id, selectedPhase?.type]);

  useEffect(() => {
    if (selectedPhase?.type !== "day") {
      setExecutionFinishPromptVoteRecordId(null);
      setExecutionFinishPromptOutcome("died");
      setExecutionFinishPromptProtectionRoleId("");
    }
  }, [selectedPhase?.type]);

  useEffect(() => {
    if (selectedPhase?.type !== "night") {
      setNightResultModalOpen(false);
      setNightDeathPlayerIds([]);
      setNightResultCandidatePlayerIds([]);
      setNightResultSnapshot(null);
    }
  }, [selectedPhase?.type]);

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

    if (!gameResult.game?.myRoleId) {
      setPageError("Перед началом игры нужно указать мой жетон.");
      return;
    }

    const now = timestamp();

    try {
      await db.transaction("rw", db.phases, db.games, async () => {
        const firstNight = (await ensurePhaseExists(1, "night", now)) ?? buildPhase(gameId, 1, "night", now);
        await setCurrentPhase(firstNight, now, { startGame: true });
      });
      setPageError("");
      setContentTab(null);
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
      setContentTab(null);
    } catch {
      setPageError("Не удалось перейти к следующей фазе.");
    }
  };

  const openNightResultModal = () => {
    if (selectedPhase?.type !== "night") {
      return;
    }

    const existingNightResultNotes = notes.filter(
      (note) => note.phaseId === selectedPhase.id && isNightResultNote(note),
    );
    const existingSelectedPlayerIds = existingNightResultNotes.flatMap((note) => note.linkedPlayerIds);
    const candidatePlayerIds = Array.from(
      new Set([
        ...players.filter((player) => player.alive).map((player) => player.id),
        ...existingSelectedPlayerIds,
      ]),
    );

    setNightResultSnapshot({
      phaseId: selectedPhase.id,
      playerStates: players
        .filter((player) => candidatePlayerIds.includes(player.id))
        .map((player) => ({
          id: player.id,
          alive: player.alive,
          deadVoteAvailable: player.deadVoteAvailable,
        })),
    });
    setNightResultCandidatePlayerIds(candidatePlayerIds);
    setNightDeathPlayerIds(existingSelectedPlayerIds);
    setNightResultModalOpen(true);
    setPageError("");
  };

  const closeNightResultModal = () => {
    setNightResultModalOpen(false);
    setNightDeathPlayerIds([]);
    setNightResultCandidatePlayerIds([]);
    setNightResultSnapshot(null);
  };

  const openContentModal = (
    nextTab: "notes" | "roleIntel" | "reference" | "summaryDeaths" | "summaryRoles",
  ) => {
    if ((nextTab === "notes" || nextTab === "roleIntel") && !gameHasStarted) {
      return;
    }

    setContentTab(nextTab);
  };

  const closeContentModal = () => {
    setContentTab(null);
  };

  const toggleNightDeathPlayer = (playerId: string) => {
    if (nightResultSaving) {
      return;
    }

    setNightDeathPlayerIds((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId],
    );
  };

  const saveNightResult = async () => {
    if (!gameId || !selectedPhase || selectedPhase.type !== "night") {
      return;
    }

    const now = timestamp();
    const selectedIdSet = new Set(nightDeathPlayerIds);
    const candidatePlayers = nightResultModalPlayers;
    const deathNotes: Note[] =
      nightDeathPlayerIds.length > 0
        ? candidatePlayers
            .filter((player) => selectedIdSet.has(player.id))
            .map((player) => ({
              id: createId(),
              gameId,
              phaseId: selectedPhase.id,
              kind: "general" as const,
              text: buildNightDeathNoteText(player.name),
              linkedPlayerIds: [player.id],
              createdAt: now,
              updatedAt: now,
            }))
        : [
            {
              id: createId(),
              gameId,
              phaseId: selectedPhase.id,
              kind: "general" as const,
              text: NIGHT_RESULT_EMPTY_TEXT,
              linkedPlayerIds: [],
              createdAt: now,
              updatedAt: now,
            },
          ];

    setNightResultSaving(true);
    setPageError("");

    try {
      await db.transaction("rw", db.players, db.notes, db.phases, db.games, async () => {
        const existingPhaseNotes = await db.notes
          .where("[gameId+createdAt]")
          .between([gameId, ""], [gameId, "\uffff"])
          .toArray();
        const existingNightNotes = existingPhaseNotes.filter(
          (note) => note.phaseId === selectedPhase.id && isNightResultNote(note),
        );

        if (existingNightNotes.length > 0) {
          await db.notes.bulkDelete(existingNightNotes.map((note) => note.id));
        }

        await db.notes.bulkAdd(deathNotes);

        const snapshotStates = new Map((nightResultSnapshot?.playerStates ?? []).map((player) => [player.id, player]));

        await Promise.all(
          candidatePlayers.map((player) => {
            const originalState = snapshotStates.get(player.id);
            const isSelected = selectedIdSet.has(player.id);

            return db.players.update(player.id, {
              alive: isSelected ? false : originalState?.alive ?? true,
              deadVoteAvailable: isSelected ? false : originalState?.deadVoteAvailable ?? true,
              updatedAt: now,
            });
          }),
        );

        const nextPhase =
          (await ensurePhaseExists(selectedPhase.number, "day", now)) ??
          buildPhase(gameId, selectedPhase.number, "day", now);
        await setCurrentPhase(nextPhase, now);
      });

      closeNightResultModal();
      setContentTab(null);
    } catch {
      setPageError("Не удалось сохранить результат ночи.");
    } finally {
      setNightResultSaving(false);
    }
  };

  const openDayDeathModal = (note?: Note) => {
    const targetPhaseId = note?.phaseId ?? selectedPhase?.id;
    const targetPhase = phasesById.get(targetPhaseId ?? "");

    if (!targetPhaseId || targetPhase?.type !== "day") {
      return;
    }

    setDayDeathPhaseId(targetPhaseId);
    setDayDeathEditingNoteId(note?.kind === "day_death" ? note.id : null);
    setDayDeathPlayerIds(note?.kind === "day_death" ? note.linkedPlayerIds : []);
    setDayDeathRoleId(note?.kind === "day_death" ? note.roleId ?? "" : "");
    setDayDeathModalOpen(true);
    setPageError("");
  };

  const closeDayDeathModal = () => {
    setDayDeathModalOpen(false);
    setDayDeathPlayerIds([]);
    setDayDeathRoleId("");
    setDayDeathPhaseId(null);
    setDayDeathEditingNoteId(null);
  };

  const toggleDayDeathPlayer = (playerId: string) => {
    setDayDeathPlayerIds((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId],
    );
  };

  const saveDayDeathResult = async () => {
    const targetPhaseId = dayDeathPhaseId ?? selectedPhase?.id;
    const targetPhase = phasesById.get(targetPhaseId ?? "");
    const existingNote = dayDeathEditingNoteId ? dayDeathNoteById.get(dayDeathEditingNoteId) : undefined;

    if (!gameId || !targetPhaseId || targetPhase?.type !== "day" || !dayDeathRoleId || dayDeathPlayerIds.length === 0) {
      return;
    }

    const affectedPlayers = players.filter(
      (player) => dayDeathPlayerIds.includes(player.id) && (player.alive || existingNote?.linkedPlayerIds.includes(player.id)),
    );

    if (affectedPlayers.length === 0) {
      setPageError("Выберите хотя бы одного игрока, который умер днём.");
      return;
    }

    const now = timestamp();
    const roleLabel = getRoleLabel(dayDeathRoleId, dayDeathRoles);
    const playerNames = affectedPlayers.map((player) => player.name);
    const noteText = buildDayDeathNoteText(playerNames, roleLabel);
    const oldLinkedPlayerIds = existingNote?.linkedPlayerIds ?? [];
    const restoredPlayerIds = oldLinkedPlayerIds.filter((playerId) => !dayDeathPlayerIds.includes(playerId));

    try {
      setDayDeathSaving(true);

      await db.transaction("rw", db.notes, db.games, db.players, async () => {
        if (existingNote) {
          await db.notes.update(existingNote.id, {
            roleId: dayDeathRoleId,
            text: noteText,
            linkedPlayerIds: affectedPlayers.map((player) => player.id),
            updatedAt: now,
          });
        } else {
          await db.notes.add({
            id: createId(),
            gameId,
            phaseId: targetPhaseId,
            kind: "day_death",
            roleId: dayDeathRoleId,
            text: noteText,
            linkedPlayerIds: affectedPlayers.map((player) => player.id),
            createdAt: now,
            updatedAt: now,
          });
        }

        await Promise.all([
          ...affectedPlayers.map((player) =>
            db.players.update(player.id, {
              alive: false,
              deadVoteAvailable: false,
              updatedAt: now,
            }),
          ),
          ...restoredPlayerIds.map((playerId) =>
            db.players.update(playerId, {
              alive: true,
              deadVoteAvailable: true,
              updatedAt: now,
            }),
          ),
        ]);

        await updateGameTimestamp(now);
      });

      closeDayDeathModal();
      setPageError("");
    } catch {
      setPageError("Не удалось сохранить дневную смерть.");
    } finally {
      setDayDeathSaving(false);
    }
  };

  const deleteDayDeathNote = async (note: Note) => {
    if (note.kind !== "day_death") {
      await deleteNote(note.id);
      return;
    }

    const now = timestamp();

    try {
      await db.transaction("rw", db.notes, db.games, db.players, async () => {
        await db.notes.delete(note.id);
        await Promise.all(note.linkedPlayerIds.map(async (playerId) => {
          const hasOtherDayDeath = notes.some(
            (currentNote) =>
              currentNote.id !== note.id &&
              currentNote.phaseId === note.phaseId &&
              currentNote.kind === "day_death" &&
              currentNote.linkedPlayerIds.includes(playerId),
          );
          const hasVoteExecution = voteRecords.some(
            (voteRecord) =>
              voteRecord.phaseId === note.phaseId &&
              voteRecord.resultedInExecution &&
              voteRecord.executedPlayerId === playerId &&
              voteRecord.executedPlayerDied !== false,
          );
          const hasExecutionWithoutNomination = notes.some(
            (currentNote) =>
              currentNote.phaseId === note.phaseId &&
              currentNote.kind === "execution" &&
              currentNote.executionPlayerId === playerId,
          );

          if (!hasOtherDayDeath && !hasVoteExecution && !hasExecutionWithoutNomination) {
            await db.players.update(playerId, {
              alive: true,
              deadVoteAvailable: true,
              updatedAt: now,
            });
          }
        }));
        await updateGameTimestamp(now);
      });
      setPageError("");
    } catch {
      setPageError("Не удалось удалить дневную смерть.");
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

  const deleteTraveller = async (playerId: string) => {
    if (!gameId) {
      return;
    }

    const now = timestamp();
    const traveller = players.find((player) => player.id === playerId);

    await db.transaction("rw", db.players, db.games, async () => {
      await db.players.delete(playerId);

      if (effectiveMyPlayerId === playerId) {
        await db.games.update(gameId, {
          myPlayerId: undefined,
          myRoleId: undefined,
          myTeam: undefined,
          updatedAt: now,
        });
        setLocalMyPlayerId(null);
      } else {
        await updateGameTimestamp(now);
      }
    });

    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
    }

    if (traveller?.isTraveller && travellerFormOpen) {
      setTravellerFormOpen(false);
    }
  };

  const duplicateSetup = async () => {
    if (!gameId || !gameResult.game) {
      return;
    }

    const sourceGame = gameResult.game;
    const now = timestamp();
    const newGameId = createId();
    const baseTitle = sourceGame.scriptName?.trim() || sourceGame.title.trim() || "Новая партия";

    const duplicatedGame: Game = {
      id: newGameId,
      title: baseTitle,
      date: todayInputValue(),
      storyteller: sourceGame.storyteller,
      scriptName: sourceGame.scriptName,
      scriptAuthor: sourceGame.scriptAuthor,
      scriptRoles: sourceGame.scriptRoles,
      playerCount: sourceGame.playerCount,
      status: "active",
      activeFabledIds: undefined,
      activeLoricIds: undefined,
      hasStarted: false,
      currentPhaseId: undefined,
      myPlayerId: undefined,
      myRoleId: undefined,
      myTeam: undefined,
      winner: undefined,
      finalNotes: undefined,
      startedAt: undefined,
      finishedAt: undefined,
      pinnedAt: undefined,
      trashedAt: undefined,
      customTokenPositions: undefined,
      grimoireStyle: undefined,
      createdAt: now,
      updatedAt: now,
    };

    const duplicatedPlayers: Player[] = players.map((player) => ({
      id: createId(),
      gameId: newGameId,
      name: player.name,
      seatIndex: player.seatIndex,
      alive: true,
      deadVoteAvailable: true,
      tokenTint: "default",
      mainRole: undefined,
      additionalRoles: ["", "", ""],
      isTraveller: undefined,
      travellerRole: undefined,
      travellerTeam: undefined,
      joinedPhaseId: undefined,
      leftPhaseId: undefined,
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

        if (!canSelect) {
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

  const markVoteRecordAsExecution = async (
    voteRecordId: string,
    options?: { finishAfterExecution?: boolean; executedPlayerDied?: boolean; protectionRoleId?: string },
  ) => {
    if (!gameId || !effectiveSelectedPhaseId || !selectedPhase) {
      return false;
    }

    const now = timestamp();
    const currentVoteRecord = selectedPhaseVoteRecords.find((voteRecord) => voteRecord.id === voteRecordId);

    if (!currentVoteRecord) {
      return false;
    }

    const nextWillExecute = !currentVoteRecord.resultedInExecution;
    const executedPlayerDied = options?.executedPlayerDied ?? true;

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
              executedPlayerDied:
                voteRecord.id === voteRecordId && !voteRecord.resultedInExecution
                  ? executedPlayerDied
                  : undefined,
              executionProtectionRoleId:
                voteRecord.id === voteRecordId && !voteRecord.resultedInExecution && !executedPlayerDied
                  ? options?.protectionRoleId || undefined
                  : undefined,
              updatedAt: now,
            }),
          ),
        );

        if (!currentVoteRecord.resultedInExecution && executedPlayerDied) {
          await db.players.update(currentVoteRecord.nomineePlayerId, {
            alive: false,
            deadVoteAvailable: false,
            updatedAt: now,
          });
        }

        if (currentVoteRecord.resultedInExecution && currentVoteRecord.executedPlayerId) {
          const hasOtherDayDeath = notes.some(
            (note) =>
              note.phaseId === currentVoteRecord.phaseId &&
              note.kind === "day_death" &&
              note.linkedPlayerIds.includes(currentVoteRecord.executedPlayerId!),
          );
          const hasExecutionWithoutNomination =
            selectedPhaseExecutionNote?.phaseId === currentVoteRecord.phaseId &&
            selectedPhaseExecutionNote.executionPlayerId === currentVoteRecord.executedPlayerId;

          if (!hasOtherDayDeath && !hasExecutionWithoutNomination) {
            await db.players.update(currentVoteRecord.executedPlayerId, {
              alive: true,
              deadVoteAvailable: true,
              updatedAt: now,
            });
          }
        }

        if (selectedPhaseExecutionNote) {
          await db.notes.delete(selectedPhaseExecutionNote.id);
        }

        await updateGameTimestamp(now);
      });
      if (nextWillExecute && !options?.finishAfterExecution) {
        await advanceToNextPhase("day_to_night");
      }
      setPageError("");
      return true;
    } catch {
      setPageError("Не удалось отметить результат казни.");
      return false;
    }
  };

  const promptVoteRecordExecution = async (voteRecordId: string) => {
    const voteRecord = selectedPhaseVoteRecords.find((currentVoteRecord) => currentVoteRecord.id === voteRecordId);

    if (!voteRecord) {
      return;
    }

    if (voteRecord.resultedInExecution) {
      await markVoteRecordAsExecution(voteRecordId);
      return;
    }

    setExecutionFinishPromptOutcome("died");
    setExecutionFinishPromptProtectionRoleId("");
    setExecutionFinishPromptVoteRecordId(voteRecordId);
    setPageError("");
  };

  const closeExecutionFinishPrompt = () => {
    if (executionFinishPromptSaving) {
      return;
    }

    setExecutionFinishPromptVoteRecordId(null);
    setExecutionFinishPromptOutcome("died");
    setExecutionFinishPromptProtectionRoleId("");
  };

  const confirmVoteRecordExecution = async (finishAfterExecution: boolean) => {
    if (!executionFinishPromptVoteRecordId) {
      return;
    }

    setExecutionFinishPromptSaving(true);

    try {
      const saved = await markVoteRecordAsExecution(executionFinishPromptVoteRecordId, {
        finishAfterExecution,
        executedPlayerDied: executionFinishPromptOutcome === "died",
        protectionRoleId:
          executionFinishPromptOutcome === "survived" ? executionFinishPromptProtectionRoleId || undefined : undefined,
      });
      if (!saved) {
        return;
      }

      setExecutionFinishPromptVoteRecordId(null);
      setExecutionFinishPromptOutcome("died");
      setExecutionFinishPromptProtectionRoleId("");

      if (finishAfterExecution && executionFinishPromptOutcome === "died") {
        openFinishForm();
      }
    } finally {
      setExecutionFinishPromptSaving(false);
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
              executedPlayerDied: undefined,
              executionProtectionRoleId: undefined,
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
          executedPlayerDied: voteRecord.executedPlayerDied,
          executionProtectionRoleId: voteRecord.executionProtectionRoleId,
          updatedAt: now,
        });

        if (historyNote) {
          await db.notes.update(historyNote.id, {
            text: noteText,
            linkedPlayerIds: Array.from(
              new Set(
                [
                  editingVoteDraft.nominatorPlayerId,
                  editingVoteDraft.nomineePlayerId,
                  ...editingVoteDraft.selectedVoterIds,
                ].filter((playerId): playerId is string => Boolean(playerId)),
              ),
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
    const roleNoteGroups = new Map<string, Note[]>();
    notes
      .filter((note) => note.kind === "role_intel")
      .forEach((note) => {
        const key = note.roleId ? normalizeRoleId(note.roleId) : `note:${note.id}`;
        const current = roleNoteGroups.get(key) ?? [];
        current.push(note);
        roleNoteGroups.set(key, current);
      });

    const completedDayResultItems = phases
      .filter(
        (phase) =>
          phase.type === "day" && (phase.id !== effectiveSelectedPhaseId || gameResult.game?.status === "finished"),
      )
      .flatMap((phase) => {
        const phaseVoteRecords = voteRecords
          .filter((voteRecord) => voteRecord.phaseId === phase.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const executionNote = executionNoteByPhaseId.get(phase.id);

        if (executionNote) {
          return [];
        }

        const executedVoteRecord = phaseVoteRecords.find((voteRecord) => voteRecord.resultedInExecution);
        const createdAt =
          executedVoteRecord?.updatedAt ??
          executedVoteRecord?.createdAt ??
          phases.find((currentPhase) => currentPhase.number === phase.number + 1 && currentPhase.type === "night")?.createdAt ??
          phase.createdAt;

        if (executedVoteRecord) {
          return [];
        }

        if (phaseVoteRecords.length > 0) {
          return [];
        }

        return [
          {
            id: `day-result:${phase.id}`,
            createdAt,
            kind: "day_result" as const,
            phase,
            text: "Никого не казнили",
            linkedPlayerIds: [],
            className: "summary-day-result-badge",
          },
        ];
      });

    return [
      ...notes
        .filter((note) => note.kind !== "vote_history" && note.kind !== "role_intel")
        .map((note): SummaryItem =>
          note.kind === "execution"
            ? {
                id: note.id,
                createdAt: note.createdAt,
                kind: "execution",
                phase: phasesById.get(note.phaseId),
                note,
              }
            : {
                id: note.id,
                createdAt: note.createdAt,
                kind: "note",
                phase: phasesById.get(note.phaseId),
                note,
              },
        ),
      ...Array.from(roleNoteGroups.entries()).map(([groupKey, groupedNotes]) => {
        const sortedGroupNotes = [...groupedNotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        return {
          id: `role-group:${groupKey}`,
          createdAt: sortedGroupNotes[0]?.createdAt ?? "",
          kind: "role_group" as const,
          roleId: sortedGroupNotes[0]?.roleId,
          notes: sortedGroupNotes,
        };
      }),
      ...completedDayResultItems,
      ...voteRecords.map((voteRecord) => ({
        id: voteRecord.id,
        createdAt: voteRecord.createdAt,
        kind: "vote" as const,
        phase: phasesById.get(voteRecord.phaseId),
        voteRecord,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [notes, phases, phasesById, voteRecords, effectiveSelectedPhaseId, gameResult.game?.status, executionNoteByPhaseId, playersById]);

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
  const hasKnownMyTeam = Boolean(game.myTeam && game.myTeam !== "unknown");
  const personalResultClass =
    game.myTeam === "traveller"
      ? "border-amber-200/45 bg-amber-400/15 text-amber-100"
      : !hasKnownMyTeam || !game.winner || game.winner === "unknown"
        ? "border-stone-200/20 bg-stone-100/5 text-stone-200"
      : game.winner === game.myTeam
        ? "border-emerald-200/45 bg-emerald-400/15 text-emerald-100"
        : game.status === "finished"
          ? "border-red-200/45 bg-red-400/15 text-red-100"
          : "border-stone-200/20 bg-stone-100/5 text-stone-200";
  const gameHasStarted = game.hasStarted ?? Boolean(game.startedAt || effectiveSelectedPhaseId);
  const contentModalTitle =
    contentTab === "notes"
      ? "Заметки"
      : contentTab === "roleIntel"
        ? "Заметки по ролям"
        : contentTab === "reference"
          ? "Инфо"
          : contentTab === "summaryDeaths"
              ? "Смерти и казни"
              : contentTab === "summaryRoles"
                ? "Саммари"
                : "";
  const isDayPhase = !selectedPhase || selectedPhase.type === "day";
  const contentModalIsBottomSheet = contentTab === "summaryDeaths" || contentTab === "summaryRoles";
  const contentModalShellClass = isDayPhase
    ? "mt-3 w-full max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] rounded-t-3xl border border-amber-900/15 bg-[linear-gradient(180deg,rgba(255,251,244,0.99),rgba(246,232,208,0.99))] p-4 shadow-[0_24px_60px_rgba(76,48,22,0.2)] sm:mx-auto sm:mt-0 sm:max-h-[92vh] sm:max-w-6xl sm:rounded-3xl sm:p-6"
    : "mt-3 w-full max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:mt-0 sm:max-h-[92vh] sm:max-w-6xl sm:rounded-3xl sm:p-6";
  const renderSummaryNoteText = (text: string) => {
    if (!roleMentionRegex) {
      return <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-100">{text}</p>;
    }

    const lines = text.split("\n");

    return (
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-100">
        {lines.map((line, lineIndex) => (
          <Fragment key={`${lineIndex}-${line}`}>
            {line.split(roleMentionRegex).map((part, partIndex) => {
              const roleId = roleMentionMap.get(part);

              if (!roleId) {
                return <Fragment key={`${lineIndex}-${partIndex}`}>{part}</Fragment>;
              }

              const roleLabel = getRoleLabel(roleId, roleReferenceRoles);

              return (
                <span
                  key={`${lineIndex}-${partIndex}-${normalizeRoleId(roleId)}`}
                  className="mx-0.5 inline-flex h-8 w-8 align-middle"
                  title={roleLabel}
                >
                  <RoleTokenImage
                    roleId={roleId}
                    roles={roleReferenceRoles}
                    className="h-8 w-8 overflow-hidden rounded-full border border-ember-200/20 bg-white/90 shadow-[0_4px_10px_rgba(0,0,0,0.12)]"
                    imageClassName="h-full w-full object-cover"
                    fallback={
                      <span className="inline-flex items-center rounded-full border border-ember-200/20 bg-black/10 px-2 py-1 text-xs">
                        {roleLabel}
                      </span>
                    }
                  />
                </span>
              );
            })}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </p>
    );
  };
  const isDeathOrExecutionSummaryItem = (item: SummaryItem) => {
    if (item.kind === "vote" || item.kind === "execution" || item.kind === "day_result") {
      return true;
    }

    if (item.kind === "role_group") {
      return false;
    }

    if (item.note.kind === "day_death") {
      return true;
    }

    const normalizedText = item.note.text.toLocaleLowerCase("ru-RU");
    return normalizedText.includes("умер") || normalizedText.includes("казн");
  };
  const summaryDeathItems = summaryItems.filter((item) => isDeathOrExecutionSummaryItem(item));
  const summaryInfoItems = summaryItems.filter((item) => !isDeathOrExecutionSummaryItem(item));
  const summaryRoleItems = summaryInfoItems.filter((item) => item.kind === "role_group");
  const summaryGeneralInfoItems = summaryInfoItems.filter((item) => item.kind !== "role_group");
  const getSummaryOutcomeBadge = (item: Extract<SummaryItem, { kind: "note" | "execution" }>) => {
    const normalizedText = item.note.text.trim().replace(/\.$/u, "");
    const lowerText = normalizedText.toLocaleLowerCase("ru-RU");
    const phaseLabel = item.phase
      ? `Результат ${item.phase.number} ${item.phase.type === "night" ? "ночи" : "дня"}`
      : "Результат";

    if (item.note.kind === "day_death") {
      const playerNames = item.note.linkedPlayerIds
        .map((playerId) => playersById.get(playerId)?.name)
        .filter((name): name is string => Boolean(name));

      return {
        label: item.note.roleId ? getRoleLabel(item.note.roleId, dayDeathRoles) : "Дневная смерть",
        text: buildDayDeathSummaryText(playerNames),
        className: "border-rose-300/55 bg-rose-200/88 text-rose-950",
      };
    }

    if (item.kind === "execution") {
      return {
        label: phaseLabel,
        text: normalizedText.replace(/^Казнь без номинации:\s*/u, "Казнили без номинации: "),
        className: "summary-day-result-badge",
      };
    }

    if (item.phase?.type === "night") {
      return lowerText.includes("никто не умер")
        ? {
            label: phaseLabel,
            text: "никто не умер",
            className: "border-stone-300/80 bg-stone-300 text-stone-900",
          }
        : {
            label: phaseLabel,
            text: normalizedText,
            className: "border-rose-400/80 bg-rose-500 text-white",
          };
    }

    return null;
  };
  const dayDeathModalPlayers = players.filter(
    (player) => player.alive || dayDeathPlayerIds.includes(player.id),
  );
  const executionPromptVoteRecord = executionFinishPromptVoteRecordId
    ? selectedPhaseVoteRecords.find((voteRecord) => voteRecord.id === executionFinishPromptVoteRecordId)
    : undefined;
  const executionPromptNominee = executionPromptVoteRecord
    ? playersById.get(executionPromptVoteRecord.nomineePlayerId)
    : undefined;
  const selectedPhaseVoteItems = selectedPhaseVoteAnalysesDesc.map((analysis) => ({
    id: analysis.voteRecord.id,
    createdAt: analysis.voteRecord.createdAt,
    kind: "vote" as const,
    phase: selectedPhase,
    voteRecord: analysis.voteRecord,
    analysis,
  }));
  const renderSummaryItem = (item: SummaryItem) => {
    if (item.kind === "vote") {
      const voteRecord = item.voteRecord;
      const isEditingVote = editingVoteRecordId === voteRecord.id;
      const nominatorName = playersById.get(voteRecord.nominatorPlayerId)?.name ?? "Неизвестно";
      const nomineeName = playersById.get(voteRecord.nomineePlayerId)?.name ?? "Неизвестно";
      const phaseVoteRecords = voteRecords
        .filter((currentVoteRecord) => currentVoteRecord.phaseId === voteRecord.phaseId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const voterNames = voteRecord.voterPlayerIds
        .map((playerId) => playersById.get(playerId)?.name)
        .filter((name): name is string => Boolean(name));
      const voteOutcomeText = voteRecord.resultedInExecution
        ? voteRecord.executedPlayerDied === false
          ? buildExecutionSurvivalSummaryText(nomineeName)
          : `${resolveVoteType(voteRecord) === "traveller_exile" ? "Изгнали" : "Казнили"}: ${nomineeName}`
        : null;
      const showNoExecutionBadge =
        !voteOutcomeText &&
        item.phase?.type === "day" &&
        (voteRecord.phaseId !== effectiveSelectedPhaseId || game.status === "finished") &&
        !executionNoteByPhaseId.get(voteRecord.phaseId) &&
        phaseVoteRecords.length > 0 &&
        phaseVoteRecords[phaseVoteRecords.length - 1]?.id === voteRecord.id &&
        !phaseVoteRecords.some((currentVoteRecord) => currentVoteRecord.resultedInExecution);
      const voteHeaderBadgeText = voteOutcomeText ?? (showNoExecutionBadge ? "Никого не казнили" : null);
      const voteProtectionRoleLabel =
        voteRecord.resultedInExecution && voteRecord.executedPlayerDied === false && voteRecord.executionProtectionRoleId
          ? getRoleLabel(voteRecord.executionProtectionRoleId, executionProtectionRoles)
          : "";
      const voteHeaderBadgeClass =
        voteRecord.resultedInExecution && voteRecord.executedPlayerDied === false
          ? "border-sky-300/65 bg-sky-200/85 text-sky-950"
          : "summary-day-result-badge";

      return (
        <article key={item.id} className="summary-day-card rounded-2xl border border-ember-200/12 bg-black/18 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-stone-100">
                    {item.phase?.title ?? "Дневная фаза"}
                  </h3>
                  {voteHeaderBadgeText ? (
                    <span className={`inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold leading-5 ${voteHeaderBadgeClass}`}>
                      <span>{voteHeaderBadgeText}</span>
                    </span>
                  ) : null}
                  {voteProtectionRoleLabel ? (
                    <span className="chip">{voteProtectionRoleLabel}</span>
                  ) : null}
                </div>
                <p className="text-xs text-stone-500">
                  {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => startEditingVoteRecord(voteRecord)} className="secondary-button min-h-10 px-3">
                <img src="/button-icons/pencil.svg" alt="" aria-hidden="true" className="h-5 w-5" />
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
            <div className="mt-3 rounded-2xl bg-black/10 px-3 py-2 text-sm text-stone-200">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <p className="font-medium">{`${nominatorName} -> ${nomineeName}`}</p>
                <div className="flex min-w-0 max-w-full items-start gap-2 text-xs sm:text-sm">
                  <span className="font-semibold">{voteRecord.voterPlayerIds.length}</span>
                  <img src="/button-icons/hand.svg" alt="" aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <p className="min-w-0 break-words whitespace-normal">
                    {voterNames.length > 0 ? voterNames.join(", ") : "никто"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </article>
      );
    }

    if (item.kind === "day_result") {
      const linkedPlayers = item.linkedPlayerIds
        .map((playerId) => playersById.get(playerId))
        .filter((player): player is Player => Boolean(player));

      return (
        <article key={item.id} className="summary-day-card rounded-2xl border border-ember-200/12 bg-black/18 p-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-stone-100">{item.phase.title}</h3>
              <span className={`inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold leading-5 ${item.className}`}>
                <span>{item.text}</span>
              </span>
            </div>
            <p className="text-xs text-stone-500">
              {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
            </p>
          </div>

          {linkedPlayers.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {linkedPlayers.map((player) => (
                <span key={player.id} className="chip">
                  {player.name}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      );
    }

    if (item.kind === "role_group") {
      const roleLabel = item.roleId
        ? getRoleLabel(item.roleId, roleReferenceRoles)
        : "Роль не указана";

      return (
        <article key={item.id} className="rounded-2xl border border-ember-200/12 bg-black/18 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {item.roleId ? (
                <RoleTokenImage
                  roleId={item.roleId}
                  roles={roleReferenceRoles}
                  className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-ember-200/20 bg-white/90"
                  imageClassName="h-full w-full object-cover"
                />
              ) : null}
              <div>
                <h3 className="text-sm font-semibold text-stone-100">{roleLabel}</h3>
                <p className="text-xs text-stone-500">
                  {item.notes.length} {item.notes.length === 1 ? "заметка" : item.notes.length >= 2 && item.notes.length <= 4 ? "заметки" : "заметок"} по роли
                </p>
              </div>
            </div>
            <p className="text-xs text-stone-500">
              {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
            </p>
          </div>

          <div className="mt-3 space-y-3">
            {item.notes.map((note) => {
              const linkedPlayers = note.linkedPlayerIds
                .map((playerId) => playersById.get(playerId))
                .filter((player): player is Player => Boolean(player));
              const isEditingNote = editingNoteId === note.id;

              return (
                <div key={note.id} className="rounded-2xl border border-ember-200/10 bg-black/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-stone-100">
                        {phasesById.get(note.phaseId)?.title ?? "История"}
                      </h4>
                      <p className="text-xs text-stone-500">
                        {formatDate(note.createdAt)} · {formatTime(note.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEditingHistoryNote(note)}
                        className="secondary-button min-h-10 px-3"
                      >
                        <img src="/button-icons/pencil.svg" alt="" aria-hidden="true" className="h-5 w-5" />
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
                      {renderSummaryNoteText(note.text)}
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
                </div>
              );
            })}
          </div>
        </article>
      );
    }

    const note = item.note;
    const linkedPlayers = note.linkedPlayerIds
      .map((playerId) => playersById.get(playerId))
      .filter((player): player is Player => Boolean(player));
    const isEditingNote = editingNoteId === note.id;
    const outcomeBadge = getSummaryOutcomeBadge(item);
    const noteCardClass =
      item.phase?.type === "night"
        ? "summary-night-card"
        : (outcomeBadge || note.kind === "day_death") && item.phase?.type === "day"
          ? "summary-day-card"
          : "";

    return (
      <article key={item.id} className={`rounded-2xl border border-ember-200/12 bg-black/18 p-3 ${noteCardClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-stone-100">
                {item.kind === "execution" ? "Казнь" : item.phase?.title ?? "История"}
              </h3>
              {outcomeBadge ? (
                <span className={`inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold leading-5 ${outcomeBadge.className}`}>
                  <span>{outcomeBadge.label}</span>
                  <span className="opacity-70">•</span>
                  <span>{outcomeBadge.text}</span>
                </span>
              ) : null}
            </div>
            <p className="text-xs text-stone-500">
              {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (note.kind === "day_death") {
                  openDayDeathModal(note);
                  return;
                }

                if (item.kind === "execution") {
                  openExecutionWithoutNominationModal(note.phaseId, note);
                  return;
                }

                startEditingHistoryNote(note);
              }}
              className="secondary-button min-h-10 px-3"
            >
              <img src="/button-icons/pencil.svg" alt="" aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => void (note.kind === "day_death" ? deleteDayDeathNote(note) : deleteNote(note.id))}
              className="danger-button"
            >
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
            {outcomeBadge ? null : (
              renderSummaryNoteText(note.text)
            )}
            {linkedPlayers.length > 0 || !outcomeBadge ? (
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
            ) : null}
          </>
        )}
      </article>
    );
  };

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

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={openFinishForm} className="secondary-button w-full sm:w-auto">
              <CheckCircle2 className="h-4 w-4" />
              {game.status === "finished" ? "Итог партии" : "Завершить партию"}
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

              <div
                className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${
                  game.status === "finished" ? "xl:grid-cols-3" : "xl:grid-cols-2"
                }`}
              >
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
              </div>

              <div className="rounded-2xl border border-ember-200/10 bg-black/10 p-3">
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setTravellerFormOpen(true)}
                    className="secondary-button min-h-12 min-w-12 px-3"
                    aria-label="Добавить Traveller"
                    title="Добавить Traveller"
                  >
                    <img src="/token-images/Travellers.png" alt="" className="h-9 w-9 object-contain" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSpecialFormRoleType("fabled");
                      setSpecialFormOpen(true);
                    }}
                    className="secondary-button min-h-12 min-w-12 px-3"
                    aria-label="Добавить Fabled"
                    title="Добавить Fabled"
                  >
                    <img src="/token-images/Fabled.png" alt="" className="h-9 w-9 object-contain" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSpecialFormRoleType("loric");
                      setSpecialFormOpen(true);
                    }}
                    className="secondary-button min-h-12 min-w-12 px-3"
                    aria-label="Добавить Loric"
                    title="Добавить Loric"
                  >
                    <img src="/token-images/Loric.png" alt="" className="h-9 w-9 object-contain" />
                  </button>
                </div>
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
          <div className="min-w-0 space-y-4 sm:space-y-5">
            <section className="panel p-2 sm:p-3">
              <div className="flex flex-wrap gap-2">
                {!gameHasStarted ? (
                  <button type="button" onClick={startGame} className="primary-button min-h-10 px-3 whitespace-nowrap">
                    <Play className="h-4 w-4" />
                    Начать игру
                  </button>
                ) : !selectedPhase ? (
                  <button type="button" disabled className="secondary-button min-h-10 px-3 whitespace-nowrap opacity-60">
                    Фаза не найдена
                  </button>
                ) : selectedPhase.type === "night" ? (
                  <button
                    type="button"
                    onClick={openNightResultModal}
                    className="primary-button min-h-10 w-12 shrink-0 px-0"
                    aria-label={`Открыть результат ${selectedPhase.number} ночи`}
                    title={`Результат ${selectedPhase.number} ночи`}
                  >
                    <span className="relative inline-flex h-6 w-6 items-center justify-center">
                      <SunMedium className="h-5 w-5" />
                      <span className="absolute right-[-4px] top-[-4px] inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-ink-900 px-[2px] text-[9px] font-bold leading-none text-amber-50">
                        {selectedPhase.number}
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void advanceToNextPhase("day_to_night")}
                    className="secondary-button min-h-10 w-12 shrink-0 px-0"
                    aria-label={`Перейти в ${selectedPhase.number + 1} ночь`}
                    title={`${selectedPhase.number + 1} ночь`}
                  >
                    <span className="relative inline-flex h-6 w-6 items-center justify-center">
                      <MoonStar className="h-5 w-5" />
                      <span className="absolute right-[-4px] top-[-4px] inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-ink-900 px-[2px] text-[9px] font-bold leading-none text-amber-50">
                        {selectedPhase.number + 1}
                      </span>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openContentModal("roleIntel")}
                  className={contentTab === "roleIntel" ? "primary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0" : "secondary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"}
                  title="По ролям"
                  aria-label="По ролям"
                >
                  <img src="/button-icons/add.svg" alt="" aria-hidden="true" className="h-5 w-5" />
                </button>
                {gameHasStarted && selectedPhase?.type === "day" ? (
                  <button
                    type="button"
                    onClick={() => beginVoteDraft("execution")}
                    className={voteDraft?.voteType === "execution" ? "primary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0" : "secondary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"}
                  title="Номинация"
                  aria-label="Номинация"
                  >
                    <img src="/button-icons/hand.svg" alt="" aria-hidden="true" className="h-5 w-5" />
                  </button>
                ) : null}
                {gameHasStarted && selectedPhase?.type === "day" && players.some((player) => player.isTraveller) ? (
                  <button
                    type="button"
                    onClick={() => beginVoteDraft("traveller_exile")}
                    className={voteDraft?.voteType === "traveller_exile" ? "primary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0" : "secondary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"}
                  title="Изгнание Traveller"
                  aria-label="Изгнание Traveller"
                  >
                    <img src="/button-icons/door-open.svg" alt="" aria-hidden="true" className="h-6 w-6" />
                  </button>
                ) : null}
                {gameHasStarted && selectedPhase?.type === "day" ? (
                  <button
                    type="button"
                    onClick={() => openExecutionWithoutNominationModal()}
                    className={executionModalOpen || selectedPhaseExecutionNote ? "primary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0" : "secondary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"}
                  title="Казнь без номинации"
                  aria-label="Казнь без номинации"
                  >
                    <span className="relative inline-flex h-10 w-6 items-center justify-center">
                      <img src="/button-icons/guillotine.svg" alt="" aria-hidden="true" className="h-6 w-6" />
                      <img src="/button-icons/lightning.svg" alt="" aria-hidden="true" className="absolute right-[-4px] top-[-5px] h-11 w-11" />
                    </span>
                  </button>
                ) : null}
                {gameHasStarted && selectedPhase?.type === "day" ? (
                  <button
                    type="button"
                    onClick={() => openDayDeathModal()}
                    className={dayDeathModalOpen ? "primary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0" : "secondary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"}
                  title="Человек умер"
                  aria-label="Человек умер"
                  >
                    <img src="/button-icons/knife.svg" alt="" aria-hidden="true" className="h-5 w-5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => openContentModal("reference")}
                  className={contentTab === "reference" ? "primary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0" : "secondary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"}
                  title="Роли"
                  aria-label="Роли"
                >
                  <img src="/button-icons/info.svg" alt="" aria-hidden="true" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => openContentModal("summaryDeaths")}
                  className={contentTab === "summaryDeaths" ? "primary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0" : "secondary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"}
                  title="Смерти и казни"
                  aria-label="Смерти и казни"
                  >
                  <img src="/button-icons/skull.svg" alt="" aria-hidden="true" className="h-6 w-6" />
                  </button>
                <button
                  type="button"
                  onClick={() => openContentModal("summaryRoles")}
                  className={contentTab === "summaryRoles" ? "primary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0" : "secondary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"}
                  title="Сводка ролей"
                  aria-label="Сводка ролей"
                >
                  <img src="/button-icons/interaction.svg" alt="" aria-hidden="true" className="h-5 w-5" />
                </button>
                </div>
            </section>
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
              voteRequirementSummary={voteRequirementSummary}
              currentBlockPlayerId={currentBlockPlayerId}
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
              specialFormOpen={specialFormOpen}
              specialFormRoleType={specialFormRoleType}
              onCloseSpecialForm={() => setSpecialFormOpen(false)}
              travellerFormOpen={travellerFormOpen}
              onCloseTravellerForm={() => setTravellerFormOpen(false)}
              onPlayerClick={(player) => setSelectedPlayerId(player.id)}
            />
            {gameHasStarted && selectedPhase?.type === "day" ? (
              <section className="panel p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-stone-50">Сегодняшние номинации</h2>
              </div>
                  {selectedPhaseExecutionNote ? (
                    <span className="summary-day-result-badge inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold leading-5">
                              <img src="/button-icons/guillotine.svg" alt="" aria-hidden="true" className="h-4 w-4" />
                      Казнь без номинации отмечена
                    </span>
                  ) : null}
                </div>

                {voteDraft ? (
                  <div className="mt-4 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:p-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="chip">
                        {voteDraft.voteType === "traveller_exile" ? "Изгнание Traveller" : "Номинация"}
                      </span>
                      {voteDraft.nominatorPlayerId ? (
                        <span className="chip">Номинировал: {playersById.get(voteDraft.nominatorPlayerId)?.name ?? "?"}</span>
                      ) : null}
                      {voteDraft.nomineePlayerId ? (
                        <span className="chip">Номинирован: {playersById.get(voteDraft.nomineePlayerId)?.name ?? "?"}</span>
                      ) : null}
                      {voteDraft.stage === "select_voters" ? (
                        <span className="chip">Голосов отмечено: {voteDraft.selectedVoterIds.length}</span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-300">
                      {voteDraft.stage === "select_nominator"
                        ? voteDraft.voteType === "traveller_exile"
                          ? "На круге выберите игрока, который номинировал изгнание Traveller."
                          : "На круге выберите игрока, который номинировал."
                        : voteDraft.stage === "select_nominee"
                          ? voteDraft.voteType === "traveller_exile"
                            ? "Теперь выберите Traveller, которого изгоняют."
                            : "Теперь выберите игрока, которого номинировали."
                          : "На круге отметьте всех, кто голосовал, затем сохраните результат."}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  {selectedPhaseExecutionNote ? (
                    <article className="summary-day-card rounded-2xl border border-ember-200/12 bg-black/18 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-stone-100">{selectedPhase.title}</h3>
                            <span className="summary-day-result-badge inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold leading-5">
                              <img src="/button-icons/guillotine.svg" alt="" aria-hidden="true" className="h-4 w-4" />
                              <span>{selectedPhaseExecutionNote.text}</span>
                            </span>
                          </div>
                          <p className="text-xs text-stone-500">
                            {formatDate(selectedPhaseExecutionNote.createdAt)} · {formatTime(selectedPhaseExecutionNote.createdAt)}
                          </p>
                        </div>
                        <button type="button" onClick={() => openExecutionWithoutNominationModal(selectedPhase.id, selectedPhaseExecutionNote)} className="secondary-button min-h-10 px-3">
                          <img src="/button-icons/pencil.svg" alt="" aria-hidden="true" className="h-5 w-5" />
                        </button>
                      </div>
                    </article>
                  ) : null}

                  {selectedPhaseVoteItems.length === 0 ? (
                    !selectedPhaseExecutionNote ? (
                      <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                        Сегодня ещё нет номинаций.
                      </div>
                    ) : null
                  ) : (
                    selectedPhaseVoteItems.map((item) => {
                      const nominatorName = playersById.get(item.voteRecord.nominatorPlayerId)?.name ?? "Неизвестно";
                      const nomineeName = playersById.get(item.voteRecord.nomineePlayerId)?.name ?? "Неизвестно";
                      const voterNames = item.voteRecord.voterPlayerIds
                        .map((playerId) => playersById.get(playerId)?.name)
                        .filter((name): name is string => Boolean(name));

                      return (
                        <article key={item.id} className="summary-day-card relative rounded-2xl border border-ember-200/12 bg-black/18 p-3">
                          <div className="pr-32">
                            <div className="flex flex-wrap items-center gap-2">
                              {item.analysis?.voteType === "traveller_exile" ? (
                                <h3 className="text-sm font-semibold text-stone-100">Изгнание Traveller</h3>
                              ) : null}
                              {item.analysis ? <span className="chip">{item.analysis.statusLabel}</span> : null}
                              {item.voteRecord.resultedInExecution ? (
                                <span className="summary-day-result-badge inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold leading-5">
                                  <img src="/button-icons/guillotine.svg" alt="" aria-hidden="true" className="h-4 w-4" />
                                  <span>{item.voteRecord.executedPlayerDied === false ? "Казнь пережита" : "Казнь отмечена"}</span>
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-stone-500">
                              {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
                            </p>
                          </div>
                          <div className="absolute right-3 top-3 flex flex-wrap gap-2">
                            {item.analysis?.voteType !== "traveller_exile" ? (
                              <button type="button" onClick={() => void promptVoteRecordExecution(item.voteRecord.id)} className={item.voteRecord.resultedInExecution ? "primary-button min-h-10 px-3" : "secondary-button min-h-10 px-3"}>
                                <img src="/button-icons/guillotine.svg" alt="" aria-hidden="true" className="h-6 w-6" />
                              </button>
                            ) : null}
                            <button type="button" onClick={() => startEditingVoteRecord(item.voteRecord)} className="secondary-button min-h-10 px-3">
                              <img src="/button-icons/pencil.svg" alt="" aria-hidden="true" className="h-5 w-5" />
                            </button>
                            <button type="button" onClick={() => void deleteVoteRecord(item.voteRecord)} className="danger-button">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="mt-3 rounded-2xl bg-black/10 px-3 py-2 text-sm text-stone-200">
                            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                              <p className="font-medium">{`${nominatorName} -> ${nomineeName}`}</p>
                              <div className="flex min-w-0 max-w-full items-start gap-2 text-xs sm:text-sm">
                                <span className="font-semibold">{item.voteRecord.voterPlayerIds.length}</span>
                                <img src="/button-icons/hand.svg" alt="" aria-hidden="true" className="h-4 w-4 shrink-0" />
                                <p className="min-w-0 break-words whitespace-normal">{voterNames.length > 0 ? voterNames.join(", ") : "никто"}</p>
                              </div>
                            </div>
                            {item.analysis ? (
                              <p className="mt-2 text-xs text-stone-400">{item.analysis.prognosisLabel}</p>
                            ) : null}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            ) : null}
          </div>

          <div className="min-w-0">
            {contentTab ? (
              <div
                className={`fixed inset-0 z-[60] flex overflow-y-auto bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6 ${
                  contentModalIsBottomSheet
                    ? "items-end pt-[calc(0.75rem+env(safe-area-inset-top))] pb-0"
                    : "items-start pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]"
                }`}
                onClick={closeContentModal}
              >
                <section
                  className={contentModalShellClass}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-stone-400">{selectedPhase?.title ?? "Партия"}</p>
                      <h2 className="text-2xl font-bold text-stone-50">{contentModalTitle}</h2>
                    </div>
                    <button type="button" onClick={closeContentModal} className="secondary-button px-3">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="max-h-[calc(100dvh-9rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto pr-0 sm:max-h-[84vh] sm:pr-1">
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
            {contentTab === "reference" ? (
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
            {contentTab === "summaryDeaths" ? (
              <section className="panel min-w-0 p-3 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-stone-50">Смерти и казни</h2>
                </div>

                {summaryItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                    История пока пустая.
                  </div>
                ) : (
                    <section className="space-y-3">
                      {summaryDeathItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                          Пока нет событий казней и смертей.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {summaryDeathItems.map((item) => renderSummaryItem(item))}
                        </div>
                      )}
                    </section>
                )}
              </section>
            ) : null}
            {contentTab === "summaryRoles" ? (
              <section className="panel min-w-0 p-3 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-stone-50">Сводка ролей</h2>
                </div>

                {summaryItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                    История пока пустая.
                  </div>
                ) : (
                  <section className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-semibold text-stone-100">Информация по ролям</h3>
                        <p className="text-sm text-stone-400">Ролевые заметки, сгруппированные по ролям.</p>
                      </div>

                      {summaryRoleItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                          Пока нет ролевой информации.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {summaryRoleItems.map((item) => renderSummaryItem(item))}
                        </div>
                      )}
                    </div>

                    {summaryGeneralInfoItems.length > 0 ? (
                      <div className="space-y-3">
                        <div>
                          <h3 className="text-base font-semibold text-stone-100">Прочие заметки</h3>
                          <p className="text-sm text-stone-400">Обычные информационные записи без привязки к роли.</p>
                        </div>
                        <div className="space-y-3">
                          {summaryGeneralInfoItems.map((item) => renderSummaryItem(item))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                )}
              </section>
            ) : null}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <PlayerDetailModal
        player={selectedPlayer}
        isMyToken={Boolean(selectedPlayer && effectiveMyPlayerId === selectedPlayer.id)}
        myTokenLocked={Boolean(selectedPlayer && effectiveMyPlayerId && effectiveMyPlayerId !== selectedPlayer.id)}
        myTeam={selectedPlayer && effectiveMyPlayerId === selectedPlayer.id ? game.myTeam : undefined}
        notes={notes}
        players={players}
        phases={phases}
        currentPhase={selectedPhase}
        scriptRoles={game.scriptRoles}
        onClose={() => setSelectedPlayerId(null)}
        onSave={savePlayer}
        onAddNote={addNoteToPhase}
        onDeleteTraveller={deleteTraveller}
        onDeleteNote={deleteNote}
        onUpdateNote={updateNote}
      />

      {nightResultModalOpen && selectedPhase?.type === "night" ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/55 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6" onClick={closeNightResultModal}>
          <section className="w-full rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:max-w-2xl sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-50">Результат ночи</h2>
                <p className="mt-1 text-sm text-stone-200">
                  Выберите всех игроков, которые умерли этой ночью. Можно никого не выбирать.
                </p>
              </div>
              <button type="button" onClick={closeNightResultModal} className="secondary-button px-3" disabled={nightResultSaving}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-ember-200/12 bg-black/15 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-stone-100">
                  Умерли ночью: {nightDeathPlayerIds.length > 0 ? nightDeathPlayerIds.length : "никто"}
                </p>
                <button
                  type="button"
                  onClick={() => setNightDeathPlayerIds([])}
                  className="secondary-button min-h-9 px-3 text-sm"
                  disabled={nightResultSaving}
                >
                  Никто не умер
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {players.filter((player) => player.alive).length === 0 ? (
                  <p className="text-sm text-stone-400">Живых игроков не осталось.</p>
                ) : (
                  nightResultModalPlayers.map((player) => {
                      const selected = nightDeathPlayerIds.includes(player.id);

                      return (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => toggleNightDeathPlayer(player.id)}
                          className={
                            selected
                              ? "role-player-selected inline-flex min-h-10 items-center rounded-full border px-3 py-2 text-sm font-medium"
                              : "secondary-button min-h-10 px-3 py-2 text-sm"
                          }
                          aria-pressed={selected}
                          disabled={nightResultSaving}
                        >
                          {player.name}
                        </button>
                      );
                    })
                )}
              </div>
            </div>

            {pageError ? <p className="mt-3 text-sm text-rose-300">{pageError}</p> : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeNightResultModal} className="secondary-button px-4" disabled={nightResultSaving}>
                Отмена
              </button>
              <button type="button" onClick={() => void saveNightResult()} className="primary-button" disabled={nightResultSaving}>
                <CheckCircle2 className="h-4 w-4" />
                {nightResultSaving ? "Сохраняем..." : "Перейти в день"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {dayDeathModalOpen && phasesById.get(dayDeathPhaseId ?? selectedPhase?.id ?? "")?.type === "day" ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/55 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6" onClick={closeDayDeathModal}>
          <section className="day-death-modal w-full rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:max-w-4xl sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-50">
                  {dayDeathEditingNoteId ? "Изменить дневную смерть" : "Человек умер"}
                </h2>
                <p className="mt-1 text-sm text-stone-200">
                  Выберите всех игроков, которые умерли днём, и роль, по которой это могло произойти.
                </p>
              </div>
              <button type="button" onClick={closeDayDeathModal} className="secondary-button px-3">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-ember-200/12 bg-black/15 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-stone-100">
                    Умерли днём: {dayDeathPlayerIds.length > 0 ? dayDeathPlayerIds.length : "никто не выбран"}
                  </p>
                  {dayDeathPlayerIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setDayDeathPlayerIds([])}
                      className="secondary-button min-h-9 px-3 text-sm"
                    >
                      Сбросить выбор
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {dayDeathModalPlayers.length === 0 ? (
                    <p className="text-sm text-stone-400">Нет доступных игроков для выбора.</p>
                  ) : (
                    dayDeathModalPlayers.map((player) => {
                      const selected = dayDeathPlayerIds.includes(player.id);

                      return (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => toggleDayDeathPlayer(player.id)}
                          className={
                            selected
                              ? "role-player-selected inline-flex min-h-10 items-center rounded-full border px-3 py-2 text-sm font-medium"
                              : "secondary-button min-h-10 px-3 py-2 text-sm"
                          }
                          aria-pressed={selected}
                        >
                          {player.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-ember-200/12 bg-black/15 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-stone-100">По какой роли это могло произойти?</p>
                  {dayDeathRoleId ? (
                    <span className="chip">{getRoleLabel(dayDeathRoleId, dayDeathRoles)}</span>
                  ) : null}
                </div>

                {dayDeathRoleGroups.length === 0 ? (
                  <p className="mt-3 text-sm text-stone-400">
                    В текущем сценарии не найдено ролей со смертью днём.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {dayDeathRoles.map((role) => {
                      const selected = dayDeathRoleId === role.id;
                      const roleLabel = getRoleLabel(role.id, dayDeathRoles);

                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => setDayDeathRoleId((current) => (current === role.id ? "" : role.id))}
                          title={roleLabel}
                          className={
                            selected
                              ? "role-icon-selected inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/5"
                              : "inline-flex h-11 w-11 items-center justify-center rounded-full bg-transparent hover:bg-black/5"
                          }
                          aria-pressed={selected}
                        >
                          <RoleTokenImage
                            roleId={role.id}
                            roles={dayDeathRoles}
                            className="h-9 w-9 overflow-hidden rounded-full border-0 bg-transparent shadow-none"
                            imageClassName="h-full w-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {pageError ? <p className="mt-3 text-sm text-rose-300">{pageError}</p> : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeDayDeathModal} className="secondary-button px-4">
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void saveDayDeathResult()}
                className="primary-button"
                disabled={dayDeathSaving || dayDeathPlayerIds.length === 0 || !dayDeathRoleId}
              >
                <Save className="h-4 w-4" />
                {dayDeathSaving ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {executionFinishPromptVoteRecordId && selectedPhase?.type === "day" ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/55 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6" onClick={closeExecutionFinishPrompt}>
          <section className="execution-finish-prompt-modal w-full rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:max-w-3xl sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-50">Результат казни</h2>
                <p className="mt-1 text-sm text-stone-200">
                  Выберите, умер ли игрок по казни, или казнь состоялась, но он остался жить.
                </p>
              </div>
              <button
                type="button"
                onClick={closeExecutionFinishPrompt}
                className="secondary-button px-3"
                disabled={executionFinishPromptSaving}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {executionPromptNominee ? (
              <div className="mt-4 rounded-2xl border border-ember-200/12 bg-black/15 px-4 py-3 text-sm text-stone-100">
                Номинирован: <span className="font-semibold">{executionPromptNominee.name}</span>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExecutionFinishPromptOutcome("died")}
                className={
                  executionFinishPromptOutcome === "died"
                    ? "primary-button min-h-10 px-4"
                    : "secondary-button min-h-10 px-4"
                }
                disabled={executionFinishPromptSaving}
              >
                <Skull className="h-4 w-4" />
                Умер по казни
              </button>
              <button
                type="button"
                onClick={() => setExecutionFinishPromptOutcome("survived")}
                className={
                  executionFinishPromptOutcome === "survived"
                    ? "primary-button min-h-10 px-4"
                    : "secondary-button min-h-10 px-4"
                }
                disabled={executionFinishPromptSaving}
              >
                <CheckCircle2 className="h-4 w-4" />
                Остался жить
              </button>
            </div>

            {executionFinishPromptOutcome === "survived" ? (
              <div className="mt-4 rounded-2xl border border-ember-200/12 bg-black/15 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-stone-100">Почему игрок пережил казнь?</p>
                  {executionFinishPromptProtectionRoleId ? (
                    <span className="chip">{getRoleLabel(executionFinishPromptProtectionRoleId, executionProtectionRoles)}</span>
                  ) : null}
                </div>
                {executionProtectionRoleGroups.length === 0 ? (
                  <p className="mt-3 text-sm text-stone-400">В текущем сценарии не найдено ролей, которые могут спасти от казни.</p>
                ) : (
                  <RoleIconGrid
                    groups={executionProtectionRoleGroups}
                    roles={executionProtectionRoles}
                    selectedRoleId={executionFinishPromptProtectionRoleId}
                    onSelect={(roleId) =>
                      setExecutionFinishPromptProtectionRoleId((current) => (current === roleId ? "" : roleId))
                    }
                    className="mt-3 space-y-2"
                    groupClassName="rounded-2xl border border-ember-200/10 bg-black/10 p-2.5"
                    columnsClassName="grid-cols-4 gap-1.5 sm:grid-cols-5 md:grid-cols-6"
                    buttonClassName="rounded-xl p-1"
                    iconClassName="h-10 w-10 sm:h-10 sm:w-10"
                    showGroupLabel={false}
                  />
                )}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeExecutionFinishPrompt}
                className="secondary-button px-4"
                disabled={executionFinishPromptSaving}
              >
                Отмена
              </button>
              {executionFinishPromptOutcome === "died" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void confirmVoteRecordExecution(false)}
                    className="secondary-button px-4"
                    disabled={executionFinishPromptSaving}
                  >
                    Сохранить и в ночь
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmVoteRecordExecution(true)}
                    className="primary-button"
                    disabled={executionFinishPromptSaving}
                  >
                    <Skull className="h-4 w-4" />
                    {executionFinishPromptSaving ? "Сохраняем..." : "Сохранить и завершить"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void confirmVoteRecordExecution(false)}
                  className="primary-button"
                  disabled={executionFinishPromptSaving}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {executionFinishPromptSaving ? "Сохраняем..." : "Сохранить и в ночь"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {executionModalOpen && phasesById.get(executionPhaseId ?? selectedPhase?.id ?? "")?.type === "day" ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/55 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6" onClick={closeExecutionWithoutNominationModal}>
          <section
            className="w-full rounded-t-3xl border border-amber-900/15 bg-[linear-gradient(180deg,rgba(255,251,244,0.99),rgba(246,232,208,0.99))] p-4 text-stone-900 shadow-[0_24px_60px_rgba(76,48,22,0.2)] sm:mx-auto sm:max-w-md sm:rounded-3xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Казнь без номинации</h2>
                <p className="mt-1 text-sm text-stone-600">Выберите, кто был казнён в этой дневной фазе.</p>
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
        <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setFinishOpen(false)}>
          <section
            className={`w-full rounded-t-3xl border p-4 shadow-2xl sm:mx-auto sm:max-w-xl sm:rounded-3xl sm:p-6 ${
              isDayPhase || !gameHasStarted
                ? "border-amber-700/16 bg-[#f7eddc] shadow-[0_22px_60px_rgba(60,44,20,0.18)]"
                : "border-ember-200/15 bg-ink-850"
            }`}
            onClick={(event) => event.stopPropagation()}
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
