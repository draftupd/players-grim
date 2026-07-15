import {
  ArrowLeft,
  CheckCircle2,
  Flag,
  MoonStar,
  Play,
  RotateCcw,
  Save,
  Settings,
  Skull,
  SunMedium,
  Trash2,
  UserRound,
  UserPlus,
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
  PlayerTeam,
  PlayerVoteAvailability,
  TravellerMechanicsState,
  TravellerVoteModifier,
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
  voteCount: weightedVoteCount,
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
  voteCount?: number;
  threshold: number;
  thresholdText: string;
}) => {
  const voteCount = weightedVoteCount ?? voterNames.length;
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

const STORYTELLER_EXECUTION_TARGET_ID = "__storyteller__";
const STORYTELLER_EXECUTION_TARGET_NAME = "Ведущий";
const MAX_REGULAR_PLAYERS = 15;

const resolveVoteType = (voteRecord: VoteRecord) => voteRecord.voteType ?? "execution";

const isStorytellerExecutionTarget = (playerId?: string) => playerId === STORYTELLER_EXECUTION_TARGET_ID;

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

type TravellerMechanicsForm = {
  beggarPlayerId: string;
  beggarDonorId: string;
  beggarDonorTeam: PlayerTeam;
  voteModifierRoleId: "bureaucrat" | "thief";
  voteModifierTravellerId: string;
  voteModifierTargetId: string;
  gunslingerTravellerId: string;
  gunslingerTargetId: string;
  judgePlayerId: string;
  judgeVoteRecordId: string;
  scapegoatPlayerId: string;
  scapegoatVoteRecordId: string;
  boneCollectorPlayerId: string;
  boneCollectorTargetId: string;
  baristaPlayerId: string;
  baristaTargetId: string;
  baristaMode: "sober_healthy_true_info" | "ability_twice";
  harlotPlayerId: string;
  harlotTargetId: string;
  harlotAccepted: boolean;
  harlotKillBoth: boolean;
  deviantPlayerId: string;
  apprenticePlayerId: string;
  apprenticeAbilityRoleId: string;
  apprenticeTeam: PlayerTeam;
  matronAPlayerId: string;
  matronBPlayerId: string;
  cacklejackPlayerId: string;
  cacklejackImmunePlayerId: string;
  cacklejackChangedPlayerId: string;
  cacklejackNewRoleId: string;
  gangsterPlayerId: string;
  gangsterTargetPlayerId: string;
  gangsterConsentPlayerId: string;
  gnomePlayerId: string;
  gnomeAmigoPlayerId: string;
  gnomeNominatorPlayerId: string;
};

const countVotesLabel = (count: number) =>
  `${count} ${count === 1 ? "голос" : count >= 2 && count <= 4 ? "голоса" : "голосов"}`;

const MY_TOKEN_REQUIRED_ERROR = "Перед началом игры выберите свой жетон на гримуаре и нажмите иконку человечка в карточке игрока.";

const DAY_DEATH_ROLE_IDS = new Set([
  "boomdandy",
  "cerenovus",
  "daoke",
  "doomsayer",
  "gnome",
  "golem",
  "gunslinger",
  "gangster",
  "harpy",
  "harlot",
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

const TRAVELLER_MECHANIC_ROLE_IDS = new Set([
  "apprentice",
  "barista",
  "beggar",
  "bishop",
  "bonecollector",
  "bureaucrat",
  "butcher",
  "cacklejack",
  "deviant",
  "gangster",
  "gnome",
  "gunslinger",
  "harlot",
  "judge",
  "matron",
  "scapegoat",
  "thief",
  "voudon",
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
  const [playerFormOpen, setPlayerFormOpen] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [playerFormSaving, setPlayerFormSaving] = useState(false);
  const [travellerMechanicsOpen, setTravellerMechanicsOpen] = useState(false);
  const [travellerMechanicsSaving, setTravellerMechanicsSaving] = useState(false);
  const [travellerMechanicsForm, setTravellerMechanicsForm] = useState<TravellerMechanicsForm>({
    beggarPlayerId: "",
    beggarDonorId: "",
    beggarDonorTeam: "unknown",
    voteModifierRoleId: "bureaucrat",
    voteModifierTravellerId: "",
    voteModifierTargetId: "",
    gunslingerTravellerId: "",
    gunslingerTargetId: "",
    judgePlayerId: "",
    judgeVoteRecordId: "",
    scapegoatPlayerId: "",
    scapegoatVoteRecordId: "",
    boneCollectorPlayerId: "",
    boneCollectorTargetId: "",
    baristaPlayerId: "",
    baristaTargetId: "",
    baristaMode: "sober_healthy_true_info",
    harlotPlayerId: "",
    harlotTargetId: "",
    harlotAccepted: false,
    harlotKillBoth: false,
    deviantPlayerId: "",
    apprenticePlayerId: "",
    apprenticeAbilityRoleId: "",
    apprenticeTeam: "unknown",
    matronAPlayerId: "",
    matronBPlayerId: "",
    cacklejackPlayerId: "",
    cacklejackImmunePlayerId: "",
    cacklejackChangedPlayerId: "",
    cacklejackNewRoleId: "",
    gangsterPlayerId: "",
    gangsterTargetPlayerId: "",
    gangsterConsentPlayerId: "",
    gnomePlayerId: "",
    gnomeAmigoPlayerId: "",
    gnomeNominatorPlayerId: "",
  });
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
  const previousPhase = useMemo(() => {
    if (!selectedPhase) {
      return undefined;
    }

    const previousNumber = selectedPhase.type === "day" ? selectedPhase.number : selectedPhase.number - 1;
    const previousType: Phase["type"] = selectedPhase.type === "day" ? "night" : "day";

    if (previousNumber < 1) {
      return undefined;
    }

    return phases.find((phase) => phase.number === previousNumber && phase.type === previousType);
  }, [phases, selectedPhase]);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const getPlayerOrStorytellerName = (playerId?: string) =>
    isStorytellerExecutionTarget(playerId)
      ? STORYTELLER_EXECUTION_TARGET_NAME
      : playersById.get(playerId ?? "")?.name ?? "Неизвестно";
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
  const travellerMechanics = gameResult.game?.travellerMechanics ?? {};
  const updateTravellerMechanicsForm = (patch: Partial<TravellerMechanicsForm>) => {
    setTravellerMechanicsForm((current) => ({ ...current, ...patch }));
  };
  const playerHasRole = (player: Player | undefined, roleId: string) => {
    if (!player) {
      return false;
    }

    const normalizedRoleId = normalizeRoleId(roleId);
    return [player.mainRole, player.travellerRole, ...(player.additionalRoles ?? [])].some(
      (currentRoleId) => Boolean(currentRoleId) && normalizeRoleId(currentRoleId!) === normalizedRoleId,
    );
  };
  const activeTravellerPlayersByRole = useMemo(() => {
    const grouped = new Map<string, Player[]>();

    players
      .filter((player) => player.isTraveller && !player.leftPhaseId)
      .forEach((player) => {
        const roleId = normalizeRoleId(player.travellerRole ?? player.mainRole ?? "");

        if (!roleId) {
          return;
        }

        grouped.set(roleId, [...(grouped.get(roleId) ?? []), player]);
      });

    return grouped;
  }, [players]);
  const activeTravellerPlayers = useMemo(
    () => Array.from(activeTravellerPlayersByRole.values()).flat(),
    [activeTravellerPlayersByRole],
  );
  const travellerMechanicPlayers = useMemo(
    () =>
      activeTravellerPlayers.filter((player) =>
        TRAVELLER_MECHANIC_ROLE_IDS.has(normalizeRoleId(player.travellerRole ?? player.mainRole ?? "")),
      ),
    [activeTravellerPlayers],
  );
  const getActiveTravellersByRole = (roleId: string) => activeTravellerPlayersByRole.get(normalizeRoleId(roleId)) ?? [];
  const hasLivingTravellerRole = (roleId: string) =>
    getActiveTravellersByRole(roleId).some((player) => player.alive);
  const hasActiveVoudon = selectedPhase?.type === "day" && hasLivingTravellerRole("voudon");
  const hasActiveBishop = selectedPhase?.type === "day" && hasLivingTravellerRole("bishop");
  const getActiveVoteModifiersForPhase = (phaseId?: string): TravellerVoteModifier[] =>
    phaseId
      ? (travellerMechanics.voteModifiersByPhaseId?.[phaseId] ?? []).filter((modifier) => {
          const traveller = playersById.get(modifier.travellerPlayerId);
          return Boolean(traveller?.alive && !traveller.leftPhaseId && playerHasRole(traveller, modifier.roleId));
        })
      : [];
  const getVoteValue = (playerId: string, phaseId: string, voteType: "execution" | "traveller_exile") => {
    if (voteType === "traveller_exile") {
      return 1;
    }

    const modifier = getActiveVoteModifiersForPhase(phaseId).find(
      (currentModifier) => currentModifier.targetPlayerId === playerId,
    );

    return modifier?.voteValue ?? 1;
  };
  const calculateVoteCount = (voteRecord: VoteRecord) => {
    const voteType = resolveVoteType(voteRecord);

    if (voteType === "execution" && travellerMechanics.judgeForcedVoteRecordIds?.[voteRecord.id] === "fail") {
      return 0;
    }

    return voteRecord.voterPlayerIds.reduce(
      (sum, playerId) => sum + getVoteValue(playerId, voteRecord.phaseId, voteType),
      0,
    );
  };
  const selectedPhaseVoteRecords = useMemo(
    () => voteRecords.filter((voteRecord) => voteRecord.phaseId === effectiveSelectedPhaseId),
    [voteRecords, effectiveSelectedPhaseId],
  );
  const selectedPhaseExecutionVoteRecords = useMemo(
    () => selectedPhaseVoteRecords.filter((voteRecord) => resolveVoteType(voteRecord) === "execution"),
    [selectedPhaseVoteRecords],
  );
  const isButcherPlayer = (player: Player) => playerHasRole(player, "butcher");
  const executionNominatorCountById = useMemo(() => {
    const counts = new Map<string, number>();

    selectedPhaseExecutionVoteRecords.forEach((voteRecord) => {
      counts.set(voteRecord.nominatorPlayerId, (counts.get(voteRecord.nominatorPlayerId) ?? 0) + 1);
    });

    return counts;
  }, [selectedPhaseExecutionVoteRecords]);
  const usedExecutionNomineeIds = useMemo(
    () => new Set(selectedPhaseExecutionVoteRecords.map((voteRecord) => voteRecord.nomineePlayerId)),
    [selectedPhaseExecutionVoteRecords],
  );
  const selectableExecutionNominatorIds = useMemo(
    () =>
      new Set(
        players
          .filter((player) => {
            if (hasActiveBishop) {
              return false;
            }

            if (hasActiveVoudon && !player.alive) {
              return false;
            }

            const nominationCount = executionNominatorCountById.get(player.id) ?? 0;
            const butcherCanSecondNominate = selectedPhaseExecutionVoteRecords.some(
              (voteRecord) => voteRecord.resultedInExecution,
            );

            return isButcherPlayer(player)
              ? nominationCount < (butcherCanSecondNominate ? 2 : 1)
              : nominationCount < 1;
          })
          .map((player) => player.id),
      ),
    [executionNominatorCountById, hasActiveBishop, hasActiveVoudon, players, selectedPhaseExecutionVoteRecords],
  );
  const selectableTravellerExileNominatorIds = useMemo(
    () => new Set(players.map((player) => player.id)),
    [players],
  );
  const selectableExecutionNomineeIds = useMemo(
    () =>
      new Set(
        [
          ...players
          .filter((player) => !player.isTraveller && !usedExecutionNomineeIds.has(player.id))
            .map((player) => player.id),
          ...(usedExecutionNomineeIds.has(STORYTELLER_EXECUTION_TARGET_ID) ? [] : [STORYTELLER_EXECUTION_TARGET_ID]),
        ],
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
      const voudonMode = voteType === "execution" && hasActiveVoudon;
      const threshold =
        voteType === "traveller_exile"
          ? getTravellerExileThreshold(participantCount)
          : voudonMode
            ? 1
          : getExecutionThreshold(alivePlayerCount);
      const previousHighestVotes = highestVotes;
      const previousBlockVoteRecordId = currentBlockVoteRecordId;
      const voteCount = calculateVoteCount(voteRecord);
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

      const analysis = {
        voteRecord,
        voteNumber: index + 1,
        voteCount,
        threshold,
        thresholdLabel:
          voteType === "traveller_exile"
            ? `Нужно ${threshold} ${threshold === 1 ? "голос" : threshold < 5 ? "голоса" : "голосов"} для изгнания`
            : voudonMode
              ? "Voudon: достаточно 1 голоса, побеждает максимум"
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

      if (voteType === "execution" && voteRecord.resultedInExecution) {
        highestVotes = 0;
        currentBlockVoteRecordId = null;
      }

      return analysis;
    });
  }, [calculateVoteCount, hasActiveVoudon, players, selectedPhaseVoteRecords, voteRecords]);
  const selectedPhaseVoteAnalysesDesc = useMemo(
    () => [...selectedPhaseVoteAnalysesAsc].reverse(),
    [selectedPhaseVoteAnalysesAsc],
  );
  const currentBlockPlayerId = useMemo(() => {
    let current: string | null = null;

    selectedPhaseVoteAnalysesAsc.forEach((analysis) => {
      if (analysis.voteRecord.resultedInExecution) {
        current = null;
        return;
      }

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
  const currentBlockVoteRecordId = useMemo(() => {
    let current: string | null = null;

    selectedPhaseVoteAnalysesAsc.forEach((analysis) => {
      if (analysis.voteRecord.resultedInExecution) {
        current = null;
        return;
      }

      if (analysis.voteType !== "execution") {
        return;
      }

      if (analysis.removedPreviousFromBlock && !analysis.isOnTheBlock) {
        current = null;
        return;
      }

      if (analysis.isOnTheBlock) {
        current = analysis.voteRecord.id;
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
        players.map((player) => {
          const voteType = voteDraft?.voteType ?? "execution";
          const beggarTokens = travellerMechanics.beggarTokensByPlayerId?.[player.id] ?? 0;

          if (playerHasRole(player, "beggar") && beggarTokens <= 0) {
            return [player.id, "unavailable"];
          }

          if (voteType === "execution" && hasActiveVoudon) {
            if (!player.alive || playerHasRole(player, "voudon")) {
              return [player.id, player.alive ? "alive" : "dead_available"];
            }

            return [player.id, "unavailable"];
          }

          return [
            player.id,
            player.alive
              ? "alive"
              : (player.deadVoteAvailable ?? !deadVoteSpentPlayerIds.has(player.id))
                ? "dead_available"
                : "dead_spent",
          ];
        }),
      ),
    [deadVoteSpentPlayerIds, hasActiveVoudon, players, travellerMechanics.beggarTokensByPlayerId, voteDraft?.voteType],
  );
  const voteRequirementSummary = useMemo(() => {
    if (!voteDraft || !selectedPhase || selectedPhase.type !== "day") {
      return null;
    }

    const aliveVotes = players.filter((player) => voteAvailabilityByPlayerId.get(player.id) === "alive").length;
    const deadVotes = players.filter((player) => voteAvailabilityByPlayerId.get(player.id) === "dead_available").length;
    const totalVotes = aliveVotes + deadVotes;

    if ((voteDraft.voteType ?? "execution") === "traveller_exile") {
      const threshold = getTravellerExileThreshold(players.length);

      return {
        headline: `Нужно ${threshold} голосов, чтобы изгнать Traveller`,
        requiredVotes: threshold,
        aliveVotes,
        deadVotes,
        totalVotes,
      };
    }

    const threshold = hasActiveVoudon ? 1 : getExecutionThreshold(players.filter((player) => player.alive).length);
    let highestVotes = 0;

    [...selectedPhaseVoteRecords]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((voteRecord) => {
        if (resolveVoteType(voteRecord) !== "execution") {
          return;
        }

        const voteCount = calculateVoteCount(voteRecord);

        if (voteCount < threshold) {
          if (voteRecord.resultedInExecution) {
            highestVotes = 0;
          }
          return;
        }

        if (voteCount > highestVotes) {
          highestVotes = voteCount;
          return;
        }

        if (voteCount === highestVotes) {
          highestVotes = voteCount;
        }

        if (voteRecord.resultedInExecution) {
          highestVotes = 0;
        }
      });

    return {
      headline:
        hasActiveVoudon
          ? "Voudon: нужен минимум 1 голос, побеждает максимум"
          : highestVotes === 0
          ? `Нужно ${threshold} голосов, чтобы номинировать`
          : `Нужно ${highestVotes} голосов, чтобы сровнять, и ${highestVotes + 1} — чтобы номинировать`,
      requiredVotes: highestVotes === 0 ? threshold : highestVotes + 1,
      aliveVotes,
      deadVotes,
      totalVotes,
    };
  }, [calculateVoteCount, hasActiveVoudon, players, selectedPhase, selectedPhaseVoteRecords, voteAvailabilityByPlayerId, voteDraft]);

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
    const currentGame = await db.games.get(gameId);
    const spentDeadVotes = new Set(allVoteRecords.flatMap((voteRecord) => voteRecord.deadVoterPlayerIds));
    (currentGame?.travellerMechanics?.beggarDonations ?? []).forEach((donation) => {
      spentDeadVotes.add(donation.donorPlayerId);
    });

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

    if (!effectiveMyPlayerId && !gameResult.game?.myPlayerId) {
      setPageError(MY_TOKEN_REQUIRED_ERROR);
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

  const returnToPreviousPhase = async () => {
    if (!gameId || !previousPhase) {
      return;
    }

    const now = timestamp();

    try {
      await setCurrentPhase(previousPhase, now);
      setPageError("");
      setContentTab(null);
    } catch {
      setPageError("Не удалось вернуться к предыдущей фазе.");
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

  const addRegularPlayer = async () => {
    if (!gameId || !gameResult.game) {
      return;
    }

    const regularPlayers = players.filter((player) => !player.isTraveller);

    if (regularPlayers.length >= MAX_REGULAR_PLAYERS) {
      setPageError(`Нельзя добавить больше ${MAX_REGULAR_PLAYERS} обычных игроков.`);
      return;
    }

    const now = timestamp();
    const trimmedName = newPlayerName.trim();
    const nextSeatIndex = players.reduce((maxSeat, player) => Math.max(maxSeat, player.seatIndex), -1) + 1;
    const nextPlayerNumber = regularPlayers.length + 1;

    setPlayerFormSaving(true);

    try {
      await db.transaction("rw", db.players, db.games, async () => {
        await db.players.add({
          id: createId(),
          gameId,
          name: trimmedName || `Игрок ${nextPlayerNumber}`,
          seatIndex: nextSeatIndex,
          alive: true,
          deadVoteAvailable: true,
          tokenTint: "default",
          mainRole: undefined,
          additionalRoles: ["", "", ""],
          isTraveller: false,
          createdAt: now,
          updatedAt: now,
        });
        await db.games.update(gameId, {
          playerCount: regularPlayers.length + 1,
          updatedAt: now,
        });
      });

      setPlayerFormOpen(false);
      setNewPlayerName("");
      setPageError("");
    } catch {
      setPageError("Не удалось добавить игрока.");
    } finally {
      setPlayerFormSaving(false);
    }
  };

  const deletePlayerToken = async (playerId: string) => {
    if (!gameId || !gameResult.game) {
      return;
    }

    const now = timestamp();
    const playerToDelete = players.find((player) => player.id === playerId);

    if (!playerToDelete) {
      return;
    }

    const remainingPlayers = players
      .filter((player) => player.id !== playerId)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    const nextRegularPlayerCount = remainingPlayers.filter((player) => !player.isTraveller).length;
    const voteRecordsToDelete = new Set(
      voteRecords
        .filter(
          (voteRecord) =>
            voteRecord.nominatorPlayerId === playerId ||
            voteRecord.nomineePlayerId === playerId ||
            voteRecord.executedPlayerId === playerId,
        )
        .map((voteRecord) => voteRecord.id),
    );
    const voteRecordIdsByPhaseAndCreatedAt = new Map(
      voteRecords.map((voteRecord) => [`${voteRecord.phaseId}::${voteRecord.createdAt}`, voteRecord.id]),
    );
    const currentMechanics = gameResult.game.travellerMechanics;

    try {
      await db.transaction("rw", db.players, db.games, db.notes, db.voteRecords, async () => {
        await Promise.all(
          voteRecords.map(async (voteRecord) => {
            const historyNote = notes.find(
              (note) =>
                note.phaseId === voteRecord.phaseId &&
                note.kind === "vote_history" &&
                note.createdAt === voteRecord.createdAt,
            );

            if (voteRecordsToDelete.has(voteRecord.id)) {
              await db.voteRecords.delete(voteRecord.id);
              if (historyNote) {
                await db.notes.delete(historyNote.id);
              }
              return;
            }

            const nextVoterPlayerIds = voteRecord.voterPlayerIds.filter((id) => id !== playerId);
            const nextDeadVoterPlayerIds = voteRecord.deadVoterPlayerIds.filter((id) => id !== playerId);

            if (
              nextVoterPlayerIds.length !== voteRecord.voterPlayerIds.length ||
              nextDeadVoterPlayerIds.length !== voteRecord.deadVoterPlayerIds.length
            ) {
              await db.voteRecords.update(voteRecord.id, {
                voterPlayerIds: nextVoterPlayerIds,
                deadVoterPlayerIds: nextDeadVoterPlayerIds,
                updatedAt: now,
              });

              if (historyNote) {
                await db.notes.update(historyNote.id, {
                  linkedPlayerIds: historyNote.linkedPlayerIds.filter((id) => id !== playerId),
                  updatedAt: now,
                });
              }
            }
          }),
        );

        await Promise.all(
          notes
            .filter((note) => note.kind !== "vote_history")
            .map(async (note) => {
              const noteVoteRecordId = voteRecordIdsByPhaseAndCreatedAt.get(`${note.phaseId}::${note.createdAt}`);

              if (noteVoteRecordId && voteRecordsToDelete.has(noteVoteRecordId)) {
                return;
              }

              const nextLinkedPlayerIds = note.linkedPlayerIds.filter((id) => id !== playerId);
              const referencesExecutionPlayer = note.executionPlayerId === playerId;
              const shouldDeleteNote =
                referencesExecutionPlayer && (note.kind === "execution" || note.kind === "day_death");

              if (shouldDeleteNote) {
                await db.notes.delete(note.id);
                return;
              }

              if (
                nextLinkedPlayerIds.length !== note.linkedPlayerIds.length ||
                referencesExecutionPlayer
              ) {
                await db.notes.update(note.id, {
                  linkedPlayerIds: nextLinkedPlayerIds,
                  executionPlayerId: referencesExecutionPlayer ? undefined : note.executionPlayerId,
                  updatedAt: now,
                });
              }
            }),
        );

        await db.players.delete(playerId);

        await Promise.all(
          remainingPlayers.map((player, index) =>
            db.players.update(player.id, {
              seatIndex: index,
              updatedAt: now,
            }),
          ),
        );

        const nextCustomTokenPositions = { ...(gameResult.game?.customTokenPositions ?? {}) };
        delete nextCustomTokenPositions[playerId];

        const nextTravellerMechanics = currentMechanics
          ? {
              ...currentMechanics,
              beggarTokensByPlayerId: currentMechanics.beggarTokensByPlayerId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.beggarTokensByPlayerId).filter(([id]) => id !== playerId),
                  )
                : undefined,
              beggarDonations: currentMechanics.beggarDonations?.filter(
                (donation) => donation.beggarPlayerId !== playerId && donation.donorPlayerId !== playerId,
              ),
              voteModifiersByPhaseId: currentMechanics.voteModifiersByPhaseId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.voteModifiersByPhaseId)
                      .map(([phaseId, modifiers]) => [
                        phaseId,
                        modifiers.filter(
                          (modifier) =>
                            modifier.travellerPlayerId !== playerId && modifier.targetPlayerId !== playerId,
                        ),
                      ])
                      .filter(([, modifiers]) => modifiers.length > 0),
                  )
                : undefined,
              gunslingerShotsByPhaseId: currentMechanics.gunslingerShotsByPhaseId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.gunslingerShotsByPhaseId).filter(
                      ([, shot]) =>
                        shot.travellerPlayerId !== playerId &&
                        shot.targetPlayerId !== playerId &&
                        !voteRecordsToDelete.has(shot.voteRecordId),
                    ),
                  )
                : undefined,
              judgeUsedByPlayerId: currentMechanics.judgeUsedByPlayerId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.judgeUsedByPlayerId).filter(([id, voteRecordId]) => {
                      return id !== playerId && !voteRecordsToDelete.has(voteRecordId);
                    }),
                  )
                : undefined,
              judgeForcedVoteRecordIds: currentMechanics.judgeForcedVoteRecordIds
                ? Object.fromEntries(
                    Object.entries(currentMechanics.judgeForcedVoteRecordIds).filter(
                      ([voteRecordId]) => !voteRecordsToDelete.has(voteRecordId),
                    ),
                  )
                : undefined,
              boneCollectorUsedByPlayerId: currentMechanics.boneCollectorUsedByPlayerId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.boneCollectorUsedByPlayerId).filter(
                      ([id, value]) => id !== playerId && value.targetPlayerId !== playerId,
                    ),
                  )
                : undefined,
              boneCollectorEffectsByPhaseId: currentMechanics.boneCollectorEffectsByPhaseId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.boneCollectorEffectsByPhaseId).filter(
                      ([, effect]) =>
                        effect.travellerPlayerId !== playerId && effect.targetPlayerId !== playerId,
                    ),
                  )
                : undefined,
              baristaEffectsByPhaseId: currentMechanics.baristaEffectsByPhaseId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.baristaEffectsByPhaseId).filter(
                      ([, effect]) =>
                        effect.travellerPlayerId !== playerId && effect.targetPlayerId !== playerId,
                    ),
                  )
                : undefined,
              harlotVisitsByPhaseId: currentMechanics.harlotVisitsByPhaseId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.harlotVisitsByPhaseId).filter(
                      ([, visit]) => visit.travellerPlayerId !== playerId && visit.targetPlayerId !== playerId,
                    ),
                  )
                : undefined,
              apprenticeAbilityByPlayerId: currentMechanics.apprenticeAbilityByPlayerId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.apprenticeAbilityByPlayerId).filter(([id]) => id !== playerId),
                  )
                : undefined,
              matronSwapsByPhaseId: currentMechanics.matronSwapsByPhaseId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.matronSwapsByPhaseId)
                      .map(([phaseId, swaps]) => [
                        phaseId,
                        swaps.filter((swap) => swap.aPlayerId !== playerId && swap.bPlayerId !== playerId),
                      ])
                      .filter(([, swaps]) => swaps.length > 0),
                  )
                : undefined,
              cacklejackEffectsByPhaseId: currentMechanics.cacklejackEffectsByPhaseId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.cacklejackEffectsByPhaseId).filter(
                      ([, effect]) =>
                        effect.travellerPlayerId !== playerId &&
                        effect.immunePlayerId !== playerId &&
                        effect.changedPlayerId !== playerId,
                    ),
                  )
                : undefined,
              gangsterKillsByPhaseId: currentMechanics.gangsterKillsByPhaseId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.gangsterKillsByPhaseId).filter(
                      ([, kill]) =>
                        kill.travellerPlayerId !== playerId &&
                        kill.targetPlayerId !== playerId &&
                        kill.consentingNeighborId !== playerId,
                    ),
                  )
                : undefined,
              gnomeAmigoByPlayerId: currentMechanics.gnomeAmigoByPlayerId
                ? Object.fromEntries(
                    Object.entries(currentMechanics.gnomeAmigoByPlayerId).filter(
                      ([id, amigoPlayerId]) => id !== playerId && amigoPlayerId !== playerId,
                    ),
                  )
                : undefined,
              gnomeKills: currentMechanics.gnomeKills?.filter(
                (kill) =>
                  kill.travellerPlayerId !== playerId &&
                  kill.amigoPlayerId !== playerId &&
                  kill.nominatorPlayerId !== playerId,
              ),
            }
          : undefined;

        await db.games.update(gameId, {
          playerCount: nextRegularPlayerCount,
          myPlayerId: effectiveMyPlayerId === playerId ? undefined : gameResult.game?.myPlayerId,
          myRoleId: effectiveMyPlayerId === playerId ? undefined : gameResult.game?.myRoleId,
          myTeam: effectiveMyPlayerId === playerId ? undefined : gameResult.game?.myTeam,
          customTokenPositions: nextCustomTokenPositions,
          travellerMechanics: nextTravellerMechanics,
          updatedAt: now,
        });

        await reconcileDeadVoteAvailability(now);
      });
      setPageError("");
    } catch {
      setPageError(playerToDelete.isTraveller ? "Не удалось удалить Traveller." : "Не удалось удалить игрока.");
      return;
    }

    if (effectiveMyPlayerId === playerId) {
      setLocalMyPlayerId(null);
    }

    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
    }

    setVoteDraft((current) => {
      if (!current) {
        return current;
      }

      if (current.nominatorPlayerId === playerId || current.nomineePlayerId === playerId) {
        return null;
      }

      return {
        ...current,
        selectedVoterIds: current.selectedVoterIds.filter((id) => id !== playerId),
      };
    });
    setEditingVoteDraft((current) => {
      if (!current) {
        return current;
      }

      if (current.nominatorPlayerId === playerId || current.nomineePlayerId === playerId) {
        return null;
      }

      return {
        ...current,
        selectedVoterIds: current.selectedVoterIds.filter((id) => id !== playerId),
      };
    });
    setExecutionPlayerId((current) => (current === playerId ? "" : current));
    setNightDeathPlayerIds((current) => current.filter((id) => id !== playerId));
    setNightResultCandidatePlayerIds((current) => current.filter((id) => id !== playerId));
    setDayDeathPlayerIds((current) => current.filter((id) => id !== playerId));

    if (playerToDelete.isTraveller && travellerFormOpen) {
      setTravellerFormOpen(false);
    }

    if (!playerToDelete.isTraveller && playerFormOpen) {
      setPlayerFormOpen(false);
      setNewPlayerName("");
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
      scriptVersion: sourceGame.scriptVersion,
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

  const getTravellerTargetDayPhase = async (now = timestamp()) => {
    if (!gameId || !selectedPhase) {
      return undefined;
    }

    if (selectedPhase.type === "day") {
      return selectedPhase;
    }

    return ensurePhaseExists(selectedPhase.number, "day", now);
  };

  const addTravellerMechanicsNote = async (
    roleId: string,
    text: string,
    linkedPlayerIds: string[],
    options?: { phaseId?: string; kind?: Note["kind"] },
  ) => {
    if (!gameId || !selectedPhase) {
      return;
    }

    const now = timestamp();

    await db.notes.add({
      id: createId(),
      gameId,
      phaseId: options?.phaseId ?? selectedPhase.id,
      kind: options?.kind ?? "role_intel",
      roleId,
      text,
      linkedPlayerIds,
      createdAt: now,
      updatedAt: now,
    });
  };

  const recordTravellerDeaths = async (roleId: string, targetPlayerIds: string[], text: string) => {
    if (!gameId || !selectedPhase || targetPlayerIds.length === 0) {
      return;
    }

    const now = timestamp();
    const noteKind: Note["kind"] = selectedPhase.type === "day" ? "day_death" : "general";

    await db.notes.add({
      id: createId(),
      gameId,
      phaseId: selectedPhase.id,
      kind: noteKind,
      roleId: noteKind === "day_death" ? roleId : undefined,
      text,
      linkedPlayerIds: targetPlayerIds,
      createdAt: now,
      updatedAt: now,
    });

    await Promise.all(
      targetPlayerIds.map((playerId) =>
        db.players.update(playerId, {
          alive: false,
          deadVoteAvailable: false,
          updatedAt: now,
        }),
      ),
    );
  };

  const runTravellerAction = async (action: () => Promise<void>, errorMessage: string) => {
    setTravellerMechanicsSaving(true);
    setPageError("");

    try {
      await action();
    } catch {
      setPageError(errorMessage);
    } finally {
      setTravellerMechanicsSaving(false);
    }
  };

  const saveBeggarDonation = async () => {
    const beggarId = travellerMechanicsForm.beggarPlayerId;
    const donorId = travellerMechanicsForm.beggarDonorId;
    const beggar = playersById.get(beggarId);
    const donor = playersById.get(donorId);

    if (!gameId || !selectedPhase || !beggar || !donor || donor.alive) {
      setPageError("Выберите Beggar и мёртвого игрока-донатора.");
      return;
    }

    if (donor.deadVoteAvailable === false) {
      setPageError("У этого мёртвого игрока уже нет vote token для передачи Beggar.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();
      const nextTokens = { ...(travellerMechanics.beggarTokensByPlayerId ?? {}) };
      nextTokens[beggarId] = (nextTokens[beggarId] ?? 0) + 1;

      await db.transaction("rw", db.games, db.notes, db.players, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            beggarTokensByPlayerId: nextTokens,
            beggarDonations: [
              ...(travellerMechanics.beggarDonations ?? []),
              {
                id: createId(),
                phaseId: selectedPhase.id,
                beggarPlayerId: beggarId,
                donorPlayerId: donorId,
                donorTeam: travellerMechanicsForm.beggarDonorTeam,
                createdAt: now,
              },
            ],
          },
          updatedAt: now,
        });
        await db.players.update(donorId, {
          deadVoteAvailable: false,
          updatedAt: now,
        });
        await addTravellerMechanicsNote(
          "beggar",
          `${donor.name} отдал vote token Beggar. Alignment: ${personalTeamLabel(travellerMechanicsForm.beggarDonorTeam)}.`,
          [beggarId, donorId],
        );
      });
    }, "Не удалось сохранить donation для Beggar.");
  };

  const saveVoteModifier = async () => {
    const roleId = travellerMechanicsForm.voteModifierRoleId;
    const travellerId = travellerMechanicsForm.voteModifierTravellerId;
    const targetId = travellerMechanicsForm.voteModifierTargetId;
    const traveller = playersById.get(travellerId);
    const target = playersById.get(targetId);

    if (!gameId || !selectedPhase || !traveller || !target || traveller.id === target.id) {
      setPageError("Выберите Traveller и другого игрока.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();
      const targetDayPhase = await getTravellerTargetDayPhase(now);

      if (!targetDayPhase) {
        throw new Error("No target day phase");
      }

      const modifier: TravellerVoteModifier = {
        id: createId(),
        travellerPlayerId: traveller.id,
        roleId,
        targetPlayerId: target.id,
        voteValue: roleId === "bureaucrat" ? 3 : -1,
        createdAt: now,
      };
      const currentModifiers = travellerMechanics.voteModifiersByPhaseId?.[targetDayPhase.id] ?? [];
      const nextModifiers = currentModifiers.filter(
        (currentModifier) => !(currentModifier.travellerPlayerId === traveller.id && currentModifier.roleId === roleId),
      );

      await db.transaction("rw", db.games, db.notes, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            voteModifiersByPhaseId: {
              ...(travellerMechanics.voteModifiersByPhaseId ?? {}),
              [targetDayPhase.id]: [...nextModifiers, modifier],
            },
          },
          updatedAt: now,
        });
        await addTravellerMechanicsNote(
          roleId,
          `${getRoleLabel(roleId, roleReferenceRoles)}: завтра голос ${target.name} считается за ${modifier.voteValue}.`,
          [traveller.id, target.id],
        );
      });
    }, `Не удалось сохранить эффект ${getRoleLabel(roleId, roleReferenceRoles)}.`);
  };

  const saveGunslingerShot = async () => {
    const travellerId = travellerMechanicsForm.gunslingerTravellerId;
    const targetId = travellerMechanicsForm.gunslingerTargetId;
    const target = playersById.get(targetId);
    const firstVote = [...selectedPhaseExecutionVoteRecords].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    if (!gameId || !selectedPhase || selectedPhase.type !== "day" || !travellerId || !target || !firstVote) {
      setPageError("Выберите Gunslinger shot после первого execution-vote.");
      return;
    }

    if (!firstVote.voterPlayerIds.includes(target.id)) {
      setPageError("Gunslinger может выбрать только игрока, который голосовал в первом execution-vote.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();

      await db.transaction("rw", db.games, db.notes, db.players, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            gunslingerShotsByPhaseId: {
              ...(travellerMechanics.gunslingerShotsByPhaseId ?? {}),
              [selectedPhase.id]: {
                travellerPlayerId: travellerId,
                targetPlayerId: target.id,
                voteRecordId: firstVote.id,
                createdAt: now,
              },
            },
          },
          updatedAt: now,
        });
        await recordTravellerDeaths("gunslinger", [target.id], `Gunslinger shot: ${target.name} умер.`);
      });
    }, "Не удалось сохранить Gunslinger shot.");
  };

  const forceJudgeVote = async (mode: "pass" | "fail") => {
    const judgeId = travellerMechanicsForm.judgePlayerId;
    const voteRecordId = travellerMechanicsForm.judgeVoteRecordId;
    const judge = playersById.get(judgeId);
    const voteRecord = selectedPhaseVoteRecords.find((currentVoteRecord) => currentVoteRecord.id === voteRecordId);

    if (!gameId || !selectedPhase || !judge || !voteRecord) {
      setPageError("Выберите Judge и текущую номинацию.");
      return;
    }

    if (voteRecord.nominatorPlayerId === judge.id) {
      setPageError("Judge не может форсировать свою собственную номинацию.");
      return;
    }

    if (travellerMechanics.judgeUsedByPlayerId?.[judge.id]) {
      setPageError("Judge уже использовал способность в этой партии.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();
      const nextMechanics: TravellerMechanicsState = {
        ...travellerMechanics,
        judgeUsedByPlayerId: {
          ...(travellerMechanics.judgeUsedByPlayerId ?? {}),
          [judge.id]: voteRecord.id,
        },
        judgeForcedVoteRecordIds: {
          ...(travellerMechanics.judgeForcedVoteRecordIds ?? {}),
          [voteRecord.id]: mode,
        },
      };

      await db.games.update(gameId, { travellerMechanics: nextMechanics, updatedAt: now });
      await addTravellerMechanicsNote(
        "judge",
        mode === "pass" ? "Judge force pass: казнь проходит немедленно." : "Judge force fail: номинация получает 0 голосов.",
        [judge.id, voteRecord.nomineePlayerId].filter((playerId) => !isStorytellerExecutionTarget(playerId)),
      );

      if (mode === "pass") {
        await markVoteRecordAsExecution(voteRecord.id);
      }
    }, "Не удалось применить Judge.");
  };

  const executeScapegoatInstead = async () => {
    const scapegoatId = travellerMechanicsForm.scapegoatPlayerId;
    const voteRecordId = travellerMechanicsForm.scapegoatVoteRecordId;
    const scapegoat = playersById.get(scapegoatId);

    if (!scapegoat || !voteRecordId) {
      setPageError("Выберите Scapegoat и номинацию, которую он заменяет.");
      return;
    }

    await runTravellerAction(async () => {
      await addTravellerMechanicsNote(
        "scapegoat",
        `Scapegoat executed instead: ${scapegoat.name}.`,
        [scapegoat.id],
      );
      await markVoteRecordAsExecution(voteRecordId, { executedPlayerId: scapegoat.id });
    }, "Не удалось казнить Scapegoat вместо номинанта.");
  };

  const saveBoneCollector = async () => {
    const travellerId = travellerMechanicsForm.boneCollectorPlayerId;
    const targetId = travellerMechanicsForm.boneCollectorTargetId;
    const traveller = playersById.get(travellerId);
    const target = playersById.get(targetId);

    if (!gameId || !selectedPhase || selectedPhase.type !== "night" || selectedPhase.number <= 1 || !traveller || !target || target.alive) {
      setPageError("Bone Collector выбирает мёртвого игрока ночью кроме первой.");
      return;
    }

    if (travellerMechanics.boneCollectorUsedByPlayerId?.[traveller.id]) {
      setPageError("Bone Collector уже использовал способность.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();
      const targetDayPhase = await getTravellerTargetDayPhase(now);

      if (!targetDayPhase) {
        throw new Error("No target day phase");
      }

      await db.transaction("rw", db.games, db.notes, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            boneCollectorUsedByPlayerId: {
              ...(travellerMechanics.boneCollectorUsedByPlayerId ?? {}),
              [traveller.id]: { targetPlayerId: target.id, phaseId: selectedPhase.id, createdAt: now },
            },
            boneCollectorEffectsByPhaseId: {
              ...(travellerMechanics.boneCollectorEffectsByPhaseId ?? {}),
              [targetDayPhase.id]: { travellerPlayerId: traveller.id, targetPlayerId: target.id, createdAt: now },
            },
          },
          updatedAt: now,
        });
        await addTravellerMechanicsNote("bonecollector", `Bone Collector: ${target.name} имеет способность до dusk.`, [
          traveller.id,
          target.id,
        ]);
      });
    }, "Не удалось сохранить Bone Collector.");
  };

  const saveBarista = async () => {
    const travellerId = travellerMechanicsForm.baristaPlayerId;
    const targetId = travellerMechanicsForm.baristaTargetId;
    const traveller = playersById.get(travellerId);
    const target = playersById.get(targetId);

    if (!gameId || !selectedPhase || !traveller || !target) {
      setPageError("Выберите Barista и цель.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();
      const targetDayPhase = await getTravellerTargetDayPhase(now);

      if (!targetDayPhase) {
        throw new Error("No target day phase");
      }

      const modeLabel =
        travellerMechanicsForm.baristaMode === "ability_twice"
          ? "ability works twice"
          : "sober, healthy, true info";

      await db.transaction("rw", db.games, db.notes, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            baristaEffectsByPhaseId: {
              ...(travellerMechanics.baristaEffectsByPhaseId ?? {}),
              [targetDayPhase.id]: {
                travellerPlayerId: traveller.id,
                targetPlayerId: target.id,
                mode: travellerMechanicsForm.baristaMode,
                createdAt: now,
              },
            },
          },
          updatedAt: now,
        });
        await addTravellerMechanicsNote("barista", `Barista: ${target.name} получил эффект "${modeLabel}" до dusk.`, [
          traveller.id,
          target.id,
        ]);
      });
    }, "Не удалось сохранить Barista.");
  };

  const saveHarlot = async () => {
    const travellerId = travellerMechanicsForm.harlotPlayerId;
    const targetId = travellerMechanicsForm.harlotTargetId;
    const traveller = playersById.get(travellerId);
    const target = playersById.get(targetId);

    if (!gameId || !selectedPhase || selectedPhase.type !== "night" || selectedPhase.number <= 1 || !traveller || !target || !target.alive) {
      setPageError("Harlot выбирает живого игрока ночью кроме первой.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();
      const revealedRoleId = target.isTraveller ? target.travellerRole ?? target.mainRole : target.mainRole;
      const killedIds = travellerMechanicsForm.harlotKillBoth ? [traveller.id, target.id].filter((playerId) => playersById.get(playerId)?.alive) : [];

      await db.transaction("rw", db.games, db.notes, db.players, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            harlotVisitsByPhaseId: {
              ...(travellerMechanics.harlotVisitsByPhaseId ?? {}),
              [selectedPhase.id]: {
                travellerPlayerId: traveller.id,
                targetPlayerId: target.id,
                accepted: travellerMechanicsForm.harlotAccepted,
                killBoth: travellerMechanicsForm.harlotKillBoth,
                revealedRoleId: travellerMechanicsForm.harlotAccepted ? revealedRoleId : undefined,
                createdAt: now,
              },
            },
          },
          updatedAt: now,
        });
        await addTravellerMechanicsNote(
          "harlot",
          travellerMechanicsForm.harlotAccepted
            ? `Harlot: ${target.name} согласился. Роль: ${getRoleLabel(revealedRoleId, roleReferenceRoles)}.`
            : `Harlot: ${target.name} отказался.`,
          [traveller.id, target.id],
        );

        if (killedIds.length > 0) {
          await recordTravellerDeaths("harlot", killedIds, `Harlot: ${traveller.name} и ${target.name} могут умереть.`);
        }
      });
    }, "Не удалось сохранить Harlot.");
  };

  const saveDeviantFunny = async () => {
    const travellerId = travellerMechanicsForm.deviantPlayerId;
    const traveller = playersById.get(travellerId);

    if (!gameId || !selectedPhase || selectedPhase.type !== "day" || !traveller) {
      setPageError("Выберите Deviant в дневной фазе.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();

      await db.transaction("rw", db.games, db.notes, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            deviantFunnyByPhaseId: {
              ...(travellerMechanics.deviantFunnyByPhaseId ?? {}),
              [selectedPhase.id]: true,
            },
          },
          updatedAt: now,
        });
        await addTravellerMechanicsNote("deviant", `Deviant: ${traveller.name} был funny today; exile можно предотвратить.`, [
          traveller.id,
        ]);
      });
    }, "Не удалось отметить Deviant.");
  };

  const saveApprenticeAbility = async () => {
    const travellerId = travellerMechanicsForm.apprenticePlayerId;
    const traveller = playersById.get(travellerId);
    const abilityRoleId = travellerMechanicsForm.apprenticeAbilityRoleId;

    if (!gameId || !traveller || !abilityRoleId) {
      setPageError("Выберите Apprentice и полученную способность.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();

      await db.transaction("rw", db.games, db.notes, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            apprenticeAbilityByPlayerId: {
              ...(travellerMechanics.apprenticeAbilityByPlayerId ?? {}),
              [traveller.id]: {
                abilityRoleId,
                team: travellerMechanicsForm.apprenticeTeam,
                createdAt: now,
              },
            },
          },
          updatedAt: now,
        });
        await addTravellerMechanicsNote(
          "apprentice",
          `Apprentice: получил способность ${getRoleLabel(abilityRoleId, roleReferenceRoles)} (${personalTeamLabel(travellerMechanicsForm.apprenticeTeam)}).`,
          [traveller.id],
        );
      });
    }, "Не удалось сохранить Apprentice.");
  };

  const saveMatronSwap = async () => {
    const aPlayer = playersById.get(travellerMechanicsForm.matronAPlayerId);
    const bPlayer = playersById.get(travellerMechanicsForm.matronBPlayerId);

    if (!gameId || !selectedPhase || selectedPhase.type !== "day" || !aPlayer || !bPlayer || aPlayer.id === bPlayer.id) {
      setPageError("Выберите двух разных игроков для Matron swap.");
      return;
    }

    const currentSwaps = travellerMechanics.matronSwapsByPhaseId?.[selectedPhase.id] ?? [];

    if (currentSwaps.length >= 3) {
      setPageError("Matron уже сделал 3 swap seats в этот день.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();

      await db.transaction("rw", db.games, db.notes, db.players, async () => {
        await Promise.all([
          db.players.update(aPlayer.id, { seatIndex: bPlayer.seatIndex, updatedAt: now }),
          db.players.update(bPlayer.id, { seatIndex: aPlayer.seatIndex, updatedAt: now }),
        ]);
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            matronSwapsByPhaseId: {
              ...(travellerMechanics.matronSwapsByPhaseId ?? {}),
              [selectedPhase.id]: [
                ...currentSwaps,
                { id: createId(), aPlayerId: aPlayer.id, bPlayerId: bPlayer.id, createdAt: now },
              ],
            },
          },
          updatedAt: now,
        });
        await addTravellerMechanicsNote("matron", `Matron swap: ${aPlayer.name} ↔ ${bPlayer.name}.`, [
          aPlayer.id,
          bPlayer.id,
        ]);
      });
    }, "Не удалось переставить места Matron.");
  };

  const saveCacklejack = async () => {
    const travellerId = travellerMechanicsForm.cacklejackPlayerId;
    const immuneId = travellerMechanicsForm.cacklejackImmunePlayerId;
    const changedId = travellerMechanicsForm.cacklejackChangedPlayerId;
    const newRoleId = travellerMechanicsForm.cacklejackNewRoleId;
    const traveller = playersById.get(travellerId);
    const changedPlayer = playersById.get(changedId);

    if (!gameId || !selectedPhase || !traveller) {
      setPageError("Выберите Cacklejack.");
      return;
    }

    if (changedId && (!changedPlayer || !newRoleId || changedId === immuneId)) {
      setPageError("Для смены персонажа выберите другого игрока и новую роль.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();

      await db.transaction("rw", db.games, db.notes, db.players, async () => {
        if (changedPlayer && newRoleId) {
          await db.players.update(changedPlayer.id, {
            mainRole: changedPlayer.isTraveller ? changedPlayer.mainRole : newRoleId,
            travellerRole: changedPlayer.isTraveller ? newRoleId : changedPlayer.travellerRole,
            updatedAt: now,
          });
        }

        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            cacklejackEffectsByPhaseId: {
              ...(travellerMechanics.cacklejackEffectsByPhaseId ?? {}),
              [selectedPhase.id]: {
                travellerPlayerId: traveller.id,
                immunePlayerId: immuneId || undefined,
                changedPlayerId: changedId || undefined,
                newRoleId: newRoleId || undefined,
                createdAt: now,
              },
            },
          },
          updatedAt: now,
        });
        await addTravellerMechanicsNote(
          "cacklejack",
          [
            immuneId ? `immune: ${playersById.get(immuneId)?.name ?? "игрок"}` : "",
            changedPlayer && newRoleId
              ? `changed: ${changedPlayer.name} -> ${getRoleLabel(newRoleId, roleReferenceRoles)}`
              : "",
          ].filter(Boolean).join("; "),
          [traveller.id, immuneId, changedId].filter((playerId): playerId is string => Boolean(playerId)),
        );
      });
    }, "Не удалось сохранить Cacklejack.");
  };

  const getLivingNeighborIds = (playerId: string) => {
    const livingPlayers = [...players].filter((player) => player.alive).sort((a, b) => a.seatIndex - b.seatIndex);
    const index = livingPlayers.findIndex((player) => player.id === playerId);

    if (index < 0 || livingPlayers.length < 3) {
      return [];
    }

    return [
      livingPlayers[(index - 1 + livingPlayers.length) % livingPlayers.length].id,
      livingPlayers[(index + 1) % livingPlayers.length].id,
    ];
  };

  const saveGangsterKill = async () => {
    const travellerId = travellerMechanicsForm.gangsterPlayerId;
    const targetId = travellerMechanicsForm.gangsterTargetPlayerId;
    const consentId = travellerMechanicsForm.gangsterConsentPlayerId;
    const traveller = playersById.get(travellerId);
    const target = playersById.get(targetId);
    const consent = playersById.get(consentId);
    const neighborIds = getLivingNeighborIds(travellerId);

    if (!gameId || !selectedPhase || selectedPhase.type !== "day" || !traveller || !target || !consent) {
      setPageError("Выберите Gangster, цель и соседнего игрока, который согласен.");
      return;
    }

    if (!neighborIds.includes(target.id) || !neighborIds.includes(consent.id) || target.id === consent.id) {
      setPageError("Gangster может убить живого соседа только если другой живой сосед согласен.");
      return;
    }

    if (travellerMechanics.gangsterKillsByPhaseId?.[selectedPhase.id]) {
      setPageError("Gangster уже использовал убийство сегодня.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();

      await db.transaction("rw", db.games, db.notes, db.players, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            gangsterKillsByPhaseId: {
              ...(travellerMechanics.gangsterKillsByPhaseId ?? {}),
              [selectedPhase.id]: {
                travellerPlayerId: traveller.id,
                targetPlayerId: target.id,
                consentingNeighborId: consent.id,
                createdAt: now,
              },
            },
          },
          updatedAt: now,
        });
        await recordTravellerDeaths("gangster", [target.id], `Gangster: ${target.name} умер с согласием ${consent.name}.`);
      });
    }, "Не удалось сохранить Gangster kill.");
  };

  const saveGnomeAmigo = async () => {
    const travellerId = travellerMechanicsForm.gnomePlayerId;
    const amigoId = travellerMechanicsForm.gnomeAmigoPlayerId;
    const traveller = playersById.get(travellerId);
    const amigo = playersById.get(amigoId);

    if (!gameId || !traveller || !amigo || traveller.id === amigo.id) {
      setPageError("Выберите Gnome и amigo.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();

      await db.transaction("rw", db.games, db.notes, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            gnomeAmigoByPlayerId: {
              ...(travellerMechanics.gnomeAmigoByPlayerId ?? {}),
              [traveller.id]: amigo.id,
            },
          },
          updatedAt: now,
        });
        await addTravellerMechanicsNote("gnome", `Gnome amigo: ${amigo.name}.`, [traveller.id, amigo.id]);
      });
    }, "Не удалось сохранить Gnome amigo.");
  };

  const saveGnomeKill = async () => {
    const travellerId = travellerMechanicsForm.gnomePlayerId;
    const nominatorId = travellerMechanicsForm.gnomeNominatorPlayerId;
    const amigoId = travellerMechanics.gnomeAmigoByPlayerId?.[travellerId] ?? travellerMechanicsForm.gnomeAmigoPlayerId;
    const traveller = playersById.get(travellerId);
    const amigo = playersById.get(amigoId);
    const nominator = playersById.get(nominatorId);

    if (!gameId || !selectedPhase || selectedPhase.type !== "day" || !traveller || !amigo || !nominator) {
      setPageError("Выберите Gnome, amigo и номинатора.");
      return;
    }

    const nominationExists = selectedPhaseExecutionVoteRecords.some(
      (voteRecord) => voteRecord.nomineePlayerId === amigo.id && voteRecord.nominatorPlayerId === nominator.id,
    );

    if (!nominationExists) {
      setPageError("Gnome может убить только номинатора своего amigo.");
      return;
    }

    await runTravellerAction(async () => {
      const now = timestamp();

      await db.transaction("rw", db.games, db.notes, db.players, async () => {
        await db.games.update(gameId, {
          travellerMechanics: {
            ...travellerMechanics,
            gnomeKills: [
              ...(travellerMechanics.gnomeKills ?? []),
              {
                id: createId(),
                phaseId: selectedPhase.id,
                travellerPlayerId: traveller.id,
                amigoPlayerId: amigo.id,
                nominatorPlayerId: nominator.id,
                createdAt: now,
              },
            ],
          },
          updatedAt: now,
        });
        await recordTravellerDeaths("gnome", [nominator.id], `Gnome: ${nominator.name} умер за номинацию amigo ${amigo.name}.`);
      });
    }, "Не удалось применить Gnome kill.");
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
      ? (currentPlayer?.isTraveller
          ? currentPlayer.travellerRole ?? values.mainRole
          : values.mainRole)?.trim() || undefined
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
      "title" | "date" | "storyteller" | "scriptName" | "scriptVersion" | "scriptAuthor" | "scriptRoles" | "playerCount"
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

    if (voteType === "execution" && selectableExecutionNominatorIds.size === 0 && !hasActiveBishop) {
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

  const selectStorytellerAsVoteNominator = () => {
    setVoteDraft((current) => {
      if (
        !current ||
        current.stage !== "select_nominator" ||
        (current.voteType ?? "execution") !== "execution" ||
        !hasActiveBishop
      ) {
        return current;
      }

      return {
        ...current,
        nominatorPlayerId: STORYTELLER_EXECUTION_TARGET_ID,
        nomineePlayerId: undefined,
        selectedVoterIds: [],
        stage: "select_nominee",
      };
    });
    setPageError("");
  };

  const selectStorytellerAsVoteNominee = () => {
    setVoteDraft((current) => {
      if (
        !current ||
        current.stage !== "select_nominee" ||
        (current.voteType ?? "execution") !== "execution" ||
        !selectableExecutionNomineeIds.has(STORYTELLER_EXECUTION_TARGET_ID)
      ) {
        return current;
      }

      return {
        ...current,
        nomineePlayerId: STORYTELLER_EXECUTION_TARGET_ID,
        selectedVoterIds: [],
        stage: "select_voters",
      };
    });
    setPageError("");
  };

  const toggleVoteDraftVoter = (playerId: string) => {
    const availability = voteAvailabilityByPlayerId.get(playerId);

    if (availability === "dead_spent" || availability === "unavailable") {
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
    options?: {
      finishAfterExecution?: boolean;
      stayInDay?: boolean;
      executedPlayerDied?: boolean;
      protectionRoleId?: string;
      executedPlayerId?: string;
    },
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
    const nextExecutedPlayerId = options?.executedPlayerId ?? currentVoteRecord.nomineePlayerId;
    const currentVoteType = resolveVoteType(currentVoteRecord);
    const isTravellerExile = currentVoteType === "traveller_exile";

    try {
      await db.transaction("rw", db.voteRecords, db.notes, db.games, db.players, async () => {
        await Promise.all(
          selectedPhaseVoteRecords.map((voteRecord) =>
            db.voteRecords.update(voteRecord.id, {
              resultedInExecution: voteRecord.id === voteRecordId ? !voteRecord.resultedInExecution : false,
              executedPlayerId:
                voteRecord.id === voteRecordId && !voteRecord.resultedInExecution
                  ? nextExecutedPlayerId
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

        if (
          !currentVoteRecord.resultedInExecution &&
          executedPlayerDied &&
          !isStorytellerExecutionTarget(nextExecutedPlayerId)
        ) {
          await db.players.update(nextExecutedPlayerId, {
            alive: false,
            deadVoteAvailable: isTravellerExile ? true : false,
            leftPhaseId: isTravellerExile ? selectedPhase.id : undefined,
            updatedAt: now,
          });
        }

        if (
          currentVoteRecord.resultedInExecution &&
          currentVoteRecord.executedPlayerId &&
          !isStorytellerExecutionTarget(currentVoteRecord.executedPlayerId)
        ) {
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
              leftPhaseId: isTravellerExile ? undefined : playersById.get(currentVoteRecord.executedPlayerId)?.leftPhaseId,
              updatedAt: now,
            });
          }
        }

        if (selectedPhaseExecutionNote) {
          await db.notes.delete(selectedPhaseExecutionNote.id);
        }

        await updateGameTimestamp(now);
      });
      if (nextWillExecute && !isTravellerExile && !options?.finishAfterExecution && !options?.stayInDay) {
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

  const confirmVoteRecordExecution = async (finishAfterExecution: boolean, stayInDay = false) => {
    if (!executionFinishPromptVoteRecordId) {
      return;
    }

    setExecutionFinishPromptSaving(true);

    try {
      const saved = await markVoteRecordAsExecution(executionFinishPromptVoteRecordId, {
        finishAfterExecution,
        stayInDay,
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

  const confirmNominatorExecution = async () => {
    if (!executionFinishPromptVoteRecordId) {
      return;
    }

    const voteRecord = selectedPhaseVoteRecords.find(
      (currentVoteRecord) => currentVoteRecord.id === executionFinishPromptVoteRecordId,
    );

    if (!voteRecord || isStorytellerExecutionTarget(voteRecord.nominatorPlayerId)) {
      return;
    }

    setExecutionFinishPromptSaving(true);

    try {
      const saved = await markVoteRecordAsExecution(voteRecord.id, {
        executedPlayerDied: true,
        executedPlayerId: voteRecord.nominatorPlayerId,
      });

      if (!saved) {
        return;
      }

      setExecutionFinishPromptVoteRecordId(null);
      setExecutionFinishPromptOutcome("died");
      setExecutionFinishPromptProtectionRoleId("");
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
    const nominatorIsStoryteller = isStorytellerExecutionTarget(voteDraft.nominatorPlayerId);
    const nomineeIsStoryteller = isStorytellerExecutionTarget(voteDraft.nomineePlayerId);

    if ((!nominator && !nominatorIsStoryteller) || (!nominee && !nomineeIsStoryteller)) {
      setPageError("Не удалось найти игроков для голосования.");
      return;
    }

    const voteType = voteDraft.voteType ?? "execution";
    const alivePlayerCount = players.filter((player) => player.alive).length;
    const participantCount = players.length;
    const invalidVoter = voteDraft.selectedVoterIds.find((playerId) => {
      const availability = voteAvailabilityByPlayerId.get(playerId);
      return availability === "dead_spent" || availability === "unavailable";
    });

    if (invalidVoter) {
      setPageError(`${playersById.get(invalidVoter)?.name ?? "Игрок"} сейчас не может голосовать.`);
      return;
    }

    if (voteType === "execution") {
      if (nominatorIsStoryteller && !hasActiveBishop) {
        setPageError("Ведущий может номинировать только при активном Bishop.");
        return;
      }

      if (nominator && hasActiveBishop) {
        setPageError("При Bishop номинировать может только ведущий.");
        return;
      }

      if (nominee?.isTraveller) {
        setPageError("Traveller нельзя номинировать на казнь. Используйте изгнание.");
        return;
      }

      const nominationCount = nominator ? executionNominatorCountById.get(nominator.id) ?? 0 : 0;
      const butcherCanSecondNominate = selectedPhaseExecutionVoteRecords.some(
        (voteRecord) => voteRecord.resultedInExecution,
      );

      if (nominator && (isButcherPlayer(nominator) ? nominationCount >= (butcherCanSecondNominate ? 2 : 1) : nominationCount >= 1)) {
        setPageError(
          isButcherPlayer(nominator)
            ? "Мясник уже номинировал два раза в текущий день."
            : "Этот игрок уже номинировал в текущий день.",
        );
        return;
      }

      if (usedExecutionNomineeIds.has(voteDraft.nomineePlayerId)) {
        setPageError("Этот игрок уже был номинирован в текущий день.");
        return;
      }
    }

    if (voteType === "traveller_exile" && !nominee?.isTraveller) {
      setPageError("На изгнание можно номинировать только Traveller.");
      return;
    }

    const beggarVoterIds = voteDraft.selectedVoterIds.filter((playerId) => {
      const player = playersById.get(playerId);
      return playerHasRole(player, "beggar");
    });
    const beggarWithoutTokens = beggarVoterIds.find(
      (playerId) => (travellerMechanics.beggarTokensByPlayerId?.[playerId] ?? 0) <= 0,
    );

    if (beggarWithoutTokens) {
      setPageError(`${playersById.get(beggarWithoutTokens)?.name ?? "Beggar"} не может голосовать без vote token.`);
      return;
    }

    const isVoudonExecutionVote = voteType === "execution" && hasActiveVoudon;
    const deadVoterPlayerIds = isVoudonExecutionVote
      ? []
      : voteDraft.selectedVoterIds.filter((playerId) => !playersById.get(playerId)?.alive);
    const displayedDeadVoterPlayerIds = voteDraft.selectedVoterIds.filter((playerId) => !playersById.get(playerId)?.alive);
    const voterNames = voteDraft.selectedVoterIds
      .map((playerId) => playersById.get(playerId)?.name)
      .filter((name): name is string => Boolean(name));
    const deadVoterNames = displayedDeadVoterPlayerIds
      .map((playerId) => playersById.get(playerId)?.name)
      .filter((name): name is string => Boolean(name));
    const threshold =
      voteType === "traveller_exile"
        ? getTravellerExileThreshold(participantCount)
        : hasActiveVoudon
          ? 1
        : getExecutionThreshold(alivePlayerCount);
    const voteCount = voteDraft.selectedVoterIds.reduce(
      (sum, playerId) => sum + getVoteValue(playerId, voteDraft.phaseId, voteType),
      0,
    );
    const now = timestamp();
    const noteText = buildVotingNoteText({
      voteNumber: selectedPhaseVoteRecords.length + 1,
      voteType,
      phaseTitleText: selectedPhase?.title ?? "Дневная фаза",
      nominatorName: getPlayerOrStorytellerName(voteDraft.nominatorPlayerId),
      nomineeName: getPlayerOrStorytellerName(voteDraft.nomineePlayerId),
      voterNames,
      deadVoterNames,
      voteCount,
      threshold,
      thresholdText:
        voteType === "traveller_exile"
          ? `${threshold} из ${participantCount} всех участников`
          : hasActiveVoudon
            ? "Voudon: минимум 1 голос, побеждает максимум"
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
      ).filter((playerId) => !isStorytellerExecutionTarget(playerId)),
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
        if (beggarVoterIds.length > 0) {
          const nextTokens = { ...(travellerMechanics.beggarTokensByPlayerId ?? {}) };

          beggarVoterIds.forEach((playerId) => {
            nextTokens[playerId] = Math.max(0, (nextTokens[playerId] ?? 0) - 1);
          });

          await db.games.update(gameId, {
            travellerMechanics: {
              ...travellerMechanics,
              beggarTokensByPlayerId: nextTokens,
            },
            updatedAt: now,
          });
        }
        await reconcileDeadVoteAvailability(now);
        if (beggarVoterIds.length === 0) {
          await updateGameTimestamp(now);
        }
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
    const nomineeIsStoryteller = isStorytellerExecutionTarget(editingVoteDraft.nomineePlayerId);

    if (!nominator || (!nominee && !nomineeIsStoryteller)) {
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
      nomineeName: getPlayerOrStorytellerName(editingVoteDraft.nomineePlayerId),
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
                ].filter(
                  (playerId): playerId is string => Boolean(playerId) && !isStorytellerExecutionTarget(playerId),
                ),
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

        if (
          resolveVoteType(voteRecord) === "traveller_exile" &&
          voteRecord.resultedInExecution &&
          voteRecord.executedPlayerId &&
          !isStorytellerExecutionTarget(voteRecord.executedPlayerId)
        ) {
          await db.players.update(voteRecord.executedPlayerId, {
            alive: true,
            deadVoteAvailable: true,
            leftPhaseId: undefined,
            updatedAt: now,
          });
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
          ? ""
          : contentTab === "summaryDeaths"
              ? "Смерти и казни"
              : contentTab === "summaryRoles"
                ? "Саммари"
                : "";
  const isDayPhase = !selectedPhase || selectedPhase.type === "day";
  const contentModalIsBottomSheet = contentTab === "summaryDeaths" || contentTab === "summaryRoles";
  const referenceLightTheme = isDayPhase || !gameHasStarted;
  const contentModalShellClass = contentTab === "reference"
    ? referenceLightTheme
      ? "w-screen min-h-[100dvh] max-h-[100dvh] rounded-none bg-[linear-gradient(180deg,rgba(255,251,244,0.995),rgba(246,232,208,0.995))] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] text-stone-900 shadow-none sm:mx-auto sm:h-[96dvh] sm:min-h-0 sm:max-h-[96dvh] sm:max-w-6xl sm:rounded-3xl sm:px-5 sm:pb-5 sm:pt-5 sm:shadow-[0_24px_60px_rgba(76,48,22,0.2)]"
      : "w-screen min-h-[100dvh] max-h-[100dvh] rounded-none border-0 bg-ink-850 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] text-stone-100 shadow-none sm:mx-auto sm:h-[96dvh] sm:min-h-0 sm:max-h-[96dvh] sm:max-w-6xl sm:rounded-3xl sm:border sm:border-ember-200/15 sm:px-5 sm:pb-5 sm:pt-5 sm:shadow-2xl"
    : isDayPhase
      ? "mt-3 w-full max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] rounded-t-3xl border border-amber-900/15 bg-[linear-gradient(180deg,rgba(255,251,244,0.99),rgba(246,232,208,0.99))] p-4 shadow-[0_24px_60px_rgba(76,48,22,0.2)] sm:mx-auto sm:mt-0 sm:max-h-[92vh] sm:max-w-6xl sm:rounded-3xl sm:p-6"
      : "mt-3 w-full max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:mt-0 sm:max-h-[92vh] sm:max-w-6xl sm:rounded-3xl sm:p-6";
  const grimoireActionButtonClass = (active: boolean) =>
    `grimoire-action-button h-8 min-h-0 w-8 shrink-0 gap-0 px-0 py-0 sm:h-9 sm:w-9 ${active ? "grimoire-action-button-active" : ""}`;
  const stripLeadingSummaryRoleLabel = (text: string, roleId?: string) => {
    if (!roleId) {
      return text;
    }

    const labels = [getRoleLabel(roleId, roleReferenceRoles), roleId]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    return labels.reduce((current, label) => {
      const pattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*[:—-]?\\s*`, "iu");
      return current.replace(pattern, "");
    }, text);
  };

  const renderSummaryNoteText = (text: string, compact = false, hiddenRoleId?: string) => {
    const noteText = stripLeadingSummaryRoleLabel(text, hiddenRoleId);
    const hiddenNormalizedRoleId = hiddenRoleId ? normalizeRoleId(hiddenRoleId) : "";

    if (!roleMentionRegex) {
      return (
        <p className={`${compact ? "mt-0 leading-4 text-[13px]" : "mt-3 text-sm leading-6"} whitespace-pre-wrap text-stone-100`}>
          {noteText}
        </p>
      );
    }

    const lines = noteText.split("\n");

    return (
      <p className={`${compact ? "mt-0 leading-4 text-[13px]" : "mt-3 text-sm leading-6"} whitespace-pre-wrap text-stone-100`}>
        {lines.map((line, lineIndex) => (
          <Fragment key={`${lineIndex}-${line}`}>
            {line.split(roleMentionRegex).map((part, partIndex) => {
              const roleId = roleMentionMap.get(part);

              if (!roleId) {
                return <Fragment key={`${lineIndex}-${partIndex}`}>{part}</Fragment>;
              }

              if (hiddenNormalizedRoleId && normalizeRoleId(roleId) === hiddenNormalizedRoleId) {
                return null;
              }

              const roleLabel = getRoleLabel(roleId, roleReferenceRoles);

              return (
                <span
                  key={`${lineIndex}-${partIndex}-${normalizeRoleId(roleId)}`}
                  className={`${compact ? "h-6 w-6" : "h-8 w-8"} mx-0.5 inline-flex align-middle`}
                  title={roleLabel}
                >
                  <RoleTokenImage
                    roleId={roleId}
                    roles={roleReferenceRoles}
                    className={`${compact ? "h-6 w-6" : "h-8 w-8"} overflow-hidden rounded-full border border-ember-200/20 bg-white/90 shadow-[0_4px_10px_rgba(0,0,0,0.12)]`}
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
  const summaryRoleItems = summaryInfoItems
    .filter((item): item is Extract<SummaryItem, { kind: "role_group" }> => item.kind === "role_group")
    .map((item) => ({
      ...item,
      notes: [...item.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  const executionPromptNomineeName = executionPromptVoteRecord
    ? getPlayerOrStorytellerName(executionPromptVoteRecord.nomineePlayerId)
    : "";
  const executionPromptNominatorName = executionPromptVoteRecord
    ? getPlayerOrStorytellerName(executionPromptVoteRecord.nominatorPlayerId)
    : "";
  const canExecuteNominator = Boolean(
    executionPromptVoteRecord &&
      !isStorytellerExecutionTarget(executionPromptVoteRecord.nominatorPlayerId),
  );
  const selectedPhaseVoteItems = selectedPhaseVoteAnalysesDesc.map((analysis) => ({
    id: analysis.voteRecord.id,
    createdAt: analysis.voteRecord.createdAt,
    kind: "vote" as const,
    phase: selectedPhase,
    voteRecord: analysis.voteRecord,
    analysis,
  }));
  const firstExecutionVoteRecord = [...selectedPhaseExecutionVoteRecords].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const firstExecutionVoteVoters = firstExecutionVoteRecord
    ? firstExecutionVoteRecord.voterPlayerIds
        .map((playerId) => playersById.get(playerId))
        .filter((player): player is Player => Boolean(player))
    : [];
  const currentVoteModifiers = getActiveVoteModifiersForPhase(selectedPhase?.id);
  const matronSwapCount = selectedPhase ? travellerMechanics.matronSwapsByPhaseId?.[selectedPhase.id]?.length ?? 0 : 0;
  const characterRoleOptions = roleReferenceRoles.filter(
    (role) => role.type !== "fabled" && role.type !== "loric" && role.type !== "unknown",
  );
  const travellerMechanicsSectionClass =
    "rounded-2xl border border-amber-900/12 bg-black/5 p-3 sm:p-4";
  const travellerMechanicsLabelClass =
    "text-[11px] font-bold uppercase tracking-[0.18em] text-amber-900/70";
  const travellerMechanicsButtonClass = "secondary-button min-h-10 px-3 text-sm";
  const renderSummaryItem = (item: SummaryItem) => {
    if (item.kind === "vote") {
      const voteRecord = item.voteRecord;
      const isEditingVote = editingVoteRecordId === voteRecord.id;
      const nominatorName = getPlayerOrStorytellerName(voteRecord.nominatorPlayerId);
      const nomineeName = getPlayerOrStorytellerName(voteRecord.nomineePlayerId);
      const executedName = getPlayerOrStorytellerName(voteRecord.executedPlayerId ?? voteRecord.nomineePlayerId);
      const phaseVoteRecords = voteRecords
        .filter((currentVoteRecord) => currentVoteRecord.phaseId === voteRecord.phaseId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const voterNames = voteRecord.voterPlayerIds
        .map((playerId) => playersById.get(playerId)?.name)
        .filter((name): name is string => Boolean(name));
      const voteOutcomeText = voteRecord.resultedInExecution
        ? voteRecord.executedPlayerDied === false
          ? buildExecutionSurvivalSummaryText(executedName)
          : `${resolveVoteType(voteRecord) === "traveller_exile" ? "Изгнали" : "Казнили"}: ${executedName}`
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
                  {formatTime(item.createdAt)}
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
                  {resolveVoteType(voteRecord) === "execution" ? (
                    <option value={STORYTELLER_EXECUTION_TARGET_ID}>{STORYTELLER_EXECUTION_TARGET_NAME}</option>
                  ) : null}
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
                  <span className="font-semibold">{item.analysis?.voteCount ?? calculateVoteCount(voteRecord)}</span>
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
              {formatTime(item.createdAt)}
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
        <article key={item.id} className="border-t border-stone-900/20 pt-1.5 first:border-t-0 first:pt-0">
          <div className="px-0.5">
            <h3 className="text-sm font-semibold leading-4 text-stone-100">{roleLabel}</h3>
          </div>

          <div className="mt-1 space-y-1">
            {item.notes.map((note) => {
              const isEditingNote = editingNoteId === note.id;

              return (
                <div key={note.id} className="rounded-lg bg-black/10 px-2 py-1.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {isEditingNote ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingNoteText}
                            onChange={(event) => setEditingNoteText(event.target.value)}
                            className="field min-h-24"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => void saveHistoryNote(note)} className="primary-button min-h-9 px-3">
                              <Save className="h-4 w-4" />
                              Сохранить
                            </button>
                            <button type="button" onClick={cancelEditingHistoryNote} className="secondary-button min-h-9 px-3">
                              <X className="h-4 w-4" />
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        renderSummaryNoteText(note.text, true, item.roleId)
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => startEditingHistoryNote(note)}
                        className="secondary-button min-h-7 px-1.5"
                      >
                        <img src="/button-icons/pencil.svg" alt="" aria-hidden="true" className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => void deleteNote(note.id)} className="danger-button min-h-7 px-1.5">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
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
              {formatTime(item.createdAt)}
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
          <div className="flex items-start gap-2 sm:gap-3">
            <Link to="/" className="secondary-button min-h-10 shrink-0 px-3">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-ember-100/75 sm:text-sm">{formatDate(game.date)}</p>
              <button
                type="button"
                onClick={() => {
                  setGameInfoOpen(false);
                  setSetupOpen(true);
                }}
                aria-label="Редактировать setup"
                title="Редактировать setup"
                className="block max-w-full truncate pr-1 text-left text-base font-bold leading-tight text-stone-50 transition hover:text-ember-100 focus:outline-none focus-visible:text-ember-100 sm:text-xl"
              >
                {gameDisplayTitle(game)}
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={openFinishForm}
                aria-label={game.status === "finished" ? "Итог" : "Финиш"}
                title={game.status === "finished" ? "Итог" : "Финиш"}
                className="secondary-button h-10 w-10 min-h-0 shrink-0 px-0 py-0"
              >
                <Flag className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {pageError ? (
          <div className="rounded-2xl border border-red-300/20 bg-red-950/30 p-4 text-sm text-red-100">
            {pageError === MY_TOKEN_REQUIRED_ERROR ? (
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-900/15 bg-red-950/10 text-red-950">
                  <UserRound className="h-5 w-5" />
                </span>
                <span>{pageError}</span>
              </div>
            ) : (
              pageError
            )}
          </div>
        ) : null}

        <div className="grid min-w-0 gap-4 xl:grid-cols-[0.95fr_minmax(0,1.05fr)] xl:gap-5">
          <div className="min-w-0 space-y-4 sm:space-y-5">
            <section className="panel overflow-x-auto p-2 sm:p-3">
              <div className="flex min-w-max flex-nowrap items-center gap-1.5">
                {!gameHasStarted ? (
                  <button type="button" onClick={startGame} className="primary-button min-h-10 px-3 whitespace-nowrap">
                    <Play className="h-4 w-4" />
                    Начать игру
                  </button>
                ) : null}
                {gameHasStarted ? (
                  !selectedPhase ? (
                    <button type="button" disabled className="secondary-button h-9 min-h-0 w-9 shrink-0 gap-0 px-0 py-0 opacity-60">
                      <X className="h-4 w-4" />
                    </button>
                  ) : selectedPhase.type === "night" ? (
                    <button
                      type="button"
                      onClick={openNightResultModal}
                      className="primary-button h-9 min-h-0 w-11 shrink-0 gap-0 px-0 py-0"
                      aria-label={`Открыть результат ${selectedPhase.number} ночи`}
                      title={`Результат ${selectedPhase.number} ночи`}
                    >
                      <span className="relative inline-flex h-5 w-5 items-center justify-center">
                        <SunMedium className="h-5 w-5" />
                        <span className="absolute right-[-4px] top-[-4px] inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-ink-900 px-[2px] text-[8px] font-bold leading-none text-amber-50">
                          {selectedPhase.number}
                        </span>
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void advanceToNextPhase("day_to_night")}
                      className="secondary-button h-9 min-h-0 w-11 shrink-0 gap-0 px-0 py-0"
                      aria-label={`Перейти в ${selectedPhase.number + 1} ночь`}
                      title={`${selectedPhase.number + 1} ночь`}
                    >
                      <span className="relative inline-flex h-5 w-5 items-center justify-center">
                        <MoonStar className="h-5 w-5" />
                        <span className="absolute right-[-4px] top-[-4px] inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-ink-900 px-[2px] text-[8px] font-bold leading-none text-amber-50">
                          {selectedPhase.number + 1}
                        </span>
                      </span>
                    </button>
                  )
                ) : null}
                {gameHasStarted && previousPhase ? (
                  <button
                    type="button"
                    onClick={() => void returnToPreviousPhase()}
                    className="secondary-button h-9 min-h-0 w-9 shrink-0 gap-0 px-0 py-0"
                    aria-label={`Вернуться в ${previousPhase.title}`}
                    title={`Вернуться в ${previousPhase.title}`}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => openContentModal("reference")}
                  className={contentTab === "reference" ? "primary-button h-9 min-h-0 w-9 shrink-0 gap-0 px-0 py-0" : "secondary-button h-9 min-h-0 w-9 shrink-0 gap-0 px-0 py-0"}
                  title="Роли"
                  aria-label="Роли"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center">
                    <img src="/button-icons/info.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openContentModal("summaryDeaths")}
                  className={contentTab === "summaryDeaths" ? "primary-button h-9 min-h-0 w-9 shrink-0 gap-0 px-0 py-0" : "secondary-button h-9 min-h-0 w-9 shrink-0 gap-0 px-0 py-0"}
                  title="Смерти и казни"
                  aria-label="Смерти и казни"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center">
                    <img src="/button-icons/skull.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openContentModal("summaryRoles")}
                  className={contentTab === "summaryRoles" ? "primary-button h-9 min-h-0 w-9 shrink-0 gap-0 px-0 py-0" : "secondary-button h-9 min-h-0 w-9 shrink-0 gap-0 px-0 py-0"}
                  title="Сводка ролей"
                  aria-label="Сводка ролей"
                  >
                  <span className="inline-flex h-5 w-5 items-center justify-center">
                    <img src="/button-icons/interaction.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                  </span>
                  </button>
                </div>
            </section>
            <PlayerCircle
              players={players}
              notes={notes}
              phases={phases}
              currentPhase={selectedPhase}
              grimoireActions={
                <>
                  <button
                    type="button"
                    onClick={() => openContentModal("roleIntel")}
                    className={grimoireActionButtonClass(contentTab === "roleIntel")}
                    title="По ролям"
                    aria-label="По ролям"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center">
                      <img src="/button-icons/add.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                    </span>
                  </button>
                  {gameHasStarted ? (
                    <>
                    {travellerMechanicPlayers.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setTravellerMechanicsOpen(true)}
                        className={grimoireActionButtonClass(travellerMechanicsOpen)}
                        title="Механики Traveller"
                        aria-label="Механики Traveller"
                      >
                        <UserRound className="h-5 w-5" />
                      </button>
                    ) : null}
                    {selectedPhase?.type === "day" ? (
                      <button
                        type="button"
                        onClick={() => beginVoteDraft("execution")}
                        className={grimoireActionButtonClass(voteDraft?.voteType === "execution")}
                        title="Номинация"
                        aria-label="Номинация"
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center">
                          <img src="/button-icons/hand.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                        </span>
                      </button>
                    ) : null}
                    {selectedPhase?.type === "day" && players.some((player) => player.isTraveller) ? (
                      <button
                        type="button"
                        onClick={() => beginVoteDraft("traveller_exile")}
                        className={
                          voteDraft?.voteType === "traveller_exile"
                            ? "primary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"
                            : "secondary-button h-10 min-h-0 w-10 shrink-0 gap-0 px-0 py-0"
                        }
                        title="Изгнание Traveller"
                        aria-label="Изгнание Traveller"
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center">
                          <img src="/button-icons/door-open.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                        </span>
                      </button>
                    ) : null}
                    {selectedPhase?.type === "day" ? (
                      <button
                        type="button"
                        onClick={() => openDayDeathModal()}
                        className={grimoireActionButtonClass(dayDeathModalOpen)}
                        title="Человек умер"
                        aria-label="Человек умер"
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center">
                          <img src="/button-icons/knife.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                        </span>
                      </button>
                    ) : null}
                    {selectedPhase?.type === "day" ? (
                      <button
                        type="button"
                        onClick={() => openExecutionWithoutNominationModal()}
                        className={grimoireActionButtonClass(Boolean(executionModalOpen || selectedPhaseExecutionNote))}
                        title="Казнь без номинации"
                        aria-label="Казнь без номинации"
                      >
                        <span className="relative inline-flex h-5 w-5 items-center justify-center">
                          <img src="/button-icons/guillotine.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                          <img src="/button-icons/lightning.svg" alt="" aria-hidden="true" className="absolute right-[-4px] top-[-5px] h-7 w-7 object-contain" />
                        </span>
                      </button>
                    ) : null}
                    </>
                  ) : null}
                </>
              }
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
              onPlayerClick={(player) => {
                if (
                  selectedPhase?.type === "day" &&
                  currentBlockPlayerId === player.id &&
                  currentBlockVoteRecordId
                ) {
                  void promptVoteRecordExecution(currentBlockVoteRecordId);
                  return;
                }

                setSelectedPlayerId(player.id);
              }}
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
                        <span className="chip">Номинирован: {getPlayerOrStorytellerName(voteDraft.nomineePlayerId)}</span>
                      ) : null}
                      {voteDraft.stage === "select_voters" ? (
                        <span className="chip">Голосов отмечено: {voteDraft.selectedVoterIds.length}</span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-300">
                      {voteDraft.stage === "select_nominator"
                        ? voteDraft.voteType === "traveller_exile"
                          ? "На круге выберите игрока, который номинировал изгнание Traveller."
                          : hasActiveBishop
                            ? "Bishop активен: номинирует ведущий."
                          : "На круге выберите игрока, который номинировал."
                        : voteDraft.stage === "select_nominee"
                          ? voteDraft.voteType === "traveller_exile"
                            ? "Теперь выберите Traveller, которого изгоняют."
                            : "Теперь выберите игрока, которого номинировали."
                        : "На круге отметьте всех, кто голосовал, затем сохраните результат."}
                    </p>
                    {voteDraft.stage === "select_nominator" &&
                    (voteDraft.voteType ?? "execution") === "execution" &&
                    hasActiveBishop ? (
                      <button
                        type="button"
                        onClick={selectStorytellerAsVoteNominator}
                        className="secondary-button mt-3 min-h-10 px-3"
                      >
                        Номинирует ведущий
                      </button>
                    ) : null}
                    {voteDraft.stage === "select_nominee" &&
                    (voteDraft.voteType ?? "execution") === "execution" &&
                    selectableExecutionNomineeIds.has(STORYTELLER_EXECUTION_TARGET_ID) ? (
                      <button
                        type="button"
                        onClick={selectStorytellerAsVoteNominee}
                        className="secondary-button mt-3 min-h-10 px-3"
                      >
                        Номинировать и казнить ведущего
                      </button>
                    ) : null}
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
                      const nominatorName = getPlayerOrStorytellerName(item.voteRecord.nominatorPlayerId);
                      const nomineeName = getPlayerOrStorytellerName(item.voteRecord.nomineePlayerId);
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
                                  <img
                                    src={item.analysis?.voteType === "traveller_exile" ? "/button-icons/door-open.svg" : "/button-icons/guillotine.svg"}
                                    alt=""
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                  />
                                  <span>
                                    {item.analysis?.voteType === "traveller_exile"
                                      ? "Изгнание отмечено"
                                      : item.voteRecord.executedPlayerDied === false
                                        ? "Казнь пережита"
                                        : "Казнь отмечена"}
                                  </span>
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-stone-500">
                              {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
                            </p>
                          </div>
                          <div className="absolute right-3 top-3 flex flex-wrap gap-2">
                            {item.analysis?.voteType === "traveller_exile" ? (
                              <button
                                type="button"
                                onClick={() => void markVoteRecordAsExecution(item.voteRecord.id, { stayInDay: true })}
                                className={item.voteRecord.resultedInExecution ? "primary-button min-h-10 px-3" : "secondary-button min-h-10 px-3"}
                                title={item.voteRecord.resultedInExecution ? "Убрать изгнание Traveller" : "Отметить изгнание Traveller"}
                                aria-label={item.voteRecord.resultedInExecution ? "Убрать изгнание Traveller" : "Отметить изгнание Traveller"}
                              >
                                <img src="/button-icons/door-open.svg" alt="" aria-hidden="true" className="h-6 w-6" />
                              </button>
                            ) : (
                              <button type="button" onClick={() => void promptVoteRecordExecution(item.voteRecord.id)} className={item.voteRecord.resultedInExecution ? "primary-button min-h-10 px-3" : "secondary-button min-h-10 px-3"}>
                                <img src="/button-icons/guillotine.svg" alt="" aria-hidden="true" className="h-6 w-6" />
                              </button>
                            )}
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
                                <span className="font-semibold">{item.analysis?.voteCount ?? calculateVoteCount(item.voteRecord)}</span>
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
                className={`fixed inset-0 z-[60] flex overflow-y-auto bg-black/45 p-0 backdrop-blur-sm ${
                  contentTab === "reference"
                    ? "items-start"
                    : contentModalIsBottomSheet
                    ? "items-end pt-[calc(0.75rem+env(safe-area-inset-top))] pb-0"
                    : "items-start pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]"
                }`}
                onClick={closeContentModal}
              >
                <section
                  className={`${contentModalShellClass} relative`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className={contentTab === "summaryRoles" ? "mb-3" : "mb-4"}>
                    <div>
                      {contentTab === "summaryRoles" ? null : (
                        <p className={`text-sm ${contentTab === "reference" ? (referenceLightTheme ? "text-stone-500" : "text-stone-400") : "text-stone-400"}`}>{selectedPhase?.title ?? "Партия"}</p>
                      )}
                      {contentModalTitle ? <h2 className={contentTab === "summaryRoles" ? "text-2xl font-bold leading-tight text-stone-50" : `text-2xl font-bold ${contentTab === "reference" ? (referenceLightTheme ? "text-stone-900" : "text-stone-50") : "text-stone-50"}`}>{contentModalTitle}</h2> : null}
                    </div>
                  </div>

                  <div className={contentTab === "reference" ? "h-[calc(100dvh-6rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto pr-0 pb-20 sm:h-[calc(96dvh-5.5rem)] sm:pr-1 sm:pb-16" : "max-h-[calc(100dvh-9rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto pr-0 pb-20 sm:max-h-[84vh] sm:pr-1 sm:pb-16"}>
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
                embedded
              />
            ) : null}
            {contentTab === "reference" ? (
              <section className="space-y-2">
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
                    roles={roleReferenceRoles}
                    nightOrder={referenceData?.nightOrder ?? null}
                    referenceMap={referenceData?.roleMap ?? new Map()}
                    lightTheme={referenceLightTheme}
                  />
                ) : (
                  <RoleReferencePanel
                    roles={roleReferenceRoles}
                    referenceMap={referenceData?.roleMap ?? new Map()}
                    scriptName={game.scriptName}
                    scriptVersion={game.scriptVersion}
                    scriptAuthor={game.scriptAuthor}
                    lightTheme={referenceLightTheme}
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
              <section className="panel min-w-0 p-2 sm:p-2.5">
                {summaryItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                    История пока пустая.
                  </div>
                ) : (
                  <section className="space-y-2">
                    <div className="space-y-1.5">
                      {summaryRoleItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                          Пока нет ролевой информации.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {summaryRoleItems.map((item) => renderSummaryItem(item))}
                        </div>
                      )}
                    </div>

                    {summaryGeneralInfoItems.length > 0 ? (
                      <div className="space-y-1.5 border-t border-stone-900/20 pt-1.5">
                        <div className="space-y-1.5">
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

      {contentTab ? (
        <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[95] sm:bottom-5 sm:right-5">
          <button
            type="button"
            onClick={closeContentModal}
            className="pointer-events-auto modal-close-button h-11 min-h-0 w-11 shrink-0 gap-0 px-0 py-0"
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}

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
        onDeletePlayer={deletePlayerToken}
        onDeleteNote={deleteNote}
        onUpdateNote={updateNote}
      />

      {playerFormOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/50 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => {
            if (!playerFormSaving) {
              setPlayerFormOpen(false);
              setNewPlayerName("");
            }
          }}
        >
          <section
            className="w-full rounded-t-3xl border border-amber-900/15 bg-[linear-gradient(180deg,rgba(255,251,244,0.99),rgba(246,232,208,0.99))] p-4 pb-20 text-stone-900 shadow-[0_24px_60px_rgba(76,48,22,0.24)] sm:mx-auto sm:max-w-lg sm:rounded-3xl sm:p-6 sm:pb-24"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div>
                <p className="text-sm text-stone-600">Гримуар</p>
                <h2 className="text-2xl font-bold text-stone-950">Добавить игрока</h2>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-stone-700">Имя игрока</span>
                <input
                  value={newPlayerName}
                  onChange={(event) => setNewPlayerName(event.target.value)}
                  placeholder={`Игрок ${players.filter((player) => !player.isTraveller).length + 1}`}
                  className="field bg-white/80 text-stone-900 placeholder:text-stone-400"
                  maxLength={40}
                  autoFocus
                />
              </label>
              <p className="text-sm text-stone-600">
                Обычных игроков после добавления будет: {players.filter((player) => !player.isTraveller).length + 1}
              </p>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setPlayerFormOpen(false);
                  setNewPlayerName("");
                }}
                disabled={playerFormSaving}
                className="secondary-button"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void addRegularPlayer()}
                disabled={playerFormSaving}
                className="primary-button"
              >
                <UserPlus className="h-4 w-4" />
                Добавить игрока
              </button>
            </div>

            <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[95] sm:bottom-5 sm:right-5">
              <button
                type="button"
                onClick={() => {
                  setPlayerFormOpen(false);
                  setNewPlayerName("");
                }}
                disabled={playerFormSaving}
                className="pointer-events-auto modal-close-button h-11 w-11"
                aria-label="Закрыть"
                title="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {gameInfoOpen ? (
        <div
          className="fixed inset-0 z-[65] flex items-end bg-black/55 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setGameInfoOpen(false)}
        >
          <section
            className={`relative w-full rounded-t-3xl border p-4 shadow-2xl sm:mx-auto sm:max-w-2xl sm:rounded-3xl sm:p-6 ${
              isDayPhase || !gameHasStarted
                ? "border-amber-700/16 bg-[#f7eddc] text-stone-900 shadow-[0_22px_60px_rgba(60,44,20,0.18)]"
                : "border-ember-200/15 bg-ink-850 text-stone-100"
            } ${isDayPhase || !gameHasStarted ? "day-phase-theme" : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <p className={`text-sm ${isDayPhase || !gameHasStarted ? "text-stone-500" : "text-stone-400"}`}>{formatDate(game.date)}</p>
              <h2 className={`text-2xl font-bold ${isDayPhase || !gameHasStarted ? "text-stone-900" : "text-stone-50"}`}>{gameDisplayTitle(game)}</h2>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5 sm:gap-2">
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
              className={`mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 ${
                game.status === "finished" ? "xl:grid-cols-3" : "xl:grid-cols-2"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setGameInfoOpen(false);
                  setSetupOpen(true);
                }}
                className="secondary-button w-full"
              >
                <Settings className="h-4 w-4" />
                Setup
              </button>
              <button
                type="button"
                onClick={() => {
                  setGameInfoOpen(false);
                  duplicateSetup();
                }}
                className="secondary-button w-full"
              >
                <Save className="h-4 w-4" />
                Дублировать setup
              </button>
              {game.status === "finished" ? (
                <button
                  type="button"
                  onClick={() => {
                    setGameInfoOpen(false);
                    reopenGame();
                  }}
                  className="secondary-button w-full"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Сделать активной
                </button>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-ember-200/10 bg-black/10 p-3">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setGameInfoOpen(false);
                    setNewPlayerName("");
                    setPlayerFormOpen(true);
                  }}
                  className="secondary-button h-14 w-14 shrink-0 gap-0 px-0 py-0"
                  aria-label="Добавить игрока"
                  title="Добавить игрока"
                >
                  <UserPlus className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGameInfoOpen(false);
                    setTravellerFormOpen(true);
                  }}
                  className="secondary-button h-14 w-14 shrink-0 gap-0 px-0 py-0"
                  aria-label="Добавить Traveller"
                  title="Добавить Traveller"
                >
                  <img src="/token-images/Travellers.png" alt="" className="h-[3.15rem] w-[3.15rem] object-contain" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGameInfoOpen(false);
                    setSpecialFormRoleType("fabled");
                    setSpecialFormOpen(true);
                  }}
                  className="secondary-button h-14 w-14 shrink-0 gap-0 px-0 py-0"
                  aria-label="Добавить Fabled"
                  title="Добавить Fabled"
                >
                  <img src="/token-images/Fabled.png" alt="" className="h-[3.15rem] w-[3.15rem] object-contain" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGameInfoOpen(false);
                    setSpecialFormRoleType("loric");
                    setSpecialFormOpen(true);
                  }}
                  className="secondary-button h-14 w-14 shrink-0 gap-0 px-0 py-0"
                  aria-label="Добавить Loric"
                  title="Добавить Loric"
                >
                  <img src="/token-images/Loric.png" alt="" className="h-[3.15rem] w-[3.15rem] object-contain" />
                </button>
              </div>
            </div>

            {game.finalNotes ? (
              <p className={`mt-4 rounded-2xl border p-4 pr-4 text-sm leading-6 ${
                isDayPhase || !gameHasStarted
                  ? "border-amber-700/14 bg-white/55 text-stone-700"
                  : "border-ember-200/10 bg-black/18 text-stone-300"
              }`}>
                {game.finalNotes}
              </p>
            ) : null}

            <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[95] sm:bottom-5 sm:right-5">
              <button
                type="button"
                onClick={() => setGameInfoOpen(false)}
                className="pointer-events-auto modal-close-button h-11 min-h-0 w-11 shrink-0 gap-0 px-0 py-0"
                aria-label="Закрыть"
                title="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {travellerMechanicsOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end overflow-y-auto bg-black/50 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setTravellerMechanicsOpen(false)}
        >
          <section
            className="w-full max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto rounded-t-3xl border border-amber-900/15 bg-[linear-gradient(180deg,rgba(255,251,244,0.99),rgba(246,232,208,0.99))] p-4 pb-20 text-stone-900 shadow-[0_24px_60px_rgba(76,48,22,0.24)] sm:mx-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-3xl sm:p-6 sm:pb-24"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div>
                <p className="text-sm text-stone-600">{selectedPhase?.title ?? "Партия"}</p>
                <h2 className="text-2xl font-bold text-stone-950">Механики Traveller</h2>
              </div>
            </div>

            {travellerMechanicPlayers.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-amber-900/20 bg-black/5 p-5 text-center text-sm text-stone-600">
                Добавьте Traveller на гримуар, чтобы появились действия его роли.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {getActiveTravellersByRole("beggar").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Beggar</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select
                        value={travellerMechanicsForm.beggarPlayerId}
                        onChange={(event) => updateTravellerMechanicsForm({ beggarPlayerId: event.target.value })}
                        className="field"
                      >
                        <option value="">Кто Beggar?</option>
                        {getActiveTravellersByRole("beggar").map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name} · tokens {travellerMechanics.beggarTokensByPlayerId?.[player.id] ?? 0}
                          </option>
                        ))}
                      </select>
                      <select
                        value={travellerMechanicsForm.beggarDonorId}
                        onChange={(event) => updateTravellerMechanicsForm({ beggarDonorId: event.target.value })}
                        className="field"
                      >
                        <option value="">Кто отдал dead vote?</option>
                        {players.filter((player) => !player.alive).map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={travellerMechanicsForm.beggarDonorTeam}
                        onChange={(event) => updateTravellerMechanicsForm({ beggarDonorTeam: event.target.value as PlayerTeam })}
                        className="field"
                      >
                        <option value="unknown">Alignment неизвестен</option>
                        <option value="good">Good</option>
                        <option value="evil">Evil</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void saveBeggarDonation()}
                        className={travellerMechanicsButtonClass}
                        disabled={travellerMechanicsSaving}
                      >
                        Donate dead vote
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("bureaucrat").length > 0 || getActiveTravellersByRole("thief").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Bureaucrat / Thief</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <select
                        value={travellerMechanicsForm.voteModifierRoleId}
                        onChange={(event) =>
                          updateTravellerMechanicsForm({
                            voteModifierRoleId: event.target.value as "bureaucrat" | "thief",
                            voteModifierTravellerId: "",
                          })
                        }
                        className="field"
                      >
                        {getActiveTravellersByRole("bureaucrat").length > 0 ? <option value="bureaucrat">Bureaucrat: 3 votes</option> : null}
                        {getActiveTravellersByRole("thief").length > 0 ? <option value="thief">Thief: -1 vote</option> : null}
                      </select>
                      <select
                        value={travellerMechanicsForm.voteModifierTravellerId}
                        onChange={(event) => updateTravellerMechanicsForm({ voteModifierTravellerId: event.target.value })}
                        className="field"
                      >
                        <option value="">Traveller</option>
                        {getActiveTravellersByRole(travellerMechanicsForm.voteModifierRoleId).map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={travellerMechanicsForm.voteModifierTargetId}
                        onChange={(event) => updateTravellerMechanicsForm({ voteModifierTargetId: event.target.value })}
                        className="field"
                      >
                        <option value="">Цель</option>
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void saveVoteModifier()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Сохранить голос
                      </button>
                      {currentVoteModifiers.length > 0 ? (
                        <div className="sm:col-span-2 flex flex-wrap gap-1.5 text-xs">
                          {currentVoteModifiers.map((modifier) => (
                            <span key={modifier.id} className="chip">
                              {playersById.get(modifier.targetPlayerId)?.name ?? "Игрок"}: {modifier.voteValue}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("butcher").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Butcher</p>
                    <button
                      type="button"
                      onClick={() => beginVoteDraft("execution")}
                      className={travellerMechanicsButtonClass}
                      disabled={travellerMechanicsSaving || selectedPhase?.type !== "day" || !selectedPhaseExecutionVoteRecords.some((voteRecord) => voteRecord.resultedInExecution)}
                    >
                      Butcher nomination
                    </button>
                    <p className="mt-2 text-xs text-stone-600">
                      Доступно только после первой казни в текущем дне.
                    </p>
                  </section>
                ) : null}

                {getActiveTravellersByRole("gunslinger").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Gunslinger</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <select
                        value={travellerMechanicsForm.gunslingerTravellerId}
                        onChange={(event) => updateTravellerMechanicsForm({ gunslingerTravellerId: event.target.value })}
                        className="field"
                      >
                        <option value="">Gunslinger</option>
                        {getActiveTravellersByRole("gunslinger").map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={travellerMechanicsForm.gunslingerTargetId}
                        onChange={(event) => updateTravellerMechanicsForm({ gunslingerTargetId: event.target.value })}
                        className="field"
                      >
                        <option value="">Кого застрелить?</option>
                        {firstExecutionVoteVoters.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void saveGunslingerShot()}
                        className={travellerMechanicsButtonClass}
                        disabled={travellerMechanicsSaving || !firstExecutionVoteRecord || Boolean(selectedPhase && travellerMechanics.gunslingerShotsByPhaseId?.[selectedPhase.id])}
                      >
                        Gunslinger shot
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("judge").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Judge</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select
                        value={travellerMechanicsForm.judgePlayerId}
                        onChange={(event) => updateTravellerMechanicsForm({ judgePlayerId: event.target.value })}
                        className="field"
                      >
                        <option value="">Judge</option>
                        {getActiveTravellersByRole("judge").map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={travellerMechanicsForm.judgeVoteRecordId}
                        onChange={(event) => updateTravellerMechanicsForm({ judgeVoteRecordId: event.target.value })}
                        className="field"
                      >
                        <option value="">Номинация</option>
                        {selectedPhaseExecutionVoteRecords.map((voteRecord) => (
                          <option key={voteRecord.id} value={voteRecord.id}>
                            {getPlayerOrStorytellerName(voteRecord.nominatorPlayerId)} {"->"} {getPlayerOrStorytellerName(voteRecord.nomineePlayerId)}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void forceJudgeVote("pass")} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Force pass
                      </button>
                      <button type="button" onClick={() => void forceJudgeVote("fail")} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Force fail
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("scapegoat").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Scapegoat</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <select
                        value={travellerMechanicsForm.scapegoatPlayerId}
                        onChange={(event) => updateTravellerMechanicsForm({ scapegoatPlayerId: event.target.value })}
                        className="field"
                      >
                        <option value="">Scapegoat</option>
                        {getActiveTravellersByRole("scapegoat").map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={travellerMechanicsForm.scapegoatVoteRecordId}
                        onChange={(event) => updateTravellerMechanicsForm({ scapegoatVoteRecordId: event.target.value })}
                        className="field"
                      >
                        <option value="">Вместо какой казни?</option>
                        {selectedPhaseExecutionVoteRecords.map((voteRecord) => (
                          <option key={voteRecord.id} value={voteRecord.id}>
                            {getPlayerOrStorytellerName(voteRecord.nomineePlayerId)}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void executeScapegoatInstead()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Execute Scapegoat instead
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("voudon").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Voudon</p>
                    <p className="mt-2 text-sm text-stone-700">
                      Режим активен: за execution голосуют только мёртвые игроки и Voudon, dead votes не тратятся, нужен минимум 1 голос.
                    </p>
                  </section>
                ) : null}

                {getActiveTravellersByRole("bishop").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Bishop</p>
                    <p className="mt-2 text-sm text-stone-700">
                      Номинации игроков заблокированы. В режиме номинации нажмите “Номинирует ведущий”.
                    </p>
                  </section>
                ) : null}

                {getActiveTravellersByRole("bonecollector").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Bone Collector</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <select value={travellerMechanicsForm.boneCollectorPlayerId} onChange={(event) => updateTravellerMechanicsForm({ boneCollectorPlayerId: event.target.value })} className="field">
                        <option value="">Bone Collector</option>
                        {getActiveTravellersByRole("bonecollector").map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                      <select value={travellerMechanicsForm.boneCollectorTargetId} onChange={(event) => updateTravellerMechanicsForm({ boneCollectorTargetId: event.target.value })} className="field">
                        <option value="">Мёртвый игрок</option>
                        {players.filter((player) => !player.alive).map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void saveBoneCollector()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Ability until dusk
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("barista").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Barista</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select value={travellerMechanicsForm.baristaPlayerId} onChange={(event) => updateTravellerMechanicsForm({ baristaPlayerId: event.target.value })} className="field">
                        <option value="">Barista</option>
                        {getActiveTravellersByRole("barista").map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                      <select value={travellerMechanicsForm.baristaTargetId} onChange={(event) => updateTravellerMechanicsForm({ baristaTargetId: event.target.value })} className="field">
                        <option value="">Цель</option>
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                      <select value={travellerMechanicsForm.baristaMode} onChange={(event) => updateTravellerMechanicsForm({ baristaMode: event.target.value as TravellerMechanicsForm["baristaMode"] })} className="field">
                        <option value="sober_healthy_true_info">Sober, healthy, true info</option>
                        <option value="ability_twice">Ability works twice</option>
                      </select>
                      <button type="button" onClick={() => void saveBarista()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Сохранить эффект
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("harlot").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Harlot</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select value={travellerMechanicsForm.harlotPlayerId} onChange={(event) => updateTravellerMechanicsForm({ harlotPlayerId: event.target.value })} className="field">
                        <option value="">Harlot</option>
                        {getActiveTravellersByRole("harlot").map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                      <select value={travellerMechanicsForm.harlotTargetId} onChange={(event) => updateTravellerMechanicsForm({ harlotTargetId: event.target.value })} className="field">
                        <option value="">Живой игрок</option>
                        {players.filter((player) => player.alive).map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                      <label className="inline-flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" checked={travellerMechanicsForm.harlotAccepted} onChange={(event) => updateTravellerMechanicsForm({ harlotAccepted: event.target.checked })} />
                        Игрок согласился
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" checked={travellerMechanicsForm.harlotKillBoth} onChange={(event) => updateTravellerMechanicsForm({ harlotKillBoth: event.target.checked })} />
                        Убить обоих
                      </label>
                      <button type="button" onClick={() => void saveHarlot()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Сохранить Harlot
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("deviant").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Deviant</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select value={travellerMechanicsForm.deviantPlayerId} onChange={(event) => updateTravellerMechanicsForm({ deviantPlayerId: event.target.value })} className="field">
                        <option value="">Deviant</option>
                        {getActiveTravellersByRole("deviant").map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void saveDeviantFunny()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Funny today
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("apprentice").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Apprentice</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select value={travellerMechanicsForm.apprenticePlayerId} onChange={(event) => updateTravellerMechanicsForm({ apprenticePlayerId: event.target.value })} className="field">
                        <option value="">Apprentice</option>
                        {getActiveTravellersByRole("apprentice").map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                      <select value={travellerMechanicsForm.apprenticeAbilityRoleId} onChange={(event) => updateTravellerMechanicsForm({ apprenticeAbilityRoleId: event.target.value })} className="field">
                        <option value="">Полученная способность</option>
                        {characterRoleOptions.filter((role) => role.type === "townsfolk" || role.type === "minion").map((role) => (
                          <option key={role.id} value={role.id}>{getRoleLabel(role.id, roleReferenceRoles)}</option>
                        ))}
                      </select>
                      <select value={travellerMechanicsForm.apprenticeTeam} onChange={(event) => updateTravellerMechanicsForm({ apprenticeTeam: event.target.value as PlayerTeam })} className="field">
                        <option value="unknown">Alignment неизвестен</option>
                        <option value="good">Good</option>
                        <option value="evil">Evil</option>
                      </select>
                      <button type="button" onClick={() => void saveApprenticeAbility()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Сохранить ability
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("matron").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Matron · {matronSwapCount}/3</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <select value={travellerMechanicsForm.matronAPlayerId} onChange={(event) => updateTravellerMechanicsForm({ matronAPlayerId: event.target.value })} className="field">
                        <option value="">Игрок A</option>
                        {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                      <select value={travellerMechanicsForm.matronBPlayerId} onChange={(event) => updateTravellerMechanicsForm({ matronBPlayerId: event.target.value })} className="field">
                        <option value="">Игрок B</option>
                        {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                      <button type="button" onClick={() => void saveMatronSwap()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving || matronSwapCount >= 3}>
                        Swap seats
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-stone-600">Private talks restricted: только соседи.</p>
                  </section>
                ) : null}

                {getActiveTravellersByRole("cacklejack").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Cacklejack</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select value={travellerMechanicsForm.cacklejackPlayerId} onChange={(event) => updateTravellerMechanicsForm({ cacklejackPlayerId: event.target.value })} className="field">
                        <option value="">Cacklejack</option>
                        {getActiveTravellersByRole("cacklejack").map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                      <select value={travellerMechanicsForm.cacklejackImmunePlayerId} onChange={(event) => updateTravellerMechanicsForm({ cacklejackImmunePlayerId: event.target.value })} className="field">
                        <option value="">Immune today</option>
                        {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                      <select value={travellerMechanicsForm.cacklejackChangedPlayerId} onChange={(event) => updateTravellerMechanicsForm({ cacklejackChangedPlayerId: event.target.value })} className="field">
                        <option value="">Кого изменить ночью?</option>
                        {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                      <select value={travellerMechanicsForm.cacklejackNewRoleId} onChange={(event) => updateTravellerMechanicsForm({ cacklejackNewRoleId: event.target.value })} className="field">
                        <option value="">Новая роль</option>
                        {characterRoleOptions.map((role) => <option key={role.id} value={role.id}>{getRoleLabel(role.id, roleReferenceRoles)}</option>)}
                      </select>
                      <button type="button" onClick={() => void saveCacklejack()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Сохранить Cacklejack
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("gangster").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Gangster</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select value={travellerMechanicsForm.gangsterPlayerId} onChange={(event) => updateTravellerMechanicsForm({ gangsterPlayerId: event.target.value })} className="field">
                        <option value="">Gangster</option>
                        {getActiveTravellersByRole("gangster").map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                      <select value={travellerMechanicsForm.gangsterTargetPlayerId} onChange={(event) => updateTravellerMechanicsForm({ gangsterTargetPlayerId: event.target.value })} className="field">
                        <option value="">Кого убить?</option>
                        {getLivingNeighborIds(travellerMechanicsForm.gangsterPlayerId).map((playerId) => (
                          <option key={playerId} value={playerId}>{playersById.get(playerId)?.name ?? "Игрок"}</option>
                        ))}
                      </select>
                      <select value={travellerMechanicsForm.gangsterConsentPlayerId} onChange={(event) => updateTravellerMechanicsForm({ gangsterConsentPlayerId: event.target.value })} className="field">
                        <option value="">Кто согласился?</option>
                        {getLivingNeighborIds(travellerMechanicsForm.gangsterPlayerId).map((playerId) => (
                          <option key={playerId} value={playerId}>{playersById.get(playerId)?.name ?? "Игрок"}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void saveGangsterKill()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving || Boolean(selectedPhase && travellerMechanics.gangsterKillsByPhaseId?.[selectedPhase.id])}>
                        Kill neighbor
                      </button>
                    </div>
                  </section>
                ) : null}

                {getActiveTravellersByRole("gnome").length > 0 ? (
                  <section className={travellerMechanicsSectionClass}>
                    <p className={travellerMechanicsLabelClass}>Gnome</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select value={travellerMechanicsForm.gnomePlayerId} onChange={(event) => updateTravellerMechanicsForm({ gnomePlayerId: event.target.value })} className="field">
                        <option value="">Gnome</option>
                        {getActiveTravellersByRole("gnome").map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                      <select value={travellerMechanicsForm.gnomeAmigoPlayerId} onChange={(event) => updateTravellerMechanicsForm({ gnomeAmigoPlayerId: event.target.value })} className="field">
                        <option value="">Amigo</option>
                        {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                      <button type="button" onClick={() => void saveGnomeAmigo()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Public amigo
                      </button>
                      <select value={travellerMechanicsForm.gnomeNominatorPlayerId} onChange={(event) => updateTravellerMechanicsForm({ gnomeNominatorPlayerId: event.target.value })} className="field">
                        <option value="">Убить номинатора</option>
                        {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                      <button type="button" onClick={() => void saveGnomeKill()} className={travellerMechanicsButtonClass} disabled={travellerMechanicsSaving}>
                        Kill nominator
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>
            )}

            {pageError ? <p className="mt-3 text-sm text-rose-700">{pageError}</p> : null}
            <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[95] sm:bottom-5 sm:right-5">
              <button
                type="button"
                onClick={() => setTravellerMechanicsOpen(false)}
                className="pointer-events-auto modal-close-button h-11 w-11"
                aria-label="Закрыть"
                title="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {nightResultModalOpen && selectedPhase?.type === "night" ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/55 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6" onClick={closeNightResultModal}>
          <section className="w-full rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:max-w-2xl sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div>
              <div>
                <h2 className="text-lg font-semibold text-stone-50">Результат ночи</h2>
                <p className="mt-1 text-sm text-stone-200">
                  Выберите всех игроков, которые умерли этой ночью. Можно никого не выбирать.
                </p>
              </div>
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
            <div>
              <div>
                <h2 className="text-lg font-semibold text-stone-50">
                  {dayDeathEditingNoteId ? "Изменить дневную смерть" : "Человек умер"}
                </h2>
                <p className="mt-1 text-sm text-stone-200">
                  Выберите всех игроков, которые умерли днём, и роль, по которой это могло произойти.
                </p>
              </div>
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
            <div>
              <div>
                <h2 className="text-lg font-semibold text-stone-50">Результат казни</h2>
                <p className="mt-1 text-sm text-stone-200">
                  Выберите, умер ли игрок по казни, или казнь состоялась, но он остался жить.
                </p>
              </div>
            </div>

            {executionPromptNomineeName ? (
              <div className="mt-4 rounded-2xl border border-ember-200/12 bg-black/15 px-4 py-3 text-sm text-stone-100">
                Номинирован: <span className="font-semibold">{executionPromptNomineeName}</span>
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

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeExecutionFinishPrompt}
                className="secondary-button min-h-12 w-full px-4"
                disabled={executionFinishPromptSaving}
              >
                Отмена
              </button>
              {executionFinishPromptOutcome === "died" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void confirmVoteRecordExecution(false)}
                    className="secondary-button min-h-12 w-full px-4"
                    disabled={executionFinishPromptSaving}
                  >
                    Сохранить и в ночь
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmVoteRecordExecution(false, true)}
                    className="secondary-button min-h-12 w-full px-4 sm:col-span-2"
                    disabled={executionFinishPromptSaving}
                  >
                    Казнить и остаться во дне
                  </button>
                  {canExecuteNominator ? (
                    <button
                      type="button"
                      onClick={() => void confirmNominatorExecution()}
                      className="secondary-button min-h-12 w-full px-4 sm:col-span-2"
                      disabled={executionFinishPromptSaving}
                    >
                      Казнить номинатора: {executionPromptNominatorName}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void confirmVoteRecordExecution(true)}
                    className="primary-button min-h-12 w-full sm:col-span-2"
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
                  className="primary-button min-h-12 w-full"
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
            <div>
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Казнь без номинации</h2>
                <p className="mt-1 text-sm text-stone-600">Выберите, кто был казнён в этой дневной фазе.</p>
              </div>
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
                <button type="button" onClick={closeExecutionWithoutNominationModal} className="secondary-button">
                  Закрыть
                </button>
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
            className={`relative w-full rounded-t-3xl border p-4 shadow-2xl sm:mx-auto sm:max-w-xl sm:rounded-3xl sm:p-6 ${
              isDayPhase || !gameHasStarted
                ? "border-amber-700/16 bg-[#f7eddc] shadow-[0_22px_60px_rgba(60,44,20,0.18)]"
                : "border-ember-200/15 bg-ink-850"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5">
              <div>
                <p className={`text-sm ${isDayPhase || !gameHasStarted ? "text-stone-500" : "text-stone-400"}`}>Завершение партии</p>
                <h2 className={`text-2xl font-bold ${isDayPhase || !gameHasStarted ? "text-stone-800" : "text-stone-50"}`}>Итог</h2>
              </div>
            </div>

            <div className="space-y-4 pb-20 sm:pb-16">
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
            </div>

            <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[95] flex items-center gap-2 sm:bottom-5 sm:right-5">
              <button
                type="button"
                onClick={() => setFinishOpen(false)}
                className="pointer-events-auto modal-close-button h-11 min-h-0 w-11 shrink-0 gap-0 px-0 py-0"
                aria-label="Закрыть"
                title="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={finishGame}
                className="pointer-events-auto modal-save-button h-11 min-h-0 w-11 shrink-0 gap-0 px-0 py-0"
                aria-label="Сохранить итог"
                title="Сохранить итог"
              >
                <CheckCircle2 className="h-5 w-5" />
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
