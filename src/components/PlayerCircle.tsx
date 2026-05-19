import clsx from "clsx";
import { Plus, X } from "lucide-react";
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
import { defaultFabledRoles, defaultLoricRoles, defaultTravellerRoles, mergeScriptRoles } from "../utils/scripts";
import PlayerToken from "./PlayerToken";

type PlayerCircleProps = {
  players: Player[];
  notes: Note[];
  phases?: Phase[];
  scriptRoles?: ScriptRole[];
  myPlayerId?: string;
  myRoleId?: string;
  voteDraft?: VoteDraft | null;
  showVoteMarkers?: boolean;
  voteAvailabilityByPlayerId?: ReadonlyMap<string, PlayerVoteAvailability>;
  onToggleVoteVoter?: (playerId: string) => void;
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

const getChordSpacedStadiumPoints = (
  count: number,
  xRadius: number,
  yRadius: number,
  offsetRatio = 0,
) => {
  if (count <= 0) {
    return [];
  }

  const { totalLength } = getStadiumMetrics(xRadius, yRadius);

  if (count === 1) {
    return [getStadiumPointAtDistance(totalLength * offsetRatio, xRadius, yRadius)];
  }

  const offsetLength = totalLength * offsetRatio;
  const averageStep = totalLength / count;
  const pointAt = (distance: number) => getStadiumPointAtDistance(distance, xRadius, yRadius);

  const advanceByChord = (startDistance: number, chordLength: number) => {
    const startPoint = pointAt(startDistance);
    let low = 0;
    let high = averageStep * 1.8;

    for (let iteration = 0; iteration < 28; iteration += 1) {
      const mid = (low + high) / 2;
      const nextPoint = pointAt(startDistance + mid);
      const distance = Math.hypot(nextPoint.x - startPoint.x, nextPoint.y - startPoint.y);

      if (distance < chordLength) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return startDistance + high;
  };

  const totalAdvanceForChord = (chordLength: number) => {
    let cursor = offsetLength;

    for (let index = 1; index < count; index += 1) {
      cursor = advanceByChord(cursor, chordLength);
    }

    return cursor - offsetLength;
  };

  let lowChord = averageStep * 0.5;
  let highChord = averageStep * 1.1;

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const midChord = (lowChord + highChord) / 2;
    const coveredLength = totalAdvanceForChord(midChord);

    if (coveredLength < totalLength) {
      lowChord = midChord;
    } else {
      highChord = midChord;
    }
  }

  const chordLength = lowChord;
  const points = [pointAt(offsetLength)];
  let cursor = offsetLength;

  for (let index = 1; index < count; index += 1) {
    cursor = advanceByChord(cursor, chordLength);
    points.push(pointAt(cursor));
  }

  return points;
};

export default function PlayerCircle({
  players,
  notes,
  phases = [],
  scriptRoles = [],
  myPlayerId,
  myRoleId,
  voteDraft = null,
  showVoteMarkers = false,
  voteAvailabilityByPlayerId,
  onToggleVoteVoter,
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
    () => getChordSpacedStadiumPoints(sortedPlayers.length, xRadius, yRadius, offsetRatio),
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
  } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const sortedPhases = useMemo(() => sortPhases(phases), [phases]);
  const travellerRoleOptions = useMemo(
    () => mergeScriptRoles(defaultTravellerRoles, scriptRoles.filter((role) => role.type === "traveller")),
    [scriptRoles],
  );
  const specialRoleOptions = useMemo(
    () =>
      mergeScriptRoles(
        mergeScriptRoles(defaultFabledRoles, defaultLoricRoles),
        scriptRoles.filter((role) => role.type === "fabled" || role.type === "loric"),
      ),
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
  const [travellerFormOpen, setTravellerFormOpen] = useState(false);
  const [travellerName, setTravellerName] = useState("");
  const [travellerRole, setTravellerRole] = useState("");
  const [travellerTeam, setTravellerTeam] = useState<PlayerTeam>("unknown");
  const [travellerJoinedPhaseId, setTravellerJoinedPhaseId] = useState("");
  const [specialFormOpen, setSpecialFormOpen] = useState(false);
  const [selectedSpecialRoleId, setSelectedSpecialRoleId] = useState("");

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
      ? "h-3 w-3 sm:h-4 sm:w-4 lg:h-4.5 lg:w-4.5"
      : density === "compact"
        ? "h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 lg:h-5 lg:w-5"
        : "h-4 w-4 sm:h-5 sm:w-5";
  const innerVoteDotClass =
    density === "dense"
      ? "h-1.5 w-1.5 sm:h-2 sm:w-2"
      : density === "compact"
        ? "h-2 w-2 sm:h-2.5 sm:w-2.5"
        : "h-2 w-2 sm:h-3 sm:w-3";
  const votingCheckboxClass =
    density === "dense"
      ? "h-4 w-4 sm:h-5 sm:w-5"
      : density === "compact"
        ? "h-4.5 w-4.5 sm:h-5 sm:w-5"
        : "h-5 w-5 sm:h-6 sm:w-6";
  const isVotingMode = Boolean(voteDraft && onToggleVoteVoter);
  const canManualArrange = !isVotingMode && !showVoteMarkers;
  const currentStyle = grimoireStyle ?? {
    tokenScale: 1,
    extraTokenScale: 1,
    nameScale: 1,
  };
  const halfTokenPercent = density === "dense" ? 8.5 : density === "compact" ? 10 : 12.5;

  const clampPosition = (position: TokenPosition): TokenPosition => ({
    x: Math.min(100 - halfTokenPercent, Math.max(halfTokenPercent, position.x)),
    y: Math.min(100 - halfTokenPercent, Math.max(halfTokenPercent, position.y)),
  });

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

    dragStateRef.current = {
      playerId,
      pointerId: event.pointerId,
      moved: false,
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

    dragStateRef.current = { ...dragState, moved: true };
    setDragPositions((current) => ({ ...current, [playerId]: nextPosition }));
  };

  const finishDragging = async (playerId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.playerId !== playerId || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextPosition = getPointerPosition(event);
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!dragState.moved) {
      onPlayerClick(sortedPlayers.find((player) => player.id === playerId)!);
      return;
    }

    if (nextPosition) {
      setDragPositions((current) => ({ ...current, [playerId]: nextPosition }));
      suppressClickRef.current = playerId;
      await onUpdateTokenPosition?.(playerId, nextPosition);
      window.setTimeout(() => {
        if (suppressClickRef.current === playerId) {
          suppressClickRef.current = null;
        }
      }, 50);
    }
  };

  const handleTokenClick = (player: Player) => {
    if (suppressClickRef.current === player.id) {
      suppressClickRef.current = null;
      return;
    }

    onPlayerClick(player);
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
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-50">Гримуар</h2>
          <p className="text-sm text-stone-400">
            {regularPlayerCount} игроков{travellerCount > 0 ? ` + ${travellerCount} Traveller` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      {specialFormOpen ? (
        <div className="mb-4 grid gap-3 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:grid-cols-[1fr_auto_auto]">
          <select value={selectedSpecialRoleId} onChange={(event) => setSelectedSpecialRoleId(event.target.value)} className="field">
            <option value="">Выберите Fabled или Loric</option>
            {specialRoleOptions
              .filter(
                (role) =>
                  (role.type === "fabled" && !activeFabledIds.includes(role.id)) ||
                  (role.type === "loric" && !activeLoricIds.includes(role.id)),
              )
              .map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
          </select>
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
          <select value={travellerRole} onChange={(event) => setTravellerRole(event.target.value)} className="field">
            <option value="">Роль Traveller</option>
            {travellerRoleOptions.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
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

      <div className="mb-4 grid gap-3 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:grid-cols-3">
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

      <div
        ref={containerRef}
        className={`relative mx-auto w-full overflow-visible bg-black/15 ${layout.aspect} ${layout.maxWidth}`}
      >
        <div className={`absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-veil-500/30 bg-ink-900/90 text-center shadow-inner ${layout.center}`}>
          <div className="w-full space-y-1.5">
            <div className="grid grid-cols-[1fr_auto] gap-x-1 gap-y-0.5 text-[7px] leading-tight sm:gap-x-2 sm:text-[11px]">
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
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {activeSpecialRoles.map((role) => (
                  <span
                    key={role.id}
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[6px] font-semibold sm:px-2 sm:py-1 sm:text-[10px]",
                      role.type === "fabled"
                        ? "border-violet-200/35 bg-violet-950/50 text-violet-100"
                        : "border-emerald-200/35 bg-emerald-950/50 text-emerald-100",
                    )}
                  >
                    <span className="truncate">{role.name}</span>
                    <button
                      type="button"
                      onClick={() => void removeSpecialRole(role.id, role.type)}
                      className="rounded-full p-[1px] text-current opacity-80 transition hover:opacity-100"
                      aria-label={`Убрать ${role.name}`}
                    >
                      <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {sortedPlayers.map((player) => {
          const position =
            dragPositions[player.id] ??
            customTokenPositions?.[player.id] ??
            defaultPositionsById[player.id] ??
            { x: 50, y: 50 };
          const dx = position.x - 50;
          const dy = position.y - 50;
          const distance = Math.hypot(dx, dy) || 1;
          const inwardVoteMarkerOffset = density === "dense" ? 18 : density === "compact" ? 22 : 26;
          const voteMarkerOffsetX = (-dx / distance) * inwardVoteMarkerOffset;
          const voteMarkerOffsetY = (-dy / distance) * inwardVoteMarkerOffset;
          const noteCount = notes.filter((note) => note.linkedPlayerIds.includes(player.id)).length;
          const playerRoleId = player.isTraveller ? player.travellerRole ?? player.mainRole : player.mainRole;
          const isMyToken = Boolean((myPlayerId && player.id === myPlayerId) || (!myPlayerId && myRoleId && playerRoleId === myRoleId));
          const voteAvailability = voteAvailabilityByPlayerId?.get(player.id) ?? "alive";
          const canVoteInCurrentSession = voteAvailability !== "dead_spent";
          const isSelectedVoter = voteDraft?.selectedVoterIds.includes(player.id) ?? false;

          return (
            <div
              key={player.id}
              className={clsx(
                "absolute -translate-x-1/2 -translate-y-1/2",
                canManualArrange ? "cursor-grab active:cursor-grabbing touch-none" : "",
              )}
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
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

              {isVotingMode ? (
                <label
                  className={clsx(
                    "absolute left-1/2 top-0 z-30 flex -translate-x-1/2 -translate-y-[125%] items-center justify-center rounded-full border border-ember-100/20 bg-black/70 p-1 shadow-lg shadow-black/35 backdrop-blur-sm",
                    !canVoteInCurrentSession && "opacity-45",
                  )}
                  title={
                    canVoteInCurrentSession
                      ? "Отметить, что игрок голосовал"
                      : "У мертвого игрока больше нет голоса"
                  }
                >
                  <input
                    type="checkbox"
                    checked={isSelectedVoter}
                    disabled={!canVoteInCurrentSession}
                    onChange={() => onToggleVoteVoter?.(player.id)}
                    className={clsx("accent-emerald-300", votingCheckboxClass)}
                  />
                </label>
              ) : null}

              <PlayerToken
                player={player}
                noteCount={noteCount}
                scriptRoles={scriptRoles}
                isMyToken={isMyToken}
                density={density}
                disabled={isVotingMode}
                tokenScale={currentStyle.tokenScale}
                extraTokenScale={currentStyle.extraTokenScale}
                nameScale={currentStyle.nameScale}
                onClick={handleTokenClick}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
