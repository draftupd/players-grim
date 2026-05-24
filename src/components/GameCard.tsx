import { BookOpen, Clock, Copy, Pin, PinOff, RotateCcw, Trash2, Trophy, UserRound, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import type { Game } from "../types";
import { formatDate, formatDuration, formatTime, personalTeamLabel, winnerLabel } from "../utils/dates";
import { getRoleLabel } from "../utils/scripts";

type GameCardProps = {
  game: Game;
  onTogglePin: (game: Game) => void;
  onMoveToTrash: (game: Game) => void;
  onRestoreFromTrash: (game: Game) => void;
  onDuplicateSetup?: (game: Game) => void;
  trashMode?: boolean;
};

export default function GameCard({
  game,
  onTogglePin,
  onMoveToTrash,
  onRestoreFromTrash,
  onDuplicateSetup,
  trashMode = false,
}: GameCardProps) {
  const isFinished = game.status === "finished";
  const startedAt = game.startedAt ?? game.createdAt;
  const duration = formatDuration(startedAt, game.finishedAt);
  const compactTitle = game.scriptName?.trim() || game.title || "Партия";
  const secondaryTitle =
    game.scriptName?.trim() && game.scriptName.trim() !== compactTitle
      ? game.scriptName.trim()
      : game.title?.trim() && game.title.trim() !== compactTitle
        ? game.title.trim()
        : "";
  const resultNotes = game.finalNotes?.trim();
  const winnerChipClass =
    game.winner === "good"
      ? "border-sky-100/90 bg-sky-400/40 text-white ring-1 ring-sky-200/45 shadow-[0_0_0_1px_rgba(186,230,253,0.16),0_12px_28px_rgba(56,189,248,0.34)]"
      : game.winner === "evil"
        ? "border-red-100/90 bg-red-400/40 text-white ring-1 ring-red-200/40 shadow-[0_0_0_1px_rgba(254,202,202,0.14),0_12px_28px_rgba(248,113,113,0.3)]"
        : "border-amber-100/85 bg-amber-300/32 text-white ring-1 ring-amber-100/35 shadow-[0_0_0_1px_rgba(253,230,138,0.12),0_12px_28px_rgba(251,191,36,0.24)]";
  const winnerPanelClass =
    game.winner === "good"
      ? "border-sky-300/55 bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(22,28,40,0.72))] shadow-[0_16px_34px_rgba(56,189,248,0.14)]"
      : game.winner === "evil"
        ? "border-red-300/55 bg-[linear-gradient(135deg,rgba(248,113,113,0.16),rgba(30,19,24,0.72))] shadow-[0_16px_34px_rgba(248,113,113,0.14)]"
        : "border-amber-200/45 bg-[linear-gradient(135deg,rgba(251,191,36,0.14),rgba(36,28,18,0.68))] shadow-[0_16px_34px_rgba(251,191,36,0.12)]";

  return (
    <Link
      to={`/games/${game.id}`}
      className="panel block p-4 transition hover:-translate-y-0.5 hover:border-ember-200/35 hover:bg-ink-800/80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-xl font-semibold leading-tight text-stone-50">{compactTitle}</p>
          <p className="mt-1 text-sm text-stone-400">
            {formatDate(game.date)} · {formatTime(startedAt)}
          </p>
          {secondaryTitle ? <p className="mt-1 line-clamp-1 text-sm text-stone-500">{secondaryTitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {trashMode ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRestoreFromTrash(game);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-950/25 text-emerald-100 transition hover:border-emerald-200/35"
              title="Вернуть из корзины"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : (
            <>
              {onDuplicateSetup ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDuplicateSetup(game);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200/15 bg-emerald-950/15 text-emerald-100 transition hover:border-emerald-200/35"
                  title="Дублировать setup"
                >
                  <Copy className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTogglePin(game);
                }}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  game.pinnedAt
                    ? "border-ember-100/60 bg-ember-200/18 text-ember-100"
                    : "border-ember-200/15 bg-black/20 text-stone-400 hover:text-ember-100"
                }`}
                title={game.pinnedAt ? "Открепить" : "Закрепить"}
              >
                {game.pinnedAt ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onMoveToTrash(game);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-300/15 bg-red-950/20 text-red-100 transition hover:border-red-300/35"
                title="Переместить в корзину"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
          <span className={isFinished ? "chip px-2.5 py-1 text-xs border-veil-500/40 text-teal-100" : "chip px-2.5 py-1 text-xs"}>
            {isFinished ? "Завершена" : "Активная"}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-stone-300">
        {duration ? (
          <div className="inline-flex min-w-0 items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-stone-500" />
            <span className="truncate">{duration}</span>
          </div>
        ) : null}
        <div className="inline-flex min-w-0 items-center gap-2">
          <UsersRound className="h-3.5 w-3.5 shrink-0 text-stone-500" />
          <span className="truncate">{game.playerCount} игроков</span>
        </div>
        {game.storyteller ? (
          <div className="inline-flex min-w-0 items-center gap-2">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-stone-500" />
            <span className="truncate">{game.storyteller}</span>
          </div>
        ) : null}
        {secondaryTitle ? (
          <div className="inline-flex min-w-0 items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-stone-500" />
            <span className="truncate">{secondaryTitle}</span>
          </div>
        ) : null}
      </div>

      {game.myRoleId || game.myTeam ? (
        <div className="mt-3 flex flex-wrap gap-1.5 text-sm">
          {game.myRoleId ? <span className="chip px-2.5 py-1 text-xs">Мой жетон: {getRoleLabel(game.myRoleId, game.scriptRoles)}</span> : null}
          {game.myTeam ? <span className="chip px-2.5 py-1 text-xs">Моя команда: {personalTeamLabel(game.myTeam)}</span> : null}
        </div>
      ) : null}

      {isFinished ? (
        <div className={`mt-4 rounded-2xl border p-3 ${winnerPanelClass}`}>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${winnerChipClass}`}>
            <Trophy className="h-4 w-4" />
            Победитель: {winnerLabel(game.winner)}
          </span>
          <p className="mt-2 text-sm leading-5 text-stone-100">
            {resultNotes || "Без пояснения по итогу"}
          </p>
        </div>
      ) : null}
    </Link>
  );
}
