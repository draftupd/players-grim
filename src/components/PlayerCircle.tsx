import type { Note, Player, ScriptRole } from "../types";
import { getPlayerSetup } from "../utils/playerSetup";
import PlayerToken from "./PlayerToken";

type PlayerCircleProps = {
  players: Player[];
  notes: Note[];
  scriptRoles?: ScriptRole[];
  myPlayerId?: string;
  myRoleId?: string;
  onPlayerClick: (player: Player) => void;
};

const getEllipseCircumference = (xRadius: number, yRadius: number) => {
  const h = ((xRadius - yRadius) ** 2) / ((xRadius + yRadius) ** 2);
  return Math.PI * (xRadius + yRadius) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
};

const getEvenlySpacedEllipsePoints = (count: number, xRadius: number, yRadius: number) => {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return [{ x: 50, y: 50 - yRadius }];
  }

  const samples = Math.max(720, count * 120);
  const points = Array.from({ length: samples + 1 }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / samples;
    return {
      angle,
      x: 50 + xRadius * Math.cos(angle),
      y: 50 + yRadius * Math.sin(angle),
    };
  });

  const cumulativeLengths = [0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    cumulativeLengths.push(cumulativeLengths[index - 1] + segmentLength);
  }

  const totalLength = cumulativeLengths[cumulativeLengths.length - 1];

  return Array.from({ length: count }, (_, index) => {
    const targetLength = (totalLength * index) / count;
    let sampleIndex = cumulativeLengths.findIndex((length) => length >= targetLength);

    if (sampleIndex <= 0) {
      sampleIndex = 1;
    }

    const previousLength = cumulativeLengths[sampleIndex - 1];
    const nextLength = cumulativeLengths[sampleIndex];
    const progress =
      nextLength === previousLength ? 0 : (targetLength - previousLength) / (nextLength - previousLength);
    const previousPoint = points[sampleIndex - 1];
    const nextPoint = points[sampleIndex];

    return {
      x: previousPoint.x + (nextPoint.x - previousPoint.x) * progress,
      y: previousPoint.y + (nextPoint.y - previousPoint.y) * progress,
    };
  });
};

export default function PlayerCircle({
  players,
  notes,
  scriptRoles = [],
  myPlayerId,
  myRoleId,
  onPlayerClick,
}: PlayerCircleProps) {
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const regularPlayerCount = players.filter((player) => !player.isTraveller).length;
  const travellerCount = players.filter((player) => player.isTraveller).length;
  const setup = getPlayerSetup(regularPlayerCount);
  const playerTotal = sortedPlayers.length;
  const density = playerTotal >= 14 ? "dense" : playerTotal >= 11 ? "compact" : "normal";
  const tokenDiameterPercent = density === "dense" ? 13 : density === "compact" ? 14.25 : 16.25;
  const desiredGapPercent = density === "dense" ? 4.8 : density === "compact" ? 5.2 : 5.8;
  const ellipseRatio = playerTotal >= 13 ? { x: 0.84, y: 1.08 } : { x: 0.87, y: 1.04 };
  const minimumCircumference = Math.max(playerTotal, 3) * (tokenDiameterPercent + desiredGapPercent);
  const baseCircumference = getEllipseCircumference(ellipseRatio.x, ellipseRatio.y);
  const radiusScale = minimumCircumference / baseCircumference;
  const minimumRadiusScale = playerTotal <= 6 ? 30 : playerTotal <= 10 ? 33 : 35;
  const xRadius = Math.min(44, Math.max(minimumRadiusScale * ellipseRatio.x, radiusScale * ellipseRatio.x));
  const yRadius = Math.min(48, Math.max((minimumRadiusScale + 2) * ellipseRatio.y, radiusScale * ellipseRatio.y));
  const tokenPositions = getEvenlySpacedEllipsePoints(sortedPlayers.length, xRadius, yRadius);

  const layout = {
    maxWidth: playerTotal >= 14
      ? "max-w-[520px] sm:max-w-[680px] lg:max-w-[760px]"
      : "max-w-[340px] sm:max-w-[560px] lg:max-w-[620px]",
    aspect: "aspect-square",
    center: density === "dense" ? "h-[68px] w-[68px] p-1.5 sm:h-36 sm:w-36 sm:p-3.5" : density === "compact" ? "h-[74px] w-[74px] p-1.5 sm:h-40 sm:w-40 sm:p-4" : "h-[84px] w-[84px] p-2 sm:h-44 sm:w-44 sm:p-5",
    xRadius,
    yRadius,
  };

  return (
    <section className="panel overflow-hidden p-3 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-50">Круг игроков</h2>
          <p className="text-sm text-stone-400">
            {regularPlayerCount} игроков{travellerCount > 0 ? ` + ${travellerCount} Traveller` : ""}
          </p>
        </div>
      </div>

      <div
        className={`relative mx-auto w-full overflow-visible bg-black/15 ${layout.aspect} ${layout.maxWidth}`}
      >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 border border-ember-200/10"
        style={{
          width: `${layout.xRadius * 2}%`,
          height: `${layout.yRadius * 2}%`,
          transform: "translate(-50%, -50%)",
          borderRadius: "9999px",
        }}
      />        
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
          </div>
        </div>

        {sortedPlayers.map((player, index) => {
          const position = tokenPositions[index] ?? { x: 50, y: 50 };
          const noteCount = notes.filter((note) => note.linkedPlayerIds.includes(player.id)).length;
          const playerRoleId = player.isTraveller ? player.travellerRole ?? player.mainRole : player.mainRole;
          const isMyToken = Boolean((myPlayerId && player.id === myPlayerId) || (!myPlayerId && myRoleId && playerRoleId === myRoleId));

          return (
            <div
              key={player.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
            >
              <PlayerToken
                player={player}
                noteCount={noteCount}
                scriptRoles={scriptRoles}
                isMyToken={isMyToken}
                density={density}
                onClick={onPlayerClick}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
