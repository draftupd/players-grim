import clsx from "clsx";
import { ChevronDown, Hand, Lock, LockOpen, Plus, Save, Settings2, X } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  GrimoireStyle,
  Note,
  Phase,
  Player,
  PlayerVoteAvailability,
  ScriptRole,
  TokenPosition,
  VoteDraft,
} from "../types";
import { phaseTitle, sortPhases } from "../utils/dates";
import { getPlayerSetup } from "../utils/playerSetup";
import { defaultFabledRoles, defaultLoricRoles, defaultTravellerRoles, getRoleLabel, mergeScriptRoles } from "../utils/scripts";
import { useReferenceData } from "../utils/referenceData";
import RoleTokenImage from "./RoleTokenImage";
import PlayerToken from "./PlayerToken";
import RoleIconGrid from "./RoleIconGrid";

type PlayerCircleProps = {
  players: Player[];
  notes: Note[];
  phases?: Phase[];
  currentPhase?: Phase;
  scriptRoles?: ScriptRole[];
  myPlayerId?: string;
  myRoleId?: string;
  voteDraft?: VoteDraft | null;
  showVoteMarkers?: boolean;
  voteAvailabilityByPlayerId?: ReadonlyMap<string, PlayerVoteAvailability>;
  voteRequirementSummary?: {
    headline: string;
    requiredVotes: number;
    aliveVotes: number;
    deadVotes: number;
    totalVotes: number;
  } | null;
  centerAction?: ReactNode;
  currentBlockPlayerId?: string | null;
  grimoireActions?: ReactNode;
  selectableNominatorIds?: ReadonlySet<string>;
  selectableNomineeIds?: ReadonlySet<string>;
  onToggleVoteVoter?: (playerId: string) => void;
  onSelectVotingPlayer?: (player: Player) => void;
  onSaveVoteDraft?: () => void;
  onCancelVoteDraft?: () => void;
  voteSaving?: boolean;
  customTokenPositions?: Record<string, TokenPosition>;
  onUpdateTokenPosition?: (playerId: string, position: TokenPosition) => Promise<void> | void;
  grimoireStyle?: GrimoireStyle;
  onUpdateGrimoireStyle?: (style: GrimoireStyle) => Promise<void> | void;
  onAddTraveller?: (payload: {
    name: string;
    travellerRole: string;
    travellerTeam: Player["travellerTeam"];
    joinedPhaseId?: string;
  }) => Promise<void> | void;
  travellerFormOpen?: boolean;
  onCloseTravellerForm?: () => void;
  specialFormOpen?: boolean;
  specialFormRoleType?: "fabled" | "loric";
  onCloseSpecialForm?: () => void;
  activeFabledIds?: string[];
  activeLoricIds?: string[];
  onUpdateSpecialRoles?: (payload: { activeFabledIds: string[]; activeLoricIds: string[] }) => Promise<void> | void;
  onPlayerClick: (player: Player) => void;
};

const getStadiumMetrics = (xRadius: number, yRadius: number) => {
  const capRadius = Math.min(xRadius, yRadius);
  const straightHalf = Math.max(0, yRadius - capRadius);
  const quarterArc = (Math.PI * capRadius) / 2;
  const halfArc = Math.PI * capRadius;
  const straightLength = straightHalf * 2;
  const totalLength = quarterArc + straightLength + halfArc + straightLength + quarterArc;
  return { capRadius, straightHalf, quarterArc, halfArc, straightLength, totalLength };
};

const getStadiumPointAtDistance = (distance: number, xRadius: number, yRadius: number) => {
  const { capRadius, straightHalf, quarterArc, halfArc, straightLength, totalLength } =
    getStadiumMetrics(xRadius, yRadius);
  let cursor = ((distance % totalLength) + totalLength) % totalLength;

  if (cursor <= quarterArc) {
    const angle = -Math.PI / 2 + cursor / capRadius;
    return {
      x: 50 + capRadius * Math.cos(angle),
      y: 50 - straightHalf + capRadius * Math.sin(angle),
    };
  }

  cursor -= quarterArc;

  if (cursor <= straightLength) {
    const progress = cursor / straightLength;
    return {
      x: 50 + capRadius,
      y: 50 - straightHalf + progress * straightLength,
    };
  }

  cursor -= straightLength;

  if (cursor <= halfArc) {
    const angle = cursor / capRadius;
    return {
      x: 50 + capRadius * Math.cos(angle),
      y: 50 + straightHalf + capRadius * Math.sin(angle),
    };
  }

  cursor -= halfArc;

  if (cursor <= straightLength) {
    const progress = cursor / straightLength;
    return {
      x: 50 - capRadius,
      y: 50 + straightHalf - progress * straightLength,
    };
  }

  cursor -= straightLength;
  const angle = Math.PI + cursor / capRadius;

  return {
    x: 50 + capRadius * Math.cos(angle),
    y: 50 - straightHalf + capRadius * Math.sin(angle),
  };
};

const getEvenlySpacedStadiumPoints = (count: number, xRadius: number, yRadius: number, offsetRatio = 0) => {
  if (count <= 0) {
    return [];
  }

  const { totalLength } = getStadiumMetrics(xRadius, yRadius);

  if (count === 1) {
    return [getStadiumPointAtDistance(totalLength * offsetRatio, xRadius, yRadius)];
  }

  const offsetLength = totalLength * offsetRatio;
  const step = totalLength / count;
  return Array.from({ length: count }, (_, index) =>
    getStadiumPointAtDistance(offsetLength + step * index, xRadius, yRadius),
  );
};

const shiftTokenPositionsY = (positions: TokenPosition[], offset: number) =>
  positions.map((position) => ({
    ...position,
    y: Math.min(96, Math.max(4, position.y + offset)),
  }));

const shiftTokenPositionsX = (positions: TokenPosition[], offset: number) =>
  positions.map((position) => ({
    ...position,
    x: Math.min(96, Math.max(4, position.x + offset)),
  }));

