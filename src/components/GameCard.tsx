import { BookOpen, CalendarDays, Clock, Pin, PinOff, Trophy, UserRound, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import type { Game } from "../types";
import { formatDate, formatDuration, formatTime, gameDisplayTitle, personalTeamLabel, winnerLabel } from "../utils/dates";
import { getRoleLabel } from "../utils/scripts";

type GameCardProps = {
  game: Game;
  onTogglePin: (game: Game) => void;
};

export default function GameCard({ game, onTogglePin }: GameCardProps) {
  const isFinished = game.status === "finished";
  const startedAt = game.startedAt ?? game.createdAt;
  const duration = formatDuration(startedAt, game.finishedAt);

  return (
    <Link
      to={`/games/${game.id}`}
      className="panel block p-4 transition hover:-translate-y-0.5 hover:border-ember-200/35 hover:bg-ink-800/80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-stone-50">{gameDisplayTitle(game)}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-stone-300">
            <span className="chip gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(game.date)}
            </span>
            <span className="chip gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Старт: {formatTime(startedAt)}
            </span>
            {duration ? (
              <span className="chip gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {duration}
              </span>
            ) : null}
            {game.storyteller ? (
              <span className="chip gap-1.5">
                <UserRound className="h-3.5 w-3.5" />
                {game.storyteller}
              </span>
            ) : null}
            {game.scriptName ? (
              <span className="chip gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                {game.scriptName}
              </span>
            ) : null}
            <span className="chip gap-1.5">
              <UsersRound className="h-3.5 w-3.5" />
              {game.playerCount}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          <span className={isFinished ? "chip border-veil-500/40 text-teal-100" : "chip"}>
            {isFinished ? "Завершена" : "Активная"}
          </span>
        </div>
      </div>

      {isFinished ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-stone-300">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ember-200/35 bg-ember-200/12 px-3 py-1.5 font-semibold text-ember-100">
            <Trophy className="h-4 w-4" />
            Победитель: {winnerLabel(game.winner)}
          </span>
        </div>
      ) : null}

      {game.myRoleId || game.myTeam ? (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {game.myRoleId ? <span className="chip">Мой жетон: {getRoleLabel(game.myRoleId, game.scriptRoles)}</span> : null}
          {game.myTeam ? <span className="chip">Моя команда: {personalTeamLabel(game.myTeam)}</span> : null}
        </div>
      ) : null}

      {isFinished ? (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-300">
          {game.finalNotes?.trim() || "Нет доп. заметок"}
        </p>
      ) : null}
    </Link>
  );
}
