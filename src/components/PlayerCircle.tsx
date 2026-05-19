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
  const isLargeTable = sortedPlayers.length > 10;
  const density = sortedPlayers.length > 13 ? "dense" : sortedPlayers.length > 9 ? "compact" : "normal";
  const xRadius = sortedPlayers.length <= 6 ? 27 : isLargeTable ? 24 : 29;
  const yRadius = sortedPlayers.length <= 6 ? 27 : sortedPlayers.length >= 15 ? 38 : isLargeTable ? 35 : 29;

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
        className={`relative mx-auto w-full rounded-full border border-ember-200/10 bg-black/15 ${isLargeTable ? "aspect-[4/5] max-w-[300px] sm:aspect-square sm:max-w-[520px]" : "aspect-square max-w-[300px] sm:max-w-[520px]"}`}
      >
        <div className={`absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-veil-500/30 bg-ink-900/90 text-center shadow-inner ${isLargeTable ? "h-[68px] w-[68px] p-1 sm:h-40 sm:w-40 sm:p-4" : "h-[72px] w-[72px] p-1.5 sm:h-40 sm:w-40 sm:p-4"}`}>
          <div className="w-full space-y-1.5">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-stone-500 sm:text-xs">
              Раскладка
            </p>
            <div className="grid grid-cols-[1fr_auto] gap-x-1 gap-y-0.5 text-[8px] leading-tight sm:gap-x-2 sm:text-xs">
              <span className="text-left text-sky-100">Горожане</span>
              <strong className="text-sky-100">{setup.townsfolk}</strong>
              <span className="text-left text-sky-200/80">Изгои</span>
              <strong className="text-sky-200">{setup.outsiders}</strong>
              <span className="text-left text-red-100">Присп.</span>
              <strong className="text-red-100">{setup.minions}</strong>
              <span className="text-left text-red-200">Демоны</span>
              <strong className="text-red-200">{setup.demons}</strong>
            </div>
          </div>
        </div>

        {sortedPlayers.map((player, index) => {
          const angle = -90 + (360 / sortedPlayers.length) * index;
          const x = 50 + xRadius * Math.cos((angle * Math.PI) / 180);
          const y = 50 + yRadius * Math.sin((angle * Math.PI) / 180);
          const noteCount = notes.filter((note) => note.linkedPlayerIds.includes(player.id)).length;
          const playerRoleId = player.isTraveller ? player.travellerRole ?? player.mainRole : player.mainRole;
          const isMyToken = Boolean((myPlayerId && player.id === myPlayerId) || (!myPlayerId && myRoleId && playerRoleId === myRoleId));

          return (
            <div
              key={player.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
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