export default function PlayerCircle({
  players,
  notes,
  phases = [],
  currentPhase,
  scriptRoles = [],
  myPlayerId,
  myRoleId,
  voteDraft = null,
  showVoteMarkers = false,
  voteAvailabilityByPlayerId,
  voteRequirementSummary = null,
  centerAction,
  currentBlockPlayerId = null,
  grimoireActions,
  selectableNominatorIds,
  selectableNomineeIds,
  onToggleVoteVoter,
  onSelectVotingPlayer,
  onSaveVoteDraft,
  onCancelVoteDraft,
  voteSaving = false,
  customTokenPositions,
  onUpdateTokenPosition,
  grimoireStyle,
  onUpdateGrimoireStyle,
  onAddTraveller,
  travellerFormOpen: externalTravellerFormOpen,
  onCloseTravellerForm,
  specialFormOpen: externalSpecialFormOpen,
  specialFormRoleType = "fabled",
  onCloseSpecialForm,
  activeFabledIds = [],
  activeLoricIds = [],
  onUpdateSpecialRoles,
  onPlayerClick,
}: PlayerCircleProps) {
  const isSmallViewport = typeof window !== "undefined" && window.innerWidth < 640;
  const isLargeViewport = typeof window !== "undefined" && window.innerWidth >= 1024;
  const defaultTenPlayerTokenScale = 1 / 1.5;
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const regularPlayerCount = players.filter((player) => !player.isTraveller).length;
  const travellerCount = players.filter((player) => player.isTraveller).length;
  const alivePlayerCount = players.filter((player) => player.alive).length;
  const deadPlayerCount = players.length - alivePlayerCount;
  const setup = getPlayerSetup(regularPlayerCount);
  const playerTotal = sortedPlayers.length;
  const actionRailCenterOffset = grimoireActions ? (isSmallViewport ? 11 : 7.5) : 0;
  const boardCenterX = 50 - actionRailCenterOffset;
  const density = playerTotal >= 14 ? "dense" : playerTotal >= 11 ? "compact" : "normal";
  const tokenDiameterPercent = density === "dense" ? 14.8 : density === "compact" ? 16.2 : 18.6;
  const desiredGapPercent = density === "dense" ? 3.8 : density === "compact" ? 4.6 : 6.2;
  const stadiumRatio = playerTotal >= 14 ? 1.55 : playerTotal >= 11 ? 1.38 : 1;
  const minimumPerimeter = Math.max(playerTotal, 3) * (tokenDiameterPercent + desiredGapPercent);
  const capRadius = minimumPerimeter / (4 * stadiumRatio + (2 * Math.PI) - 4);
  const xRadius = Math.min(34, Math.max(playerTotal <= 6 ? 27 : playerTotal <= 10 ? 30 : 32, capRadius));
  const yRadius = Math.min(49.5, Math.max(xRadius * stadiumRatio, xRadius + 6));
  const offsetRatio = playerTotal >= 12 && playerTotal % 2 === 0 ? 0.5 / playerTotal : 0;
  const defaultTokenPositions = useMemo(
    () => {
      const rawPositions = getEvenlySpacedStadiumPoints(sortedPlayers.length, xRadius, yRadius, offsetRatio);
      const minY = rawPositions.reduce((lowest, position) => Math.min(lowest, position.y), 50);
      const targetMinY = playerTotal >= 14 ? 12 : playerTotal >= 11 ? 14 : playerTotal >= 8 ? 16 : 19;
      return shiftTokenPositionsX(shiftTokenPositionsY(rawPositions, targetMinY - minY), -actionRailCenterOffset);
    },
    [actionRailCenterOffset, offsetRatio, playerTotal, sortedPlayers.length, xRadius, yRadius],
  );
  const defaultPositionsById = useMemo(
    () =>
      Object.fromEntries(
        sortedPlayers.map((player, index) => [player.id, defaultTokenPositions[index] ?? { x: 50, y: 50 }]),
      ) as Record<string, TokenPosition>,
    [defaultTokenPositions, sortedPlayers],
  );
  const [dragPositions, setDragPositions] = useState<Record<string, TokenPosition>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    playerId: string;
    pointerId: number;
    moved: boolean;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const sortedPhases = useMemo(() => sortPhases(phases), [phases]);
  const travellerRoleOptions = useMemo(
    () =>
      mergeScriptRoles(defaultTravellerRoles, scriptRoles.filter((role) => role.type === "traveller")).sort((a, b) =>
        getRoleLabel(a.id).localeCompare(getRoleLabel(b.id), "en"),
      ),
    [scriptRoles],
  );
  const specialRoleOptions = useMemo(
    () =>
      mergeScriptRoles(
        mergeScriptRoles(defaultFabledRoles, defaultLoricRoles),
        scriptRoles.filter((role) => role.type === "fabled" || role.type === "loric"),
      ).sort((a, b) => getRoleLabel(a.id).localeCompare(getRoleLabel(b.id), "en")),
    [scriptRoles],
  );
  const activeSpecialRoles = useMemo(
    () =>
      specialRoleOptions.filter(
        (role) =>
          (role.type === "fabled" && activeFabledIds.includes(role.id)) ||
          (role.type === "loric" && activeLoricIds.includes(role.id)),
      ),
    [activeFabledIds, activeLoricIds, specialRoleOptions],
  );
  const noteCountByPlayerId = useMemo(() => {
    const counts = new Map<string, number>();

    notes.forEach((note) => {
      if (note.kind === "vote_history" || note.kind === "execution") {
        return;
      }

      note.linkedPlayerIds.forEach((playerId) => {
        counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
      });
    });

    return counts;
  }, [notes]);
  const [travellerFormOpenInternal, setTravellerFormOpen] = useState(false);
  const [travellerName, setTravellerName] = useState("");
  const [travellerRole, setTravellerRole] = useState("");
  const [travellerJoinedPhaseId, setTravellerJoinedPhaseId] = useState("");
  const [specialFormOpenInternal, setSpecialFormOpen] = useState(false);
  const [selectedSpecialRoleId, setSelectedSpecialRoleId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [travellerPreviewRoleId, setTravellerPreviewRoleId] = useState("");
  const [specialPreviewRoleId, setSpecialPreviewRoleId] = useState("");
  const [phaseSelectionOpen, setPhaseSelectionOpen] = useState(false);
  const travellerFormOpen = externalTravellerFormOpen ?? travellerFormOpenInternal;
  const specialFormOpen = externalSpecialFormOpen ?? specialFormOpenInternal;
  const { data: referenceData } = useReferenceData();
  const isDayTheme = currentPhase?.type === "day";
  const modalShellClass = clsx(
    "mt-3 w-full max-w-4xl max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto rounded-3xl border p-4 shadow-2xl sm:mt-0 sm:max-h-[92vh] sm:p-5",
    isDayTheme
      ? "border-amber-900/20 bg-[linear-gradient(180deg,rgba(255,250,242,0.99),rgba(245,231,208,0.99))] text-stone-900 shadow-[0_24px_60px_rgba(76,48,22,0.22)]"
      : "border-ember-200/15 bg-ink-850 text-stone-100 shadow-black/40",
  );
  const travellerSummaryClass = isDayTheme ? "text-amber-700" : "text-amber-100";
  const modalTitleClass = isDayTheme ? "text-stone-900" : "text-stone-50";
  const modalMutedClass = isDayTheme ? "text-stone-600" : "text-stone-400";
  const modalBodyTextClass = isDayTheme ? "text-stone-700" : "text-stone-300";
  const modalSurfaceClass = isDayTheme ? "border-amber-900/12 bg-black/5" : "border-ember-200/10 bg-black/10";
  const modalLabelClass = isDayTheme ? "text-amber-900/80" : "text-ember-100/80";
  const modalCloseButtonClass = clsx(
    "min-h-10 w-10 px-0",
    isDayTheme
      ? "border-amber-900/18 bg-white/88 text-stone-800 hover:bg-white"
      : "secondary-button",
  );
  const modalOverlayClass =
    "fixed inset-0 z-[90] flex items-end overflow-y-auto bg-black/45 p-0 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6";
  const modalPreviewOverlayClass =
    "fixed inset-0 z-[100] flex items-end overflow-y-auto bg-black/50 p-0 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6";
  const modalPhaseOverlayClass =
    "fixed inset-0 z-[110] flex items-end overflow-y-auto bg-black/50 p-0 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6";
  const travellerPickerGroups = useMemo(
    () => [
      {
        key: "traveller",
        label: "Traveller",
        roleIds: travellerRoleOptions.map((role) => role.id),
      },
    ],
    [travellerRoleOptions],
  );
  const specialPickerGroups = useMemo(
    () => [
      {
        key: "fabled",
        label: "Fabled",
        roleIds: specialRoleOptions
          .filter((role) => role.type === "fabled")
          .map((role) => role.id),
      },
      {
        key: "loric",
        label: "Loric",
        roleIds: specialRoleOptions
          .filter((role) => role.type === "loric")
          .map((role) => role.id),
      },
    ].filter((group) => group.roleIds.length > 0),
    [specialRoleOptions],
  );
  const filteredSpecialPickerGroups = useMemo(
    () =>
      specialPickerGroups
        .filter((group) => group.key === specialFormRoleType)
        .map((group) => ({
          ...group,
          roleIds: group.roleIds.filter((roleId) => !activeFabledIds.includes(roleId) && !activeLoricIds.includes(roleId)),
        })),
    [activeFabledIds, activeLoricIds, specialFormRoleType, specialPickerGroups],
  );
  const modalRoot = typeof document !== "undefined" ? document.body : null;
  const joinedPhaseTitle =
    sortedPhases.find((phase) => phase.id === travellerJoinedPhaseId)?.title ||
    (travellerJoinedPhaseId ? undefined : currentPhase?.title);
  const travellerPreviewReference = travellerPreviewRoleId
    ? referenceData?.roleMap.get(travellerPreviewRoleId.toLowerCase().replaceAll(" ", "").replaceAll("-", "")) ?? null
    : null;
  const specialPreviewReference = specialPreviewRoleId
    ? referenceData?.roleMap.get(specialPreviewRoleId.toLowerCase().replaceAll(" ", "").replaceAll("-", "")) ?? null
    : null;

  const baseAspectRatio =
    playerTotal >= 14
      ? isSmallViewport
        ? 5 / 9
        : isLargeViewport
          ? 5 / 8
          : 4 / 7
      : playerTotal >= 11
        ? isSmallViewport
          ? 11 / 15
          : isLargeViewport
            ? 9 / 12
            : 5 / 8
        : 1;
  const hasTravellerSummaryRow = travellerCount > 0;
  const hasExpandedCenter = hasTravellerSummaryRow || Boolean(centerAction);
  const layout = {
    maxWidth: playerTotal >= 14
      ? "max-w-[360px] sm:max-w-[520px] lg:max-w-[620px]"
      : playerTotal >= 11
        ? "max-w-[350px] sm:max-w-[500px] lg:max-w-[600px]"
        : "max-w-[390px] sm:max-w-[620px] lg:max-w-[700px]",
    aspectRatio: baseAspectRatio,
    center:
      density === "dense"
        ? hasExpandedCenter
          ? "h-[88px] w-[88px] p-2 sm:h-40 sm:w-40 sm:p-4"
          : "h-[76px] w-[76px] p-2 sm:h-36 sm:w-36 sm:p-3.5"
        : density === "compact"
          ? hasExpandedCenter
            ? "h-[96px] w-[96px] p-2.5 sm:h-44 sm:w-44 sm:p-4.5"
            : "h-[84px] w-[84px] p-2 sm:h-40 sm:w-40 sm:p-4"
          : hasExpandedCenter
            ? "h-[108px] w-[108px] p-3 sm:h-52 sm:w-52 sm:p-6"
            : "h-[96px] w-[96px] p-2.5 sm:h-48 sm:w-48 sm:p-5.5",
    xRadius,
    yRadius,
  };
  const voteMarkerClass =
    density === "dense"
      ? "h-6 w-6 sm:h-8 sm:w-8 lg:h-9 lg:w-9"
      : density === "compact"
        ? "h-7 w-7 sm:h-9 sm:w-9 lg:h-10 lg:w-10"
        : "h-8 w-8 sm:h-10 sm:w-10";
  const innerVoteDotClass =
    density === "dense"
      ? "h-3 w-3 sm:h-4 sm:w-4"
      : density === "compact"
        ? "h-4 w-4 sm:h-5 sm:w-5"
        : "h-4 w-4 sm:h-6 sm:w-6";
  const votingStage = voteDraft?.stage ?? null;
  const isVotingMode = Boolean(voteDraft);
  const tokenScaleRange =
    playerTotal === 10
      ? {
          min: Math.max(0.35, Number((defaultTenPlayerTokenScale - 0.3).toFixed(3))),
          max: Math.min(1.35, Number((defaultTenPlayerTokenScale + 0.3).toFixed(3))),
        }
      : {
          min: 0.75,
          max: 1.35,
        };
  const defaultTokenScale = Number((((tokenScaleRange.min + tokenScaleRange.max) / 2)).toFixed(3));
  const extraTokenScaleRange = { min: 0.75, max: 1.5 };
  const nameScaleRange = { min: 0.8, max: 1.5 };
  const grimoireHeightScaleRange = { min: 0.75, max: 1.5 };
  const defaultExtraTokenScale = Number((((extraTokenScaleRange.min + extraTokenScaleRange.max) / 2)).toFixed(3));
  const defaultNameScale = Number((((nameScaleRange.min + nameScaleRange.max) / 2)).toFixed(3));
  const defaultGrimoireHeightScale = Number((((grimoireHeightScaleRange.min + grimoireHeightScaleRange.max) / 2)).toFixed(3));
  const currentStyle = {
    tokenScale: grimoireStyle?.tokenScale ?? defaultTokenScale,
    extraTokenScale: grimoireStyle?.extraTokenScale ?? defaultExtraTokenScale,
    nameScale: grimoireStyle?.nameScale ?? defaultNameScale,
    grimoireHeightScale: grimoireStyle?.grimoireHeightScale ?? defaultGrimoireHeightScale,
    lockTokens: grimoireStyle?.lockTokens ?? false,
  };
  const visibleTokenScale =
    isSmallViewport && playerTotal <= 9 ? currentStyle.tokenScale / 1.5 : currentStyle.tokenScale;
  const canManualArrange = !isVotingMode && !currentStyle.lockTokens;
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const baseHalfTokenPercent = density === "dense" ? 8.5 : density === "compact" ? 10 : 12.5;
  const halfTokenPercent = baseHalfTokenPercent * visibleTokenScale;
  const minimumTokenDistance = Math.max(10, tokenDiameterPercent * visibleTokenScale * 0.72);

  const clampPosition = (position: TokenPosition): TokenPosition => ({
    x: Math.min(100 - halfTokenPercent, Math.max(halfTokenPercent, position.x)),
    y: Math.min(100 - halfTokenPercent, Math.max(halfTokenPercent, position.y)),
  });

  const getBasePositionForPlayer = (playerId: string) =>
    dragPositions[playerId] ?? customTokenPositions?.[playerId] ?? defaultPositionsById[playerId] ?? { x: 50, y: 50 };

  const resolveTokenOverlap = (playerId: string, position: TokenPosition) => {
    let resolved = clampPosition(position);
    const otherPositions = sortedPlayers
      .filter((player) => player.id !== playerId)
      .map((player) => getBasePositionForPlayer(player.id));

    for (let iteration = 0; iteration < 24; iteration += 1) {
      let adjusted = false;

      for (const otherPosition of otherPositions) {
        const dx = resolved.x - otherPosition.x;
        const dy = resolved.y - otherPosition.y;
        const distance = Math.hypot(dx, dy);

        if (distance >= minimumTokenDistance) {
          continue;
        }

        const safeDistance = distance || 0.001;
        const directionX = distance ? dx / safeDistance : resolved.x >= 50 ? 1 : -1;
        const directionY = distance ? dy / safeDistance : resolved.y >= 50 ? 0.6 : -0.6;
        const push = minimumTokenDistance - safeDistance + 0.25;

        resolved = clampPosition({
          x: resolved.x + directionX * push,
          y: resolved.y + directionY * push,
        });
        adjusted = true;
      }

      if (!adjusted) {
        break;
      }
    }

    return resolved;
  };

  const getPointerPosition = (event: ReactPointerEvent<HTMLDivElement>): TokenPosition | null => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return null;
    }

    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    return clampPosition({ x, y });
  };

  const handlePointerDown = (playerId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canManualArrange) {
      return;
    }

    setDraggingPlayerId(playerId);
    dragStateRef.current = {
      playerId,
      pointerId: event.pointerId,
      moved: false,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (playerId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.playerId !== playerId || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextPosition = getPointerPosition(event);

    if (!nextPosition) {
      return;
    }

    const dragDistance = Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY);

    if (!dragState.moved && dragDistance < 8) {
      return;
    }

    dragStateRef.current = { ...dragState, moved: true };
    setDragPositions((current) => ({ ...current, [playerId]: nextPosition }));
  };

  function handleTokenClick(player: Player) {
    if (suppressClickRef.current === player.id) {
      suppressClickRef.current = null;
      return;
    }

    if (votingStage === "select_nominator") {
      if (selectableNominatorIds?.has(player.id)) {
        onSelectVotingPlayer?.(player);
      }
      return;
    }

    if (votingStage === "select_nominee") {
      if (selectableNomineeIds?.has(player.id)) {
        onSelectVotingPlayer?.(player);
      }
      return;
    }

    if (votingStage === "select_voters") {
      const availability = voteAvailabilityByPlayerId?.get(player.id);

      if (availability !== "dead_spent" && availability !== "unavailable") {
        onToggleVoteVoter?.(player.id);
      }
      return;
    }

    onPlayerClick(player);
  }

  const finishDragging = async (playerId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.playerId !== playerId || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextPosition = getPointerPosition(event);
    dragStateRef.current = null;
    setDraggingPlayerId(null);
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!dragState.moved) {
      handleTokenClick(sortedPlayers.find((player) => player.id === playerId)!);
      return;
    }

    if (nextPosition) {
      const resolvedPosition = resolveTokenOverlap(playerId, nextPosition);
      setDragPositions((current) => ({ ...current, [playerId]: resolvedPosition }));
      suppressClickRef.current = playerId;
      await onUpdateTokenPosition?.(playerId, resolvedPosition);
      window.setTimeout(() => {
        if (suppressClickRef.current === playerId) {
          suppressClickRef.current = null;
        }
      }, 50);
    }
  };

  const updateStyle = (patch: Partial<GrimoireStyle>) => {
    void onUpdateGrimoireStyle?.({
      ...currentStyle,
      ...patch,
    });
  };

  const submitTraveller = async () => {
    const trimmedName = travellerName.trim();
    const fallbackName = travellerRole ? getRoleLabel(travellerRole, travellerRoleOptions) : "Traveller";

    if (!travellerRole) {
      return;
    }

    await onAddTraveller?.({
      name: trimmedName || fallbackName,
      travellerRole,
      travellerTeam: "unknown",
      joinedPhaseId: travellerJoinedPhaseId || currentPhase?.id || undefined,
    });
    setTravellerName("");
    setTravellerRole("");
    setTravellerJoinedPhaseId("");
    setTravellerPreviewRoleId("");
    setPhaseSelectionOpen(false);
    if (onCloseTravellerForm) {
      onCloseTravellerForm();
    } else {
      setTravellerFormOpen(false);
    }
  };

  const submitSpecialRole = async () => {
    const selectedRole = specialRoleOptions.find((role) => role.id === selectedSpecialRoleId);

    if (!selectedRole) {
      return;
    }

    const nextFabledIds =
      selectedRole.type === "fabled" && !activeFabledIds.includes(selectedRole.id)
        ? [...activeFabledIds, selectedRole.id]
        : activeFabledIds;
    const nextLoricIds =
      selectedRole.type === "loric" && !activeLoricIds.includes(selectedRole.id)
        ? [...activeLoricIds, selectedRole.id]
        : activeLoricIds;

    await onUpdateSpecialRoles?.({
      activeFabledIds: nextFabledIds,
      activeLoricIds: nextLoricIds,
    });
    setSelectedSpecialRoleId("");
    setSpecialPreviewRoleId("");
    if (onCloseSpecialForm) {
      onCloseSpecialForm();
    } else {
      setSpecialFormOpen(false);
    }
  };

  const removeSpecialRole = async (roleId: string, roleType: ScriptRole["type"]) => {
    await onUpdateSpecialRoles?.({
      activeFabledIds: roleType === "fabled" ? activeFabledIds.filter((id) => id !== roleId) : activeFabledIds,
      activeLoricIds: roleType === "loric" ? activeLoricIds.filter((id) => id !== roleId) : activeLoricIds,
    });
  };

  return (
    <section className="panel overflow-hidden p-3 sm:p-5">
      {settingsOpen ? (
        <div className="mb-4 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-stone-100">
              <Settings2 className="h-4 w-4" />
              Настройки жетонов
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="secondary-button min-h-9 w-9 px-0"
              aria-label="Скрыть настройки жетонов"
            >
              <ChevronDown className="h-4 w-4 rotate-180" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block space-y-2">
              <span className="label">Размер жетонов</span>
              <input
                type="range"
                min={tokenScaleRange.min}
                max={tokenScaleRange.max}
                step="0.065"
                value={currentStyle.tokenScale}
                onChange={(event) => updateStyle({ tokenScale: Number(event.target.value) })}
                className="w-full accent-ember-200"
              />
            </label>
            <label className="block space-y-2">
              <span className="label">Доп. жетоны</span>
              <input
                type="range"
                min={extraTokenScaleRange.min}
                max={extraTokenScaleRange.max}
                step="0.065"
                value={currentStyle.extraTokenScale}
                onChange={(event) => updateStyle({ extraTokenScale: Number(event.target.value) })}
                className="w-full accent-ember-200"
              />
            </label>
            <label className="block space-y-2">
              <span className="label">Текст имени</span>
              <input
                type="range"
                min={nameScaleRange.min}
                max={nameScaleRange.max}
                step="0.05"
                value={currentStyle.nameScale}
                onChange={(event) => updateStyle({ nameScale: Number(event.target.value) })}
                className="w-full accent-ember-200"
              />
            </label>
            <label className="block space-y-2">
              <span className="label">Высота гримуара</span>
              <input
                type="range"
                min={grimoireHeightScaleRange.min}
                max={grimoireHeightScaleRange.max}
                step="0.1"
                value={currentStyle.grimoireHeightScale}
                onChange={(event) => updateStyle({ grimoireHeightScale: Number(event.target.value) })}
                className="w-full accent-ember-200"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={`relative mx-auto w-full overflow-visible bg-black/15 ${layout.maxWidth}`}
        style={{ aspectRatio: layout.aspectRatio / currentStyle.grimoireHeightScale }}
      >
        <div className="absolute right-1.5 top-1.5 z-30 flex flex-wrap gap-1.5 sm:right-2.5 sm:top-2.5 sm:gap-2">
          <button
            type="button"
            onClick={() => updateStyle({ lockTokens: !currentStyle.lockTokens })}
            className={clsx(
              "inline-flex min-h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition sm:min-h-9 sm:w-9",
              currentStyle.lockTokens
                ? "border-red-200 bg-red-500/35 text-red-50 shadow-[0_0_18px_rgba(248,113,113,0.35)]"
                : "border-emerald-200 bg-emerald-500/35 text-emerald-50 shadow-[0_0_18px_rgba(52,211,153,0.3)]",
            )}
            aria-label={currentStyle.lockTokens ? "Жетоны залокированы" : "Жетоны разблокированы"}
            title={currentStyle.lockTokens ? "Жетоны залокированы" : "Жетоны разблокированы"}
          >
            {currentStyle.lockTokens ? <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <LockOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((current) => !current)}
            className={clsx(
              "secondary-button min-h-8 w-8 shrink-0 rounded-lg px-0 sm:min-h-9 sm:w-9",
              settingsOpen && "border-ember-200/45 bg-ember-200/10 text-ember-100",
            )}
            aria-label={settingsOpen ? "Скрыть настройки жетонов" : "Показать настройки жетонов"}
            title={settingsOpen ? "Скрыть настройки жетонов" : "Показать настройки жетонов"}
          >
            <Settings2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>

        {currentPhase ? (
          <div className="absolute left-1.5 top-1.5 z-20 sm:left-2.5 sm:top-2.5">
            <span className="inline-flex rounded-full border border-ember-100/45 bg-ink-900/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white/90 shadow-[0_0_10px_rgba(242,204,116,0.24),0_8px_18px_rgba(0,0,0,0.24)] sm:px-4 sm:py-2 sm:text-sm">
              {currentPhase.title || phaseTitle(currentPhase.number, currentPhase.type)}
            </span>
          </div>
        ) : null}

        {votingStage ? (
          <div
            className="absolute top-1/2 z-20 flex w-[112px] max-w-[62%] -translate-x-1/2 -translate-y-[44%] flex-col items-center gap-1 rounded-[20px] border border-ember-100/30 px-2 py-2 text-center shadow-[0_18px_40px_rgba(0,0,0,0.42)] backdrop-blur-sm sm:w-[154px] sm:max-w-[56%] sm:gap-1.5 sm:px-2.5 sm:py-2.5"
            style={{ left: `${boardCenterX}%`, backgroundColor: "rgba(53, 53, 57, 0.72)" }}
          >
            {votingStage === "select_voters" && voteRequirementSummary ? (
              <>
                <p className="flex items-center gap-1 text-[12px] font-semibold leading-none text-white sm:text-[14px]">
                  <span>Нужно {voteRequirementSummary.requiredVotes}</span>
                  <Hand className="h-3.5 w-3.5 text-amber-200 sm:h-4 sm:w-4" />
                </p>
                <span className="inline-flex min-w-6 items-center justify-center rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[12px] font-semibold leading-none text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] sm:min-w-7 sm:text-[13px]">
                  {voteDraft?.selectedVoterIds.length ?? 0}
                </span>
              </>
            ) : (
              <p className="text-[10px] font-semibold leading-[1.2] text-white sm:text-[13px]">
                {votingStage === "select_nominator"
                  ? voteDraft?.voteType === "traveller_exile"
                    ? "Кто изгоняет"
                    : "Кто номинировал"
                  : "Кого номинировали"}
              </p>
            )}
            {votingStage === "select_voters" ? (
              <div className="mt-0.5 flex w-full justify-center gap-1">
                <button
                  type="button"
                  onClick={() => onSaveVoteDraft?.()}
                  disabled={voteSaving}
                  className="primary-button min-h-7 w-7 rounded-xl px-0 sm:min-h-8 sm:w-8"
                  aria-label="Сохранить голосование"
                  title="Сохранить голосование"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCancelVoteDraft?.()}
                  className="secondary-button min-h-7 w-7 rounded-xl px-0 text-white sm:min-h-8 sm:w-8"
                  aria-label="Отменить голосование"
                  title="Отменить голосование"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onCancelVoteDraft?.()}
                className="secondary-button min-h-7 w-7 rounded-xl px-0 text-white sm:min-h-8 sm:w-8"
                aria-label="Отменить голосование"
                title="Отменить голосование"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div
            className={`absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-veil-500/30 bg-ink-900/92 text-center shadow-inner ${layout.center}`}
            style={{ left: `${boardCenterX}%` }}
          >
            <div className="w-full max-w-[84%] space-y-1.5 sm:max-w-[80%] sm:space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 border-b border-veil-500/20 pb-1 text-[8px] font-semibold leading-tight sm:gap-x-2.5 sm:pb-1.5 sm:text-[12px]">
                <span className="text-left text-emerald-200">Живые</span>
                <strong className="text-emerald-200">{alivePlayerCount}</strong>

                <span className="text-left text-stone-400">Мертвые</span>
                <strong className="text-stone-300">{deadPlayerCount}</strong>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 text-[8px] font-medium leading-tight sm:gap-x-2.5 sm:text-[12px]">
                <span className="text-left text-blue-700">Горожане</span>
                <strong className="text-blue-700">{setup.townsfolk}</strong>

                <span className="text-left text-blue-500">Изгои</span>
                <strong className="text-blue-500">{setup.outsiders}</strong>

                <span className="text-left text-rose-100">Присп.</span>
                <strong className="text-rose-100">{setup.minions}</strong>

                <span className="text-left text-red-100">Демоны</span>
                <strong className="text-red-100">{setup.demons}</strong>

                {travellerCount > 0 ? (
                  <>
                    <span className={clsx("text-left", travellerSummaryClass)}>Travellers</span>
                    <strong className={travellerSummaryClass}>{travellerCount}</strong>
                  </>
                ) : null}
              </div>

              {activeSpecialRoles.length > 0 ? (
                <div className="flex max-w-full flex-wrap justify-center gap-1.5 pt-1">
                  {activeSpecialRoles.map((role) => (
                    <span
                      key={role.id}
                      className={clsx(
                        "inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-[6px] font-semibold sm:px-2 sm:py-1 sm:text-[10px]",
                        role.type === "fabled"
                          ? "border-violet-200/35 bg-violet-950/50 text-violet-100"
                          : "border-emerald-200/35 bg-emerald-950/50 text-emerald-100",
                      )}
                    >
                      <RoleTokenImage
                        roleId={role.id}
                        roles={specialRoleOptions}
                        className="h-4 w-4 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/20 sm:h-5 sm:w-5"
                        imageClassName="h-full w-full object-cover"
                      />
                      <span className="max-w-[56px] truncate sm:max-w-[84px]">{getRoleLabel(role.id, specialRoleOptions)}</span>
                      <button
                        type="button"
                        onClick={() => void removeSpecialRole(role.id, role.type)}
                        className="rounded-full p-[1px] text-current opacity-80 transition hover:opacity-100"
                        aria-label={`Убрать ${getRoleLabel(role.id, specialRoleOptions)}`}
                      >
                        <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              {centerAction ? <div className="pt-0.5 sm:pt-1">{centerAction}</div> : null}
            </div>
          </div>
        )}

        {grimoireActions ? (
          <div className="absolute bottom-1.5 right-1.5 z-30 flex flex-col items-end gap-1 sm:bottom-2.5 sm:right-2.5 sm:gap-1.5">
            {grimoireActions}
          </div>
        ) : null}

        {sortedPlayers.map((player) => {
          const position = getBasePositionForPlayer(player.id);
          const dx = position.x - boardCenterX;
          const dy = position.y - 50;
          const distance = Math.hypot(dx, dy) || 1;
          const inwardVoteMarkerOffset = density === "dense" ? 18 : density === "compact" ? 22 : 26;
          const voteMarkerOffsetX = (-dx / distance) * inwardVoteMarkerOffset;
          const voteMarkerOffsetY = (-dy / distance) * inwardVoteMarkerOffset;
          const noteCount = noteCountByPlayerId.get(player.id) ?? 0;
          const playerRoleId = player.isTraveller ? player.travellerRole ?? player.mainRole : player.mainRole;
          const isMyToken = Boolean((myPlayerId && player.id === myPlayerId) || (!myPlayerId && myRoleId && playerRoleId === myRoleId));
          const voteAvailability = voteAvailabilityByPlayerId?.get(player.id) ?? "alive";
          const canVoteInCurrentSession = voteAvailability !== "dead_spent" && voteAvailability !== "unavailable";
          const isSelectedVoter = voteDraft?.selectedVoterIds.includes(player.id) ?? false;
          const isSelectableNominator = votingStage === "select_nominator" && Boolean(selectableNominatorIds?.has(player.id));
          const isSelectableNominee = votingStage === "select_nominee" && Boolean(selectableNomineeIds?.has(player.id));
          const isSelectedNominator = voteDraft?.nominatorPlayerId === player.id;
          const isSelectedNominee = voteDraft?.nomineePlayerId === player.id;

          return (
            <div
              key={player.id}
              className={clsx(
                "absolute -translate-x-1/2 -translate-y-1/2",
                isSelectableNominator && "rounded-full ring-2 ring-violet-300/70 ring-offset-4 ring-offset-transparent",
                isSelectableNominee && "rounded-full ring-2 ring-amber-800/60 ring-offset-4 ring-offset-transparent",
                isSelectedNominator && "rounded-full ring-4 ring-violet-400/90 ring-offset-4 ring-offset-transparent shadow-[0_0_24px_rgba(167,139,250,0.45)]",
                isSelectedNominee && "rounded-full ring-4 ring-amber-800/90 ring-offset-4 ring-offset-transparent shadow-[0_0_24px_rgba(146,64,14,0.42)]",
                canManualArrange ? "cursor-grab active:cursor-grabbing touch-none" : "",
              )}
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                zIndex: draggingPlayerId === player.id ? 40 : 10,
              }}
              onPointerDown={(event) => handlePointerDown(player.id, event)}
              onPointerMove={(event) => handlePointerMove(player.id, event)}
              onPointerUp={(event) => {
                void finishDragging(player.id, event);
              }}
              onPointerCancel={(event) => {
                void finishDragging(player.id, event);
              }}
            >
              {votingStage === "select_voters" && isSelectedVoter ? (
                <span
                  className="pointer-events-none absolute inset-[-9px] z-0 rounded-full border-[3px] border-emerald-400 shadow-[0_0_18px_rgba(34,197,94,0.38)] sm:inset-[-10px] sm:border-[3px] sm:shadow-[0_0_20px_rgba(34,197,94,0.42)]"
                  aria-hidden="true"
                />
              ) : null}

              {showVoteMarkers ? (
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 z-10"
                  style={{
                    transform: `translate(calc(-50% + ${voteMarkerOffsetX}px), calc(-50% + ${voteMarkerOffsetY}px))`,
                  }}
                  title={
                    voteAvailability === "alive"
                      ? "Живой игрок: голосует без ограничений"
                      : voteAvailability === "dead_available"
                        ? "Мертвый игрок: мертвый голос еще доступен"
                        : voteAvailability === "dead_spent"
                          ? "Мертвый игрок: мертвый голос уже потрачен"
                          : "Этот игрок сейчас не может голосовать"
                  }
                >
                  <span
                    className={clsx(
                      "relative flex items-center justify-center rounded-full border shadow-md shadow-black/35",
                      voteMarkerClass,
                      voteAvailability === "alive"
                        ? "border-emerald-200/80 bg-emerald-400/90"
                        : voteAvailability === "unavailable"
                          ? "border-stone-200/25 bg-stone-800/75"
                          : "border-stone-300/35 bg-stone-500/80",
                    )}
                  >
                    {isSelectedVoter ? (
                      <span className={clsx("rounded-full bg-emerald-100/95", innerVoteDotClass)} />
                    ) : voteAvailability === "dead_available" ? (
                      <span className={clsx("rounded-full bg-red-400", innerVoteDotClass)} />
                    ) : null}
                  </span>
                </div>
              ) : null}

              <PlayerToken
                player={player}
                noteCount={noteCount}
                scriptRoles={scriptRoles}
                isMyToken={isMyToken}
                density={density}
                disabled={false}
                tokenScale={visibleTokenScale}
                extraTokenScale={currentStyle.extraTokenScale}
                nameScale={currentStyle.nameScale}
                voteAvailability={voteAvailability}
                isOnBlock={currentBlockPlayerId === player.id}
                onClick={handleTokenClick}
              />
            </div>
          );
        })}
      </div>

      {specialFormOpen && modalRoot
        ? createPortal(
            <div
              className={modalOverlayClass}
              onClick={() => {
                if (onCloseSpecialForm) {
                  onCloseSpecialForm();
                } else {
                  setSpecialFormOpen(false);
                }
              }}
            >
              <section className={modalShellClass} onClick={(event) => event.stopPropagation()}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className={clsx("text-2xl font-bold", modalTitleClass)}>
                      {specialFormRoleType === "loric" ? "Добавить Loric" : "Добавить Fabled"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onCloseSpecialForm) {
                        onCloseSpecialForm();
                      } else {
                        setSpecialFormOpen(false);
                      }
                    }}
                    className={modalCloseButtonClass}
                    aria-label="Закрыть"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-4">
                  <RoleIconGrid
                    groups={filteredSpecialPickerGroups}
                    roles={specialRoleOptions}
                    selectedRoleId={selectedSpecialRoleId}
                    onSelect={(roleId) => {
                      setSelectedSpecialRoleId(roleId);
                      setSpecialPreviewRoleId(roleId);
                    }}
                    columnsClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
                    iconClassName="h-14 w-14 sm:h-16 sm:w-16"
                    roleLabelClassName={isDayTheme ? "text-stone-800" : "text-stone-100"}
                    showGroupLabel={false}
                  />
                  {filteredSpecialPickerGroups[0]?.roleIds.length === 0 ? (
                    <p className={clsx("text-sm", modalMutedClass)}>
                      Все {specialFormRoleType === "loric" ? "лорики" : "фэйблы"} уже добавлены.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>,
            modalRoot,
          )
        : null}

      {travellerFormOpen && modalRoot
        ? createPortal(
            <div
              className={modalOverlayClass}
              onClick={() => {
                if (onCloseTravellerForm) {
                  onCloseTravellerForm();
                } else {
                  setTravellerFormOpen(false);
                }
              }}
            >
              <section className={modalShellClass} onClick={(event) => event.stopPropagation()}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className={clsx("text-2xl font-bold", modalTitleClass)}>Добавить Traveller</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onCloseTravellerForm) {
                        onCloseTravellerForm();
                      } else {
                        setTravellerFormOpen(false);
                      }
                    }}
                    className={modalCloseButtonClass}
                    aria-label="Закрыть"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={travellerName}
                    onChange={(event) => setTravellerName(event.target.value)}
                    className="field"
                    placeholder="Имя Traveller"
                  />
                  <div className="sm:col-span-2 space-y-3">
                    <RoleIconGrid
                      groups={travellerPickerGroups}
                      roles={travellerRoleOptions}
                      selectedRoleId={travellerRole}
                      onSelect={(roleId) => {
                        setTravellerRole(roleId);
                        setTravellerPreviewRoleId(roleId);
                      }}
                      columnsClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
                      iconClassName="h-14 w-14 sm:h-16 sm:w-16"
                      roleLabelClassName={isDayTheme ? "text-stone-800" : "text-stone-100"}
                      showGroupLabel={false}
                    />
                  </div>
                </div>
              </section>
            </div>,
            modalRoot,
          )
        : null}

      {travellerPreviewRoleId && modalRoot
        ? createPortal(
            <div
              className={modalPreviewOverlayClass}
              onClick={() => {
                setTravellerPreviewRoleId("");
                setPhaseSelectionOpen(false);
              }}
            >
              <section className={clsx(modalShellClass, "max-w-2xl")} onClick={(event) => event.stopPropagation()}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <RoleTokenImage
                      roleId={travellerPreviewRoleId}
                      roles={travellerRoleOptions}
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-ember-200/20 bg-white/90"
                      imageClassName="h-full w-full object-cover"
                    />
                    <div>
                      <h3 className={clsx("text-2xl font-bold", modalTitleClass)}>
                        {travellerPreviewReference?.name ?? getRoleLabel(travellerPreviewRoleId, travellerRoleOptions)}
                      </h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTravellerPreviewRoleId("");
                      setPhaseSelectionOpen(false);
                    }}
                    className={modalCloseButtonClass}
                    aria-label="Закрыть"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className={clsx("rounded-2xl border p-4", modalSurfaceClass)}>
                    <p className={clsx("text-sm leading-6", modalBodyTextClass)}>
                      {travellerPreviewReference?.ability || "Для этой роли пока нет загруженного текста способности."}
                    </p>
                  </div>
                  <input
                    value={travellerName}
                    onChange={(event) => setTravellerName(event.target.value)}
                    className="field"
                    placeholder="Имя Traveller"
                  />
                  <button
                    type="button"
                    onClick={() => setPhaseSelectionOpen(true)}
                    className={clsx(
                      "field flex items-center justify-between text-left",
                      isDayTheme && "border-amber-900/15 bg-white/90 text-stone-900",
                    )}
                  >
                    <span>{joinedPhaseTitle ? `Фаза прихода: ${joinedPhaseTitle}` : "Фаза прихода"}</span>
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  </button>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => void submitTraveller()} className="primary-button">
                      <Plus className="h-4 w-4" />
                      Добавить Traveller
                    </button>
                  </div>
                </div>
              </section>
            </div>,
            modalRoot,
          )
        : null}

      {specialPreviewRoleId && modalRoot
        ? createPortal(
            <div
              className={modalPreviewOverlayClass}
              onClick={() => setSpecialPreviewRoleId("")}
            >
              <section className={clsx(modalShellClass, "max-w-2xl")} onClick={(event) => event.stopPropagation()}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <RoleTokenImage
                      roleId={specialPreviewRoleId}
                      roles={specialRoleOptions}
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-ember-200/20 bg-white/90"
                      imageClassName="h-full w-full object-cover"
                    />
                    <div>
                      <h3 className={clsx("text-2xl font-bold", modalTitleClass)}>
                        {specialPreviewReference?.name ?? getRoleLabel(specialPreviewRoleId, specialRoleOptions)}
                      </h3>
                    </div>
                  </div>
                  <button type="button" onClick={() => setSpecialPreviewRoleId("")} className={modalCloseButtonClass} aria-label="Закрыть">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className={clsx("rounded-2xl border p-4", modalSurfaceClass)}>
                    <p className={clsx("text-sm leading-6", modalBodyTextClass)}>
                      {specialPreviewReference?.ability || "Для этой роли пока нет загруженного текста способности."}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => void submitSpecialRole()} className="primary-button">
                      Добавить
                    </button>
                  </div>
                </div>
              </section>
            </div>,
            modalRoot,
          )
        : null}

      {phaseSelectionOpen && modalRoot
        ? createPortal(
            <div
              className={modalPhaseOverlayClass}
              onClick={() => setPhaseSelectionOpen(false)}
            >
              <section className={clsx(modalShellClass, "max-w-xl")} onClick={(event) => event.stopPropagation()}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className={clsx("text-2xl font-bold", modalTitleClass)}>Фаза прихода</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhaseSelectionOpen(false)}
                    className={modalCloseButtonClass}
                    aria-label="Закрыть"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {sortedPhases.map((phase) => (
                    <button
                      key={phase.id}
                      type="button"
                      onClick={() => {
                        setTravellerJoinedPhaseId(phase.id);
                        setPhaseSelectionOpen(false);
                      }}
                      className={clsx(
                        "secondary-button w-full justify-start",
                        travellerJoinedPhaseId === phase.id && "border-ember-200/45 bg-ember-200/10",
                      )}
                    >
                      {phase.title || phaseTitle(phase.number, phase.type)}
                    </button>
                  ))}
                </div>
              </section>
            </div>,
            modalRoot,
          )
        : null}
    </section>
  );
}
