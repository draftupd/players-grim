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
  disabled?: boolean;
  tokenScale?: number;
  extraTokenScale?: number;
  nameScale?: number;
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
  disabled = false,
  tokenScale = 1,
  extraTokenScale = 1,
  nameScale = 1,
  onClick,
}: PlayerTokenProps) {
  const visibleRoleId = player.isTraveller ? player.travellerRole ?? player.mainRole : player.mainRole;
  const roleType = getRoleTypeFromRoles(player.mainRole, scriptRoles);
  const extraRoles = player.additionalRoles.filter(Boolean).slice(0, 3);
  const tokenSizeClass =
    density === "dense"
      ? "h-[60px] w-[60px] px-1 sm:h-[66px] sm:w-[66px] sm:px-1 lg:h-[78px] lg:w-[78px] lg:px-1.5"
      : density === "compact"
        ? "h-[72px] w-[72px] px-1 sm:h-[78px] sm:w-[78px] sm:px-1.5 lg:h-[90px] lg:w-[90px] lg:px-2"
        : "h-[102px] w-[102px] px-1.5 sm:h-[110px] sm:w-[110px] sm:px-2 lg:h-[122px] lg:w-[122px] lg:px-2.5";
  const noteBadgeClass =
    density === "dense"
      ? "min-w-3.5 px-0.5 py-0 text-[8px] sm:min-w-5 sm:px-1 sm:text-[10px] lg:min-w-6 lg:px-1.5 lg:text-xs"
      : density === "compact"
        ? "min-w-4.5 px-1 py-0.5 text-[10px] sm:min-w-5 sm:px-1 sm:text-[11px] lg:min-w-6 lg:px-1.5 lg:text-xs"
        : "min-w-4.5 px-1 py-0.5 text-[10px] sm:min-w-6 sm:px-1.5 sm:text-xs";
  const nameClass =
    density === "dense"
      ? "top-0 translate-y-[42%] min-h-[13px] w-max max-w-[124%] px-1.5 py-[1px] text-[8px] sm:min-h-[16px] sm:max-w-[128%] sm:px-1.5 sm:text-[10px] lg:min-h-[18px] lg:max-w-[136%] lg:px-2 lg:text-[12px]"
      : density === "compact"
        ? "top-0 translate-y-[48%] min-h-[14px] w-max max-w-[126%] px-1.5 py-[1px] text-[9px] sm:min-h-[17px] sm:max-w-[132%] sm:px-1.5 sm:text-[11px] lg:min-h-[20px] lg:max-w-[140%] lg:px-2 lg:text-[13px]"
        : "top-0 translate-y-[54%] min-h-[15px] w-max max-w-[128%] px-2 py-[1px] text-[9px] sm:min-h-[19px] sm:max-w-[136%] sm:px-2 sm:text-[12px]";
  const statusClass =
    density === "dense"
      ? "top-[11px] text-[6px] sm:top-[17px] sm:text-[7px] lg:top-[22px] lg:text-[8px]"
      : density === "compact"
        ? "top-[14px] text-[7px] sm:top-[22px] sm:text-[8px] lg:top-[28px] lg:text-[9px]"
        : "top-[18px] text-[7px] sm:top-[30px] sm:text-[8px]";
  const extraWrapperClass = "bottom-0 -space-x-0.5 sm:-space-x-0.5 lg:-space-x-1";
  const extraCircleClass =
    "h-[30px] w-[30px] text-[8px] sm:h-[36px] sm:w-[36px] sm:text-[10px] lg:h-[42px] lg:w-[42px] lg:text-[12px]";
  const extraImageClass = "h-[30px] w-[30px] sm:h-[36px] sm:w-[36px] lg:h-[42px] lg:w-[42px]";
  const scaledStyle = { transform: `scale(${tokenScale})` };
  const scaledNameStyle = { transform: `translateX(-50%) scale(${nameScale})`, transformOrigin: "center center" as const };
  const scaledExtraStyle = {
    transform: `translate(-50%, 50%) scale(${extraTokenScale})`,
    transformOrigin: "center top" as const,
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(player)}
      className={clsx(
        "group relative flex flex-col items-center justify-center rounded-full border bg-gradient-to-br text-center shadow-token transition",
        tokenSizeClass,
        disabled && "cursor-default",
        player.alive
          ? player.isTraveller
            ? travellerTeamClasses[player.travellerTeam ?? "unknown"]
            : roleTypeClasses[roleType]
          : "border-stone-500/25 opacity-55 grayscale hover:opacity-75",
        isMyToken && "outline outline-[3px] outline-offset-[5px] outline-ember-100 shadow-[0_0_30px_rgba(251,231,176,0.78)]",
      )}
      style={scaledStyle}
      title={player.name}
    >
      <RoleTokenImage
        roleId={visibleRoleId}
        roles={scriptRoles}
        className="absolute inset-0 z-0 overflow-hidden rounded-full"
        imageClassName="h-[112%] w-full translate-y-[8%] object-cover object-top opacity-90 sm:h-[116%] sm:translate-y-[12%] lg:h-[118%] lg:translate-y-[16%]"
      />
      {noteCount > 0 ? (
        <span
          className={clsx(
            "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[88%] rounded-full border border-ember-100/60 bg-ink-900 font-semibold text-ember-50",
            noteBadgeClass,
          )}
        >
          {noteCount}
        </span>
      ) : null}
      <span
        className={clsx(
          "pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 overflow-hidden whitespace-nowrap rounded-full border border-white/20 bg-black/45 text-center font-semibold leading-none text-stone-50 shadow-[0_2px_10px_rgba(0,0,0,0.35)] backdrop-blur-[2px]",
          nameClass,
        )}
        style={scaledNameStyle}
      >
        <span className="block truncate">{player.name}</span>
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
        <span className={clsx("absolute left-1/2 z-20 flex -translate-x-1/2", extraWrapperClass)} style={scaledExtraStyle}>
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
