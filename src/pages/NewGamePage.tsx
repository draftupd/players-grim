import { ArrowLeft, FileJson, Minus, Plus, Save, X } from "lucide-react";
import { ChangeEvent, FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../db/db";
import type { Game, Phase, Player, ScriptRole } from "../types";
import { formatDate, phaseTitle, timestamp, todayInputValue } from "../utils/dates";
import { createId } from "../utils/ids";
import { parseScriptJson } from "../utils/scripts";

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 15;

export default function NewGamePage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayInputValue());
  const [title, setTitle] = useState(`Партия от ${formatDate(todayInputValue())}`);
  const [storyteller, setStoryteller] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [scriptAuthor, setScriptAuthor] = useState("");
  const [scriptRoles, setScriptRoles] = useState<ScriptRole[]>([]);
  const [playerCount, setPlayerCount] = useState(8);
  const [playerNames, setPlayerNames] = useState<string[]>(Array.from({ length: 8 }, () => ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updatePlayerCount = (value: number) => {
    const nextCount = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, value || MIN_PLAYERS));
    setPlayerCount(nextCount);
    setPlayerNames((current) =>
      Array.from({ length: nextCount }, (_, index) => current[index] ?? ""),
    );
  };

  const updatePlayerName = (index: number, value: string) => {
    setPlayerNames((current) =>
      current.map((name, currentIndex) => (currentIndex === index ? value : name)),
    );
  };

  const handleScriptFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = parseScriptJson(JSON.parse(await file.text()));
      const nextScriptName = parsed.name ?? file.name.replace(/\.json$/i, "");

      setScriptName(nextScriptName);
      setScriptAuthor(parsed.author ?? "");
      setScriptRoles(parsed.roles);
      setTitle((current) => (current.trim() ? current : nextScriptName));
      setError("");
    } catch (error) {
      setScriptName("");
      setScriptAuthor("");
      setScriptRoles([]);
      setError(error instanceof Error ? error.message : "Не удалось прочитать JSON сценария.");
    } finally {
      event.target.value = "";
    }
  };

  const clearScript = () => {
    setScriptName("");
    setScriptAuthor("");
    setScriptRoles([]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError("Название партии обязательно.");
      return;
    }

    setSaving(true);
    setError("");

    const gameId = createId();
    const now = timestamp();

    const game: Game = {
      id: gameId,
      title: trimmedTitle,
      date,
      storyteller: storyteller.trim() || undefined,
      scriptName: scriptName.trim() || undefined,
      scriptAuthor: scriptAuthor.trim() || undefined,
      scriptRoles,
      playerCount,
      status: "active",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const players: Player[] = Array.from({ length: playerCount }, (_, index) => ({
      id: createId(),
      gameId,
      name: playerNames[index]?.trim() || `Игрок ${index + 1}`,
      seatIndex: index,
      alive: true,
      additionalRoles: ["", "", ""],
      createdAt: now,
      updatedAt: now,
    }));

    const initialPhaseItems: Array<Pick<Phase, "number" | "type">> = [
      { number: 1, type: "night" },
      { number: 1, type: "day" },
      { number: 2, type: "night" },
      { number: 2, type: "day" },
    ];

    const phases: Phase[] = initialPhaseItems.map((phase) => ({
      id: createId(),
      gameId,
      number: phase.number,
      type: phase.type,
      title: phaseTitle(phase.number, phase.type),
      createdAt: now,
    }));

    try {
      await db.transaction("rw", db.games, db.players, db.phases, async () => {
        await db.games.add(game);
        await db.players.bulkAdd(players);
        await db.phases.bulkAdd(phases);
      });

      navigate(`/games/${gameId}`);
    } catch {
      setError("Не удалось создать партию.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="content-shell max-w-4xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-ember-100/80">
              Новая партия
            </p>
            <h1 className="mt-2 text-3xl font-bold text-stone-50">Настройка игры</h1>
          </div>
          <Link to="/" className="secondary-button px-3">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </header>

        <form onSubmit={handleSubmit} className="panel space-y-5 p-4 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2 md:col-span-2">
              <span className="label">Название</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="field" />
            </label>

            <label className="block space-y-2">
              <span className="label">Дата проведения</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="field"
              />
            </label>

            <label className="block space-y-2">
              <span className="label">Ведущий</span>
              <input
                value={storyteller}
                onChange={(event) => setStoryteller(event.target.value)}
                className="field"
                placeholder="Имя ведущего"
              />
            </label>

            <div className="block space-y-2">
              <span className="label">Количество игроков</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updatePlayerCount(playerCount - 1)}
                  disabled={playerCount <= MIN_PLAYERS}
                  className="secondary-button h-12 min-h-0 w-12 shrink-0 px-0 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Уменьшить количество игроков"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="field flex h-12 items-center justify-center text-center text-lg font-semibold">
                  {playerCount}
                </div>
                <button
                  type="button"
                  onClick={() => updatePlayerCount(playerCount + 1)}
                  disabled={playerCount >= MAX_PLAYERS}
                  className="secondary-button h-12 min-h-0 w-12 shrink-0 px-0 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Увеличить количество игроков"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-stone-500">От {MIN_PLAYERS} до {MAX_PLAYERS} обычных игроков.</p>
            </div>
          </div>

          <section className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-stone-50">Сценарий</h2>
                <p className="text-sm text-stone-400">Загрузите JSON из Script Tool.</p>
              </div>
              <label className="secondary-button cursor-pointer">
                <FileJson className="h-4 w-4" />
                Загрузить JSON
                <input type="file" accept=".json,application/json" onChange={handleScriptFile} className="hidden" />
              </label>
            </div>

            {scriptRoles.length > 0 ? (
              <div className="mt-4 rounded-xl border border-ember-200/10 bg-ink-900/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-stone-50">{scriptName || "Сценарий"}</p>
                    <p className="mt-1 text-sm text-stone-400">
                      {scriptRoles.length} ролей{scriptAuthor ? `, автор: ${scriptAuthor}` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={clearScript} className="secondary-button min-h-10 px-3">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-stone-50">Игроки</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {playerNames.map((name, index) => (
                <label key={index} className="block space-y-2">
                  <span className="label">Игрок {index + 1}</span>
                  <input
                    value={name}
                    onChange={(event) => updatePlayerName(index, event.target.value)}
                    className="field"
                    placeholder={`Игрок ${index + 1}`}
                  />
                </label>
              ))}
            </div>
          </section>

          {error ? <p className="text-sm text-red-200">{error}</p> : null}

          <button type="submit" disabled={saving} className="primary-button w-full sm:w-auto">
            <Save className="h-4 w-4" />
            {saving ? "Создание" : "Создать партию"}
          </button>
        </form>
      </div>
    </main>
  );
}
