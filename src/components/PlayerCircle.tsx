import clsx from "clsx";
import { ChevronDown, Lock, LockOpen, Plus, Save, Settings2, X } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  GrimoireStyle,
  Note,
  Phase,
  Player,
  PlayerTeam,
  PlayerVoteAvailability,
  ScriptRole,
  TokenPosition,
  VoteDraft,
} from "../types";
import { phaseTitle, sortPhases } from "../utils/dates";
import { getPlayerSetup } from "../utils/playerSetup";
import { defaultFabledRoles, defaultLoricRoles, defaultTravellerRoles, getRoleLabel, mergeScriptRoles, prettifyRoleName } from "../utils/scripts";
import RoleTokenImage from "./RoleTokenImage";
import PlayerToken from "./PlayerToken";
import RolePicker from "./RolePicker";

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
    travellerTeam: PlayerTeam;
    joinedPhaseId?: string;
  }) => Promise<void> | void;
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
  activeFabledIds = [],
  activeLoricIds = [],
  onUpdateSpecialRoles,
  onPlayerClick,
}: PlayerCircleProps) {
  const isSmallViewport = typeof window !== "undefined" && window.innerWidth < 640;
  const defaultMobileTokenScale = 1 / 1.5;
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const regularPlayerCount = players.filter((player) => !player.isTraveller).length;
  const travellerCount = players.filter((player) => player.isTraveller).length;
  const setup = getPlayerSetup(regularPlayerCount);
  const playerTotal = sortedPlayers.length;
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
    () => getEvenlySpacedStadiumPoints(sortedPlayers.length, xRadius, yRadius, offsetRatio),
    [offsetRatio, sortedPlayers.length, xRadius, yRadius],
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
  const [travellerFormOpen, setTravellerFormOpen] = useState(false);
  const [travellerName, setTravellerName] = useState("");
  const [travellerRole, setTravellerRole] = useState("");
  const [travellerTeam, setTravellerTeam] = useState<PlayerTeam>("unknown");
  const [travellerJoinedPhaseId, setTravellerJoinedPhaseId] = useState("");
  const [specialFormOpen, setSpecialFormOpen] = useState(false);
  const [selectedSpecialRoleId, setSelectedSpecialRoleId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const travellerPickerGroups = useMemo(
    () => [
      {
        key: "traveller",
        label: "Traveller",
        options: travellerRoleOptions.map((role) => ({ id: role.id, label: prettifyRoleName(role.id) })),
      },
    ],
    [travellerRoleOptions],
  );
  const specialPickerGroups = useMemo(
    () => [
      {
        key: "fabled",
        label: "Fabled",
        options: specialRoleOptions
          .filter((role) => role.type === "fabled")
          .map((role) => ({ id: role.id, label: prettifyRoleName(role.id) })),
      },
      {
        key: "loric",
        label: "Loric",
        options: specialRoleOptions
          .filter((role) => role.type === "loric")
          .map((role) => ({ id: role.id, label: prettifyRoleName(role.id) })),
      },
    ].filter((group) => group.options.length > 0),
    [specialRoleOptions],
  );

  const layout = {
    maxWidth: playerTotal >= 14
      ? "max-w-[360px] sm:max-w-[520px] lg:max-w-[620px]"
      : playerTotal >= 11
        ? "max-w-[350px] sm:max-w-[500px] lg:max-w-[600px]"
        : "max-w-[390px] sm:max-w-[620px] lg:max-w-[700px]",
    aspect:
      playerTotal >= 14
        ? "aspect-[5/9] sm:aspect-[4/7] lg:aspect-[5/8]"
        : playerTotal >= 11
          ? "aspect-[11/15] sm:aspect-[5/8] lg:aspect-[9/12]"
          : "aspect-square",
    center: density === "dense" ? "h-[64px] w-[64px] p-1.5 sm:h-32 sm:w-32 sm:p-3" : density === "compact" ? "h-[70px] w-[70px] p-1.5 sm:h-36 sm:w-36 sm:p-3.5" : "h-[84px] w-[84px] p-2 sm:h-44 sm:w-44 sm:p-5",
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
  const currentStyle = {
    tokenScale: grimoireStyle?.tokenScale ?? (isSmallViewport ? defaultMobileTokenScale : 1),
    extraTokenScale: grimoireStyle?.extraTokenScale ?? 1,
    nameScale: grimoireStyle?.nameScale ?? 1,
    lockTokens: grimoireStyle?.lockTokens ?? false,
  };
  const canManualArrange = !isVotingMode && !currentStyle.lockTokens;
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const baseHalfTokenPercent = density === "dense" ? 8.5 : density === "compact" ? 10 : 12.5;
  const halfTokenPercent = baseHalfTokenPercent * currentStyle.tokenScale;
  const minimumTokenDistance = Math.max(10, tokenDiameterPercent * currentStyle.tokenScale * 0.72);

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

      if (availability !== "dead_spent") {
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

    if (!trimmedName || !travellerRole) {
      return;
    }

    await onAddTraveller?.({
      name: trimmedName,
      travellerRole,
      travellerTeam,
      joinedPhaseId: travellerJoinedPhaseId || undefined,
    });
    setTravellerName("");
    setTravellerRole("");
    setTravellerTeam("unknown");
    setTravellerJoinedPhaseId("");
    setTravellerFormOpen(false);
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
    setSpecialFormOpen(false);
  };

  const removeSpecialRole = async (roleId: string, roleType: ScriptRole["type"]) => {
    await onUpdateSpecialRoles?.({
      activeFabledIds: roleType === "fabled" ? activeFabledIds.filter((id) => id !== roleId) : activeFabledIds,
      activeLoricIds: roleType === "loric" ? activeLoricIds.filter((id) => id !== roleId) : activeLoricIds,
    });
  };

  return (
    <section className="panel overflow-hidden p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateStyle({ lockTokens: !currentStyle.lockTokens })}
            className={clsx(
              "inline-flex min-h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 transition",
              currentStyle.lockTokens
                ? "border-red-200 bg-red-500/35 text-red-50 shadow-[0_0_18px_rgba(248,113,113,0.35)]"
                : "border-emerald-200 bg-emerald-500/35 text-emerald-50 shadow-[0_0_18px_rgba(52,211,153,0.3)]",
            )}
            aria-label={currentStyle.lockTokens ? "Жетоны залокированы" : "Жетоны разблокированы"}
            title={currentStyle.lockTokens ? "Жетоны залокированы" : "Жетоны разблокированы"}
          >
            {currentStyle.lockTokens ? <Lock className="h-4.5 w-4.5" /> : <LockOpen className="h-4.5 w-4.5" />}
          </button>
          {onUpdateSpecialRoles ? (
            <button type="button" onClick={() => setSpecialFormOpen((current) => !current)} className="secondary-button min-h-10 px-3">
              <Plus className="h-4 w-4" />
              Fabled / Loric
            </button>
          ) : null}
          {onAddTraveller ? (
            <button type="button" onClick={() => setTravellerFormOpen((current) => !current)} className="primary-button min-h-10 px-3">
              <Plus className="h-4 w-4" />
              Traveller
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSettingsOpen((current) => !current)}
            className={clsx(
              "secondary-button min-h-10 w-10 shrink-0 px-0",
              settingsOpen && "border-ember-200/45 bg-ember-200/10 text-ember-100",
            )}
            aria-label={settingsOpen ? "Скрыть настройки жетонов" : "Показать настройки жетонов"}
            title={settingsOpen ? "Скрыть настройки жетонов" : "Показать настройки жетонов"}
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {specialFormOpen ? (
        <div className="mb-4 grid gap-3 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:grid-cols-[1fr_auto_auto]">
          <RolePicker
            value={selectedSpecialRoleId}
            onChange={setSelectedSpecialRoleId}
            groups={specialPickerGroups.map((group) => ({
              ...group,
              options: group.options.filter(
                (role) =>
                  !activeFabledIds.includes(role.id) &&
                  !activeLoricIds.includes(role.id),
              ),
            }))}
            roles={specialRoleOptions}
            placeholder="Выберите Fabled или Loric"
          />
          <button type="button" onClick={() => setSpecialFormOpen(false)} className="secondary-button">
            Отмена
          </button>
          <button type="button" onClick={() => void submitSpecialRole()} className="primary-button">
            Добавить
          </button>
        </div>
      ) : null}

      {travellerFormOpen ? (
        <div className="mb-4 grid gap-3 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:grid-cols-2">
          <input
            value={travellerName}
            onChange={(event) => setTravellerName(event.target.value)}
            className="field"
            placeholder="Имя Traveller"
          />
          <RolePicker
            value={travellerRole}
            onChange={setTravellerRole}
            groups={travellerPickerGroups}
            roles={travellerRoleOptions}
            placeholder="Роль Traveller"
          />
          <select value={travellerTeam} onChange={(event) => setTravellerTeam(event.target.value as PlayerTeam)} className="field">
            <option value="unknown">Команда неизвестна</option>
            <option value="good">Синий / добро</option>
            <option value="evil">Красный / зло</option>
          </select>
          <select value={travellerJoinedPhaseId} onChange={(event) => setTravellerJoinedPhaseId(event.target.value)} className="field">
            <option value="">Фаза прихода</option>
            {sortedPhases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.title || phaseTitle(phase.number, phase.type)}
              </option>
            ))}
          </select>
          <div className="sm:col-span-2 flex gap-2">
            <button type="button" onClick={() => setTravellerFormOpen(false)} className="secondary-button">
              Отмена
            </button>
            <button type="button" onClick={() => void submitTraveller()} className="primary-button">
              <Plus className="h-4 w-4" />
              Добавить Traveller
            </button>
          </div>
        </div>
      ) : null}

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
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-2">
              <span className="label">Размер жетонов</span>
              <input
                type="range"
                min="0.75"
                max="1.35"
                step="0.05"
                value={currentStyle.tokenScale}
                onChange={(event) => updateStyle({ tokenScale: Number(event.target.value) })}
                className="w-full accent-ember-200"
              />
            </label>
            <label className="block space-y-2">
              <span className="label">Доп. жетоны</span>
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                value={currentStyle.extraTokenScale}
                onChange={(event) => updateStyle({ extraTokenScale: Number(event.target.value) })}
                className="w-full accent-ember-200"
              />
            </label>
            <label className="block space-y-2">
              <span className="label">Текст имени</span>
              <input
                type="range"
                min="0.8"
                max="1.5"
                step="0.05"
                value={currentStyle.nameScale}
                onChange={(event) => updateStyle({ nameScale: Number(event.target.value) })}
                className="w-full accent-ember-200"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={`relative mx-auto w-full overflow-visible bg-black/15 ${layout.aspect} ${layout.maxWidth}`}
      >
        {currentPhase ? (
          <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-[225%] sm:-translate-y-[235%]">
            <span className="inline-flex rounded-full border border-ember-100/55 bg-ink-900/95 px-4 py-2 text-sm font-black uppercase tracking-[0.22em] text-ember-100 shadow-[0_0_18px_rgba(242,204,116,0.42),0_0_36px_rgba(242,204,116,0.18),0_12px_24px_rgba(0,0,0,0.35)] sm:px-5 sm:py-2.5 sm:text-lg">
              {currentPhase.title || phaseTitle(currentPhase.number, currentPhase.type)}
            </span>
          </div>
        ) : null}

        {votingStage ? (
          <div
            className="absolute left-1/2 top-1/2 z-20 flex w-[138px] max-w-[74%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2.5 rounded-[24px] border border-ember-100/30 px-3 py-3 text-center shadow-[0_18px_40px_rgba(0,0,0,0.42)] backdrop-blur-sm sm:w-[196px] sm:max-w-[68%] sm:px-4 sm:py-4"
            style={{ backgroundColor: "rgba(53, 53, 57, 0.72)" }}
          >
            <p className="text-xs font-semibold leading-snug text-white sm:text-base">
              {votingStage === "select_nominator"
                ? voteDraft?.voteType === "traveller_exile"
                  ? "Выберите, кто номинировал изгнание"
                  : "Выберите, кто номинировал"
                : votingStage === "select_nominee"
                  ? voteDraft?.voteType === "traveller_exile"
                    ? "Выберите Traveller на изгнание"
                    : "Выберите, кого номинировали"
                  : "Отметьте, кто голосовал"}
            </p>
            {votingStage === "select_voters" ? (
              <div className="flex w-full justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onSaveVoteDraft?.()}
                  disabled={voteSaving}
                  className="primary-button min-h-9 w-9 rounded-2xl px-0 sm:min-h-10 sm:w-10"
                  aria-label="Сохранить голосование"
                  title="Сохранить голосование"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onCancelVoteDraft?.()}
                  className="secondary-button min-h-9 w-9 rounded-2xl px-0 text-white sm:min-h-10 sm:w-10"
                  aria-label="Отменить голосование"
                  title="Отменить голосование"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onCancelVoteDraft?.()}
                className="secondary-button min-h-9 w-9 rounded-2xl px-0 text-white sm:min-h-10 sm:w-10"
                aria-label="Отменить голосование"
                title="Отменить голосование"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className={`absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-veil-500/30 bg-ink-900/90 text-center shadow-inner ${layout.center}`}>
            <div className="w-full max-w-[82%] space-y-2 sm:max-w-[78%]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-1.5 gap-y-0.5 text-[7px] leading-tight sm:gap-x-2.5 sm:text-[11px]">
                <span className="text-left text-sky-100">Горожане</span>
                <strong className="text-sky-100">{setup.townsfolk}</strong>

                <span className="text-left text-sky-200/80">Изгои</span>
                <strong className="text-sky-200">{setup.outsiders}</strong>

                <span className="text-left text-red-100">Присп.</span>
                <strong className="text-red-100">{setup.minions}</strong>

                <span className="text-left text-red-200">Демоны</span>
                <strong className="text-red-200">{setup.demons}</strong>

                {travellerCount > 0 ? (
                  <>
                    <span className="text-left text-amber-100">Travellers</span>
                    <strong className="text-amber-100">{travellerCount}</strong>
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
            </div>
          </div>
        )}

        {sortedPlayers.map((player) => {
          const position = getBasePositionForPlayer(player.id);
          const dx = position.x - 50;
          const dy = position.y - 50;
          const distance = Math.hypot(dx, dy) || 1;
          const inwardVoteMarkerOffset = density === "dense" ? 18 : density === "compact" ? 22 : 26;
          const voteMarkerOffsetX = (-dx / distance) * inwardVoteMarkerOffset;
          const voteMarkerOffsetY = (-dy / distance) * inwardVoteMarkerOffset;
          const noteCount = noteCountByPlayerId.get(player.id) ?? 0;
          const playerRoleId = player.isTraveller ? player.travellerRole ?? player.mainRole : player.mainRole;
          const isMyToken = Boolean((myPlayerId && player.id === myPlayerId) || (!myPlayerId && myRoleId && playerRoleId === myRoleId));
          const voteAvailability = voteAvailabilityByPlayerId?.get(player.id) ?? "alive";
          const canVoteInCurrentSession = voteAvailability !== "dead_spent";
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
                (isSelectableNominator || isSelectableNominee) && "rounded-full ring-2 ring-amber-200/70 ring-offset-4 ring-offset-transparent",
                (isSelectedNominator || isSelectedNominee) && "rounded-full ring-4 ring-amber-300/90 ring-offset-4 ring-offset-transparent shadow-[0_0_24px_rgba(242,204,116,0.45)]",
                (votingStage === "select_voters" && isSelectedVoter) && "rounded-full ring-4 ring-emerald-300/90 ring-offset-4 ring-offset-transparent shadow-[0_0_22px_rgba(74,222,128,0.4)]",
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
                        : "Мертвый игрок: мертвый голос уже потрачен"
                  }
                >
                  <span
                    className={clsx(
                      "flex items-center justify-center rounded-full border shadow-md shadow-black/35",
                      voteMarkerClass,
                      voteAvailability === "alive"
                        ? "border-emerald-200/80 bg-emerald-400/90"
                        : "border-stone-300/35 bg-stone-500/80",
                    )}
                  >
                    {voteAvailability === "dead_available" ? (
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
                tokenScale={currentStyle.tokenScale}
                extraTokenScale={currentStyle.extraTokenScale}
                nameScale={currentStyle.nameScale}
                voteAvailability={voteAvailability}
                onClick={handleTokenClick}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
