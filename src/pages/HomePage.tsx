import { BarChart3, Download, FileJson, List, Plus, Trash2, Upload } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChangeEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import GameCard from "../components/GameCard";
import { db } from "../db/db";
import type { Game, Note, Phase, Player } from "../types";
import { formatMinutesAsDuration, timestamp, todayInputValue } from "../utils/dates";
import { makeArchiveBundle, remapArchiveBundle } from "../utils/archive";
import { buildFinishedGameConclusion } from "../utils/gameConclusion";
import { createId } from "../utils/ids";
import { readImportedArchive } from "../utils/importErrors";
import { calculateLibraryStats } from "../utils/stats";

export default function HomePage() {
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"games" | "stats" | "trash">("games");
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
  const phases = useLiveQuery(async (): Promise<Phase[]> => db.phases.toArray(), [], []);

  const visibleGames = useMemo(() => games.filter((game) => !game.trashedAt), [games]);
  const trashedGames = useMemo(
    () =>
      games
        .filter((game) => game.trashedAt)
        .sort((a, b) => (b.trashedAt ?? "").localeCompare(a.trashedAt ?? "")),
    [games],
  );
  const pinnedCount = visibleGames.filter((game) => game.pinnedAt).length;
  const stats = useMemo(() => calculateLibraryStats(games, players, notes), [games, players, notes]);
  const gameConclusionById = useMemo(() => {
    const playersByGameId = new Map<string, Player[]>();
    const notesByGameId = new Map<string, Note[]>();
    const phasesByGameId = new Map<string, Phase[]>();

    players.forEach((player) => {
      const current = playersByGameId.get(player.gameId) ?? [];
      current.push(player);
      playersByGameId.set(player.gameId, current);
    });

    notes.forEach((note) => {
      const current = notesByGameId.get(note.gameId) ?? [];
      current.push(note);
      notesByGameId.set(note.gameId, current);
    });

    phases.forEach((phase) => {
      const current = phasesByGameId.get(phase.gameId) ?? [];
      current.push(phase);
      phasesByGameId.set(phase.gameId, current);
    });

    return new Map(
      games.map((game) => [
        game.id,
        buildFinishedGameConclusion(
          game,
          playersByGameId.get(game.id) ?? [],
          notesByGameId.get(game.id) ?? [],
          phasesByGameId.get(game.id) ?? [],
        ),
      ]),
    );
  }, [games, notes, phases, players]);

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

  const moveToTrash = async (game: Game) => {
    await db.games.update(game.id, {
      trashedAt: timestamp(),
      pinnedAt: undefined,
      updatedAt: timestamp(),
    });
  };

  const restoreFromTrash = async (game: Game) => {
    await db.games.update(game.id, {
      trashedAt: undefined,
      updatedAt: timestamp(),
    });
  };

  const clearTrash = async () => {
    if (trashedGames.length === 0) {
      return;
    }

    const trashIds = trashedGames.map((game) => game.id);
    const trashIdSet = new Set(trashIds);

    if (!window.confirm("Очистить корзину? Эти партии удалятся безвозвратно.")) {
      return;
    }

    const trashedPlayers = players.filter((player) => trashIdSet.has(player.gameId)).map((player) => player.id);
    const trashedPhases = (await db.phases.toArray()).filter((phase) => trashIdSet.has(phase.gameId)).map((phase) => phase.id);
    const trashedNotes = notes.filter((note) => trashIdSet.has(note.gameId)).map((note) => note.id);
    const trashedVoteRecords = (await db.voteRecords.toArray())
      .filter((voteRecord) => trashIdSet.has(voteRecord.gameId))
      .map((voteRecord) => voteRecord.id);

    await db.transaction("rw", [db.games, db.players, db.phases, db.notes, db.voteRecords], async () => {
      await db.voteRecords.bulkDelete(trashedVoteRecords);
      await db.notes.bulkDelete(trashedNotes);
      await db.phases.bulkDelete(trashedPhases);
      await db.players.bulkDelete(trashedPlayers);
      await db.games.bulkDelete(trashIds);
    });
  };

  const duplicateSetup = async (game: Game) => {
    const gamePlayers = players
      .filter((player) => player.gameId === game.id)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    const now = timestamp();
    const newGameId = createId();
    const baseTitle = game.scriptName?.trim() || game.title.trim() || "Новая партия";

    const duplicatedGame: Game = {
      id: newGameId,
      title: baseTitle,
      date: todayInputValue(),
      storyteller: game.storyteller,
      scriptName: game.scriptName,
      scriptVersion: game.scriptVersion,
      scriptAuthor: game.scriptAuthor,
      scriptRoles: game.scriptRoles,
      playerCount: game.playerCount,
      status: "active",
      activeFabledIds: undefined,
      activeLoricIds: undefined,
      myPlayerId: undefined,
      myRoleId: undefined,
      myTeam: undefined,
      winner: undefined,
      finalNotes: undefined,
      hasStarted: false,
      currentPhaseId: undefined,
      startedAt: undefined,
      finishedAt: undefined,
      pinnedAt: undefined,
      trashedAt: undefined,
      customTokenPositions: undefined,
      grimoireStyle: undefined,
      createdAt: now,
      updatedAt: now,
    };

    const duplicatedPlayers: Player[] = gamePlayers.map((player) => ({
      id: createId(),
      gameId: newGameId,
      name: player.name,
      seatIndex: player.seatIndex,
      alive: true,
      deadVoteAvailable: true,
      tokenTint: "default",
      mainRole: undefined,
      additionalRoles: ["", "", ""],
      isTraveller: undefined,
      travellerRole: undefined,
      travellerTeam: undefined,
      joinedPhaseId: undefined,
      leftPhaseId: undefined,
      createdAt: now,
      updatedAt: now,
    }));

    const duplicatedPhases: Phase[] = [{ id: createId(), gameId: newGameId, number: 1, type: "night", title: "1 ночь", createdAt: now }];

    await db.transaction("rw", db.games, db.players, db.phases, async () => {
      await db.games.add(duplicatedGame);
      await db.players.bulkAdd(duplicatedPlayers);
      await db.phases.bulkAdd(duplicatedPhases);
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
      const parsed = await readImportedArchive(file);
      const remapped = remapArchiveBundle(parsed);

      await db.transaction("rw", [db.games, db.players, db.phases, db.notes, db.voteRecords], async () => {
        await db.games.bulkAdd(remapped.games);
        await db.players.bulkAdd(remapped.players);
        await db.phases.bulkAdd(remapped.phases);
        await db.notes.bulkAdd(remapped.notes);
        await db.voteRecords.bulkAdd(remapped.voteRecords);
      });
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Не удалось импортировать историю. Проверьте файл и попробуйте снова.",
      );
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <main className="page-shell">
      <div className="content-shell space-y-6">
        <header className="flex flex-col gap-4 pt-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-ember-100/80">
              Player's Grimoire
            </p>
            <h1 className="mt-2 text-3xl font-bold text-stone-50 sm:text-4xl">
              Башня: заметки игрока
            </h1>
            <div>
              <Link to="/games/new" className="primary-button w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Новая партия
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end lg:self-start">
            <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-2">
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                История игр
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex">
                <button type="button" onClick={exportArchive} className="secondary-button w-full sm:w-auto">
                  <Download className="h-4 w-4" />
                  Выгрузить историю
                </button>
                <label className="secondary-button w-full cursor-pointer sm:w-auto">
                  <Upload className="h-4 w-4" />
                  {importing ? "Загрузка..." : "Загрузить историю"}
                  <input type="file" accept=".json,application/json" onChange={importArchive} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </header>

        <section className="panel p-2 sm:p-3">
          <div className="grid grid-cols-3 gap-2">
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
            <button
              type="button"
              onClick={() => setActiveTab("trash")}
              className={activeTab === "trash" ? "primary-button w-full" : "secondary-button w-full"}
            >
              <Trash2 className="h-4 w-4" />
              Корзина
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
        ) : activeTab === "trash" ? (
          trashedGames.length === 0 ? (
            <section className="panel flex min-h-56 flex-col items-center justify-center p-6 text-center">
              <p className="text-xl font-semibold text-stone-50">Корзина пуста.</p>
              <p className="mt-2 text-sm text-stone-400">Сюда попадают партии, которые вы убрали из общей библиотеки.</p>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-50">Корзина партий</h2>
                  <p className="text-sm text-stone-400">Партии в корзине ещё можно вернуть. Очистка удаляет их безвозвратно.</p>
                </div>
                <button type="button" onClick={clearTrash} className="danger-button w-full sm:w-auto">
                  <Trash2 className="h-4 w-4" />
                  Очистить корзину
                </button>
              </div>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {trashedGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    onTogglePin={togglePin}
                    onMoveToTrash={moveToTrash}
                    onRestoreFromTrash={restoreFromTrash}
                    onDuplicateSetup={duplicateSetup}
                    conclusionText={gameConclusionById.get(game.id)}
                    trashMode
                  />
                ))}
              </section>
            </section>
          )
        ) : visibleGames.length === 0 ? (
          <section className="panel flex min-h-72 flex-col items-center justify-center p-6 text-center">
            <p className="text-xl font-semibold text-stone-50">Пока нет сыгранных партий.</p>
            <p className="mt-2 text-sm text-stone-400">
              Создайте первую партию или импортируйте JSON с другого устройства.
            </p>
            <div className="mt-5 grid w-full max-w-sm gap-2">
              <label className="secondary-button w-full cursor-pointer">
                <FileJson className="h-4 w-4" />
                {importing ? "Загрузка..." : "Загрузить историю"}
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
            {visibleGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onTogglePin={togglePin}
                onMoveToTrash={moveToTrash}
                onRestoreFromTrash={restoreFromTrash}
                onDuplicateSetup={duplicateSetup}
                conclusionText={gameConclusionById.get(game.id)}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
