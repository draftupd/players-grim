import clsx from "clsx";
import { Check, Square } from "lucide-react";
import type { Player, PlayerVoteAvailability, ScriptRole } from "../types";
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
  voteAvailability?: PlayerVoteAvailability;
  onClick: (player: Player) => void;
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
  voteAvailability,
  onClick,
}: PlayerTokenProps) {
  const visibleRoleId = player.isTraveller ? player.travellerRole ?? player.mainRole : player.mainRole;
  const extraRoles = player.additionalRoles.filter(Boolean).slice(0, 3);
  const hasGoodTint = player.tokenTint === "good";
  const hasEvilTint = player.tokenTint === "evil";
  const tokenImageTintStyle =
    hasGoodTint
      ? { filter: "grayscale(1) contrast(1.15) brightness(0.78) sepia(1) saturate(7) hue-rotate(165deg)" }
      : hasEvilTint
        ? { filter: "grayscale(1) contrast(1.18) brightness(0.72) sepia(1) saturate(9) hue-rotate(-28deg)" }
        : undefined;
  const baseTokenSize = density === "dense" ? 66 : density === "compact" ? 78 : 110;
  const tokenFrameStyle = {
    width: `${baseTokenSize * tokenScale}px`,
    height: `${baseTokenSize * tokenScale}px`,
  };
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
  const scaledNameStyle = { transform: `translateX(-50%) scale(${nameScale})`, transformOrigin: "center center" as const };
  const scaledExtraStyle = {
    transform: `translate(-50%, 50%) scale(${extraTokenScale})`,
    transformOrigin: "center top" as const,
  };
  const deadShellClass = player.alive ? "" : "opacity-90 saturate-[0.72] brightness-[0.92]";
  const showShroud = !player.alive;
  const hasDeadVote = voteAvailability === "dead_available";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(player)}
      className={clsx(
        "group relative flex flex-col items-center justify-center rounded-full border border-white/75 bg-[radial-gradient(circle_at_30%_28%,rgba(255,255,255,0.98),rgba(244,240,231,0.96)_58%,rgba(224,214,191,0.92)_100%)] text-center shadow-token transition",
        disabled && "cursor-default",
        deadShellClass,
        hasGoodTint && "shadow-[0_0_28px_rgba(56,189,248,0.38)]",
        hasEvilTint && "shadow-[0_0_28px_rgba(239,68,68,0.4)]",
        isMyToken && "outline outline-[3px] outline-offset-[5px] outline-ember-100 shadow-[0_0_30px_rgba(251,231,176,0.78)]",
      )}
      style={tokenFrameStyle}
      title={player.name}
    >
      <RoleTokenImage
        roleId={visibleRoleId}
        roles={scriptRoles}
        className="absolute inset-[2%] z-0 flex items-center justify-center overflow-hidden rounded-full"
        imageClassName={clsx(
          "h-full w-full translate-y-[10%] object-contain object-center",
          hasGoodTint || hasEvilTint ? "opacity-88" : "opacity-96",
        )}
        imageStyle={tokenImageTintStyle}
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
      {showShroud ? (
        <span className="player-token-shroud pointer-events-none absolute inset-0 z-20">
          <span
            className={clsx(
              "player-token-shroud__vote",
              hasDeadVote ? "player-token-shroud__vote--available" : "player-token-shroud__vote--spent",
            )}
            title={hasDeadVote ? "Мертвый голос доступен" : "Мертвый голос потрачен"}
          >
            <Square className="h-[72%] w-[72%]" strokeWidth={2.2} />
            {hasDeadVote ? <Check className="absolute h-[58%] w-[58%]" strokeWidth={3} /> : <span className="player-token-shroud__slash" />}
          </span>
        </span>
      ) : null}
      <span
        className={clsx(
          "pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 overflow-hidden whitespace-nowrap rounded-full border border-black/45 bg-white/90 text-center font-semibold leading-none text-black shadow-[0_2px_10px_rgba(0,0,0,0.22)] backdrop-blur-[2px]",
          nameClass,
        )}
        style={scaledNameStyle}
      >
        <span className="block truncate">{player.name}</span>
      </span>
      {player.isTraveller ? (
        <span className={clsx("absolute left-1/2 z-10 -translate-x-1/2 font-semibold uppercase tracking-wide text-stone-700 drop-shadow-[0_1px_3px_rgba(255,255,255,0.2)]", statusClass)}>
          {player.leftPhaseId ? "ушел" : "traveller"}
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
                  className={`${extraImageClass} flex items-center justify-center`}
                  imageClassName="h-full w-full rounded-full object-contain object-center"
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
