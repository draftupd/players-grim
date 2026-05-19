import { BarChart3, Download, FileJson, List, Plus, Upload } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChangeEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import GameCard from "../components/GameCard";
import { db } from "../db/db";
import type { Game, Note, Player } from "../types";
import { formatMinutesAsDuration, timestamp } from "../utils/dates";
import { isArchiveBundle, makeArchiveBundle, remapArchiveBundle } from "../utils/archive";
import { calculateLibraryStats } from "../utils/stats";

export default function HomePage() {
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"games" | "stats">("games");
  const games = useLiveQuery(
    async () => {
      const allGames = await db.games.toArray();

      return allGames.sort((a, b) => {
        if (a.pinnedAt && !b.pinnedAt) {
          return -1;
        }

        if (!a.pinnedAt && b.pinnedAt) {
          return 1;
        }

        return b.createdAt.localeCompare(a.createdAt);
      });
    },
    [],
    [],
  );
  const players = useLiveQuery(async (): Promise<Player[]> => db.players.toArray(), [], []);
  const notes = useLiveQuery(async (): Promise<Note[]> => db.notes.toArray(), [], []);

  const pinnedCount = games.filter((game) => game.pinnedAt).length;
  const stats = useMemo(() => calculateLibraryStats(games, players, notes), [games, players, notes]);

  const togglePin = async (game: Game) => {
    if (!game.pinnedAt && pinnedCount >= 10) {
      window.alert("Можно закрепить максимум 10 игр.");
      return;
    }

    await db.games.update(game.id, {
      pinnedAt: game.pinnedAt ? undefined : timestamp(),
      updatedAt: timestamp(),
    });
  };

  const exportArchive = async () => {
    const bundle = makeArchiveBundle(
      await db.games.toArray(),
      await db.players.toArray(),
      await db.phases.toArray(),
      await db.notes.toArray(),
      await db.voteRecords.toArray(),
    );
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `players-grimoire-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importArchive = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setImporting(true);
    setImportError("");

    try {
      const parsed = JSON.parse(await file.text());

      if (!isArchiveBundle(parsed)) {
        throw new Error("Файл не похож на архив Player's Grimoire.");
      }

      const remapped = remapArchiveBundle(parsed);

      await db.transaction("rw", [db.games, db.players, db.phases, db.notes, db.voteRecords], async () => {
        await db.games.bulkAdd(remapped.games);
        await db.players.bulkAdd(remapped.players);
        await db.phases.bulkAdd(remapped.phases);
        await db.notes.bulkAdd(remapped.notes);
        await db.voteRecords.bulkAdd(remapped.voteRecords);
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Не удалось импортировать архив.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <main className="page-shell">
      <div className="content-shell space-y-6">
        <header className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-ember-100/80">
              Player's Grimoire
            </p>
            <h1 className="mt-2 text-3xl font-bold text-stone-50 sm:text-4xl">
              Башня: заметки игрока
            </h1>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button type="button" onClick={exportArchive} className="secondary-button w-full sm:w-auto">
              <Download className="h-4 w-4" />
              Экспорт JSON
            </button>
            <label className="secondary-button w-full cursor-pointer sm:w-auto">
              <Upload className="h-4 w-4" />
              {importing ? "Импорт..." : "Импорт JSON"}
              <input type="file" accept=".json,application/json" onChange={importArchive} className="hidden" />
            </label>
            <Link to="/games/new" className="primary-button w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Новая партия
            </Link>
          </div>
        </header>

        <section className="panel p-2 sm:p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("games")}
              className={activeTab === "games" ? "primary-button w-full" : "secondary-button w-full"}
            >
              <List className="h-4 w-4" />
              Партии
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("stats")}
              className={activeTab === "stats" ? "primary-button w-full" : "secondary-button w-full"}
            >
              <BarChart3 className="h-4 w-4" />
              Статистика
            </button>
          </div>
        </section>

        {importError ? (
          <div className="rounded-2xl border border-red-300/20 bg-red-950/30 p-4 text-sm text-red-100">
            {importError}
          </div>
        ) : null}

        {activeTab === "stats" ? (
          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-ember-100" />
              <h2 className="text-lg font-semibold text-stone-50">Статистика всех игр</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
                <p className="text-sm text-stone-400">Всего партий</p>
                <p className="mt-2 text-2xl font-bold text-stone-50">{stats.totalGames}</p>
              </div>
              <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
                <p className="text-sm text-stone-400">Активные / завершенные</p>
                <p className="mt-2 text-2xl font-bold text-stone-50">
                  {stats.activeGames} / {stats.finishedGames}
                </p>
              </div>
              <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
                <p className="text-sm text-stone-400">Заметок</p>
                <p className="mt-2 text-2xl font-bold text-stone-50">{stats.totalNotes}</p>
              </div>
              <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
                <p className="text-sm text-stone-400">Среднее число игроков</p>
                <p className="mt-2 text-2xl font-bold text-stone-50">
                  {stats.totalGames > 0 ? stats.averagePlayers.toFixed(1) : "0.0"}
                </p>
              </div>
              <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
                <p className="text-sm text-stone-400">Среднее время партии</p>
                <p className="mt-2 text-2xl font-bold text-stone-50">
                  {formatMinutesAsDuration(stats.averageFinishedGameMinutes)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-300/12 bg-emerald-950/15 p-4">
                <p className="text-sm text-emerald-100/70">Мои победы за синих</p>
                <p className="mt-2 text-2xl font-bold text-emerald-100">{stats.myGoodWins}</p>
              </div>
              <div className="rounded-2xl border border-red-300/12 bg-red-950/15 p-4">
                <p className="text-sm text-red-100/70">Мои победы за красных</p>
                <p className="mt-2 text-2xl font-bold text-red-100">{stats.myEvilWins}</p>
              </div>
              <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
                <p className="text-sm text-stone-400">Побед добра / зла</p>
                <p className="mt-2 text-2xl font-bold text-stone-50">
                  {stats.goodWins} / {stats.evilWins}
                </p>
                <p className="mt-1 text-sm text-stone-400">Другие итоги: {stats.otherWins}</p>
              </div>
              <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4 sm:col-span-2">
                <p className="text-sm text-stone-400">Сценарии</p>
                <p className="mt-2 text-2xl font-bold text-stone-50">{stats.uniqueScripts}</p>
                <p className="mt-1 text-sm text-stone-400">{stats.topScript || "Пока нет данных"}</p>
              </div>
              <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4 sm:col-span-2">
                <p className="text-sm text-stone-400">Частый ведущий</p>
                <p className="mt-2 text-lg font-bold text-stone-50">{stats.topStoryteller || "Пока нет данных"}</p>
              </div>
            </div>
          </section>
        ) : games.length === 0 ? (
          <section className="panel flex min-h-72 flex-col items-center justify-center p-6 text-center">
            <p className="text-xl font-semibold text-stone-50">Пока нет сыгранных партий.</p>
            <p className="mt-2 text-sm text-stone-400">
              Создайте первую партию или импортируйте JSON с другого устройства.
            </p>
            <div className="mt-5 grid w-full max-w-sm gap-2">
              <label className="secondary-button w-full cursor-pointer">
                <FileJson className="h-4 w-4" />
                {importing ? "Импорт..." : "Импорт JSON"}
                <input type="file" accept=".json,application/json" onChange={importArchive} className="hidden" />
              </label>
              <Link to="/games/new" className="primary-button">
                <Plus className="h-4 w-4" />
                Новая партия
              </Link>
            </div>
          </section>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <GameCard key={game.id} game={game} onTogglePin={togglePin} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
