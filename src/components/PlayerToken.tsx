import clsx from "clsx";
import type { Player, ScriptRole } from "../types";
import { getRoleLabel, getRoleTypeFromRoles } from "../utils/scripts";
import RoleTokenImage from "./RoleTokenImage";

type PlayerTokenProps = {
  player: Player;
  noteCount: number;
  scriptRoles?: ScriptRole[];
  isMyToken?: boolean;
  density?: "normal" | "compact" | "dense";
  onClick: (player: Player) => void;
};

const roleTypeClasses = {
  townsfolk: "from-sky-950 via-sky-900 to-cyan-950 border-sky-200/65",
  outsider: "from-blue-950 via-indigo-950 to-slate-950 border-blue-200/60",
  minion: "from-red-950 via-rose-950 to-stone-950 border-red-200/60",
  demon: "from-red-950 via-black to-red-950 border-red-300/75",
  traveller: "from-amber-950 via-stone-900 to-yellow-950 border-amber-200/60",
  fabled: "from-violet-950 via-fuchsia-950 to-stone-950 border-violet-200/60",
  loric: "from-emerald-950 via-teal-950 to-stone-950 border-emerald-200/60",
  unknown: "from-ink-800 via-ink-700 to-ink-900 border-ember-200/55",
};

const travellerTeamClasses = {
  good: "from-amber-950 via-stone-900 to-yellow-950 border-sky-300 ring-4 ring-sky-300 shadow-[0_0_22px_rgba(125,211,252,0.62)]",
  evil: "from-amber-950 via-stone-900 to-yellow-950 border-red-300 ring-4 ring-red-300 shadow-[0_0_22px_rgba(252,165,165,0.62)]",
  unknown: "from-amber-950 via-stone-900 to-yellow-950 border-amber-200/60",
};

const extraRoleClasses = {
  townsfolk: "border-sky-200/75 bg-sky-950 text-sky-50",
  outsider: "border-blue-200/70 bg-indigo-950 text-blue-50",
  minion: "border-red-200/70 bg-red-950 text-red-50",
  demon: "border-red-200/85 bg-black text-red-100",
  traveller: "border-amber-200/70 bg-amber-950 text-amber-50",
  fabled: "border-violet-200/70 bg-violet-950 text-violet-50",
  loric: "border-emerald-200/70 bg-emerald-950 text-emerald-50",
  unknown: "border-ember-200/45 bg-ink-900 text-ember-50",
};

const shortRoleLabel = (roleId: string, scriptRoles: ScriptRole[]) => {
  const label = getRoleLabel(roleId, scriptRoles) || roleId;
  return label.replace(/\s+/g, "").slice(0, 3);
};

export default function PlayerToken({
  player,
  noteCount,
  scriptRoles = [],
  isMyToken = false,
  density = "normal",
  onClick,
}: PlayerTokenProps) {
  const visibleRoleId = player.isTraveller ? player.travellerRole ?? player.mainRole : player.mainRole;
  const roleType = getRoleTypeFromRoles(player.mainRole, scriptRoles);
  const extraRoles = player.additionalRoles.filter(Boolean).slice(0, 3);
  const tokenSizeClass =
    density === "dense"
      ? "h-[40px] w-[40px] px-1 before:inset-[4px] after:inset-[9px] sm:h-24 sm:w-24 sm:px-2 sm:before:inset-[8px] sm:after:inset-[16px]"
      : density === "compact"
        ? "h-[48px] w-[48px] px-1 before:inset-[5px] after:inset-[10px] sm:h-24 sm:w-24 sm:px-2 sm:before:inset-[8px] sm:after:inset-[16px]"
        : "h-[56px] w-[56px] px-1.5 before:inset-[6px] after:inset-[12px] sm:h-24 sm:w-24 sm:px-2 sm:before:inset-[8px] sm:after:inset-[16px]";
  const noteBadgeClass =
    density === "dense"
      ? "min-w-4 px-1 py-0.5 text-[9px] sm:min-w-6 sm:px-1.5 sm:text-xs"
      : density === "compact"
        ? "min-w-4.5 px-1 py-0.5 text-[10px] sm:min-w-6 sm:px-1.5 sm:text-xs"
        : "min-w-4.5 px-1 py-0.5 text-[10px] sm:min-w-6 sm:px-1.5 sm:text-xs";
  const nameClass =
    density === "dense"
      ? "bottom-0.5 w-[90%] text-[8px] sm:bottom-2 sm:w-[84%] sm:text-base"
      : density === "compact"
        ? "bottom-1 w-[88%] text-[9px] sm:bottom-2 sm:w-[84%] sm:text-base"
        : "bottom-1 w-[88%] text-[10px] sm:bottom-2 sm:w-[84%] sm:text-base";
  const statusClass =
    density === "dense"
      ? "bottom-2.5 text-[6px] sm:bottom-6 sm:text-[9px]"
      : "bottom-3.5 text-[7px] sm:bottom-6 sm:text-[9px]";
  const extraWrapperClass =
    density === "dense"
      ? "-bottom-1.5 gap-0.5 sm:-bottom-3 sm:gap-1"
      : "-bottom-2 gap-0.5 sm:-bottom-3 sm:gap-1";
  const extraCircleClass =
    density === "dense"
      ? "h-4 min-w-4 px-0 text-[6px] sm:h-7 sm:min-w-7 sm:px-1 sm:text-[9px]"
      : "h-4.5 min-w-4.5 px-0.5 text-[7px] sm:h-7 sm:min-w-7 sm:px-1 sm:text-[9px]";
  const extraImageClass =
    density === "dense"
      ? "h-4 w-4 sm:-mx-1 sm:-my-1 sm:h-7 sm:w-7"
      : "h-4.5 w-4.5 sm:-mx-1 sm:-my-1 sm:h-7 sm:w-7";

  return (
    <button
      type="button"
      onClick={() => onClick(player)}
      className={clsx(
        "group relative flex flex-col items-center justify-center rounded-full border bg-gradient-to-br text-center shadow-token transition before:absolute before:rounded-full before:border before:border-white/10 before:content-[''] after:absolute after:rounded-full after:bg-black/12 after:content-['']",
        tokenSizeClass,
        player.alive
          ? player.isTraveller
            ? travellerTeamClasses[player.travellerTeam ?? "unknown"]
            : roleTypeClasses[roleType]
          : "border-stone-500/25 opacity-55 grayscale hover:opacity-75",
        isMyToken && "outline outline-[3px] outline-offset-[5px] outline-ember-100 shadow-[0_0_30px_rgba(251,231,176,0.78)]",
      )}
      title={player.name}
    >
      <RoleTokenImage
        roleId={visibleRoleId}
        roles={scriptRoles}
        className="absolute inset-0 z-0 overflow-hidden rounded-full"
        imageClassName="h-full w-full object-cover opacity-90"
      />
      {noteCount > 0 ? (
        <span className={clsx("absolute -right-1 -top-1 rounded-full border border-ember-100/60 bg-ink-900 font-semibold text-ember-50", noteBadgeClass)}>
          {noteCount}
        </span>
      ) : null}
      <span className={clsx("absolute left-1/2 z-10 -translate-x-1/2 truncate text-center font-semibold leading-tight text-stone-50 drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)]", nameClass)}>
        {player.name}
      </span>
      {player.isTraveller ? (
        <span className={clsx("absolute left-1/2 z-10 -translate-x-1/2 font-semibold uppercase tracking-wide text-amber-100 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]", statusClass)}>
          {player.leftPhaseId ? "ушел" : "traveller"}
        </span>
      ) : null}
      {!player.alive ? (
        <span className={clsx("absolute left-1/2 z-10 -translate-x-1/2 font-semibold uppercase tracking-wide text-stone-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]", statusClass)}>
          мертв
        </span>
      ) : null}
      {extraRoles.length > 0 ? (
        <span className={clsx("absolute left-1/2 z-20 flex -translate-x-1/2", extraWrapperClass)}>
          {extraRoles.map((roleId, index) => {
            const extraRoleType = getRoleTypeFromRoles(roleId, scriptRoles);

            return (
              <span
                key={`${roleId}-${index}`}
                title={getRoleLabel(roleId, scriptRoles) || roleId}
                className={clsx(
                  "flex items-center justify-center overflow-hidden rounded-full border font-bold uppercase leading-none shadow-lg shadow-black/30",
                  extraCircleClass,
                  extraRoleClasses[extraRoleType],
                )}
              >
                <RoleTokenImage
                  roleId={roleId}
                  roles={scriptRoles}
                  className={extraImageClass}
                  imageClassName="h-full w-full rounded-full object-cover"
                  fallback={shortRoleLabel(roleId, scriptRoles)}
                />
              </span>
            );
          })}
        </span>
      ) : null}
    </button>
  );
}
