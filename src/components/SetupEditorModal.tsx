import clsx from "clsx";
import { FileJson, Link as LinkIcon, Minus, Plus, Save, Trash2, X } from "lucide-react";
import { ChangeEvent, useState } from "react";
import type { Game, Player, RoleType, ScriptRole } from "../types";
import { baseScriptPresets } from "../utils/baseScripts";
import { createId } from "../utils/ids";
import { readImportedScript, readImportedScriptUrl } from "../utils/importErrors";
import { getRoleLabel, mergeScriptRoles, prettifyRoleName } from "../utils/scripts";

type SetupEditorModalProps = {
  game: Game | null;
  players: Player[];
  lightTheme?: boolean;
  onClose: () => void;
  onSave: (
    gameValues: Pick<
      Game,
      "title" | "date" | "storyteller" | "scriptName" | "scriptVersion" | "scriptAuthor" | "scriptRoles" | "playerCount"
    >,
    playerValues: Array<
      Pick<
        Player,
        | "id"
        | "name"
        | "mainRole"
        | "isTraveller"
        | "travellerRole"
        | "travellerTeam"
        | "joinedPhaseId"
        | "leftPhaseId"
        | "seatIndex"
      >
    >,
    deletedPlayerIds: string[],
  ) => Promise<void>;
};

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 15;

type SetupEditorFormProps = Omit<SetupEditorModalProps, "game"> & {
  game: Game;
};

const editableRoleTypes: Array<{ value: RoleType; label: string }> = [
  { value: "traveller", label: "Traveller" },
  { value: "fabled", label: "Fabled" },
  { value: "loric", label: "Loric" },
  { value: "townsfolk", label: "Townsfolk" },
  { value: "outsider", label: "Outsider" },
  { value: "minion", label: "Minion" },
  { value: "demon", label: "Demon" },
  { value: "unknown", label: "Другое" },
];

export default function SetupEditorModal({ game, players, lightTheme = false, onClose, onSave }: SetupEditorModalProps) {
  if (!game) {
    return null;
  }

  return <SetupEditorForm key={game.updatedAt} game={game} players={players} lightTheme={lightTheme} onClose={onClose} onSave={onSave} />;
}

function SetupEditorForm({ game, players, lightTheme = false, onClose, onSave }: SetupEditorFormProps) {
  const sortedPlayers = [...players].filter((player) => !player.isTraveller).sort((a, b) => a.seatIndex - b.seatIndex);
  const [title, setTitle] = useState(game.title);
  const [date, setDate] = useState(game.date);
  const [storyteller, setStoryteller] = useState(game.storyteller ?? "");
  const [scriptName, setScriptName] = useState(game.scriptName ?? "");
  const [scriptVersion, setScriptVersion] = useState(game.scriptVersion ?? "");
  const [scriptAuthor, setScriptAuthor] = useState(game.scriptAuthor ?? "");
  const [scriptRoles, setScriptRoles] = useState<ScriptRole[]>(game.scriptRoles ?? []);
  const [scriptUrl, setScriptUrl] = useState("");
  const [playerNames, setPlayerNames] = useState(
    sortedPlayers.map((player) => ({ id: player.id, name: player.name })),
  );
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleType, setNewRoleType] = useState<RoleType>("traveller");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingScriptUrl, setLoadingScriptUrl] = useState(false);
  const canEditPlayerCount = !game.hasStarted;

  const applyParsedScript = (parsed: Awaited<ReturnType<typeof readImportedScript>>, fallbackName: string) => {
    setScriptName(parsed.name ?? fallbackName);
    setScriptVersion(parsed.version ?? "");
    setScriptAuthor(parsed.author ?? "");
    setScriptRoles((current) => mergeScriptRoles(current, parsed.roles));
    setError("");
  };

  const handleScriptFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      applyParsedScript(await readImportedScript(file), file.name.replace(/\.json$/i, ""));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось прочитать сценарий. Проверьте файл и попробуйте снова.",
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleScriptUrl = async () => {
    setLoadingScriptUrl(true);

    try {
      applyParsedScript(await readImportedScriptUrl(scriptUrl), "Сценарий по ссылке");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить сценарий по ссылке. Проверьте адрес и попробуйте снова.",
      );
    } finally {
      setLoadingScriptUrl(false);
    }
  };

  const updatePlayerName = (playerId: string, name: string) => {
    setPlayerNames((current) =>
      current.map((player) => (player.id === playerId ? { ...player, name } : player)),
    );
  };

  const updatePlayerCount = (value: number) => {
    const nextCount = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, value || MIN_PLAYERS));

    setPlayerNames((current) =>
      Array.from({ length: nextCount }, (_, index) => current[index] ?? { id: createId(), name: "" }),
    );
  };

  const addRole = () => {
    const trimmedName = newRoleName.trim();

    if (!trimmedName) {
      setError("Введите название роли.");
      return;
    }

    const id = trimmedName.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "_").replace(/^_+|_+$/g, "");
    const role: ScriptRole = {
      id: id || crypto.randomUUID(),
      name: prettifyRoleName(trimmedName),
      type: newRoleType,
    };

    setScriptRoles((current) => mergeScriptRoles(current, [role]));
    setNewRoleName("");
    setError("");
  };

  const removeRole = (roleId: string) => {
    setScriptRoles((current) => current.filter((role) => role.id !== roleId));
  };

  const applyBaseScript = (presetId: (typeof baseScriptPresets)[number]["id"]) => {
    const preset = baseScriptPresets.find((item) => item.id === presetId);

    if (!preset) {
      return;
    }

    setScriptName(preset.name);
    setScriptVersion("");
    setScriptAuthor(preset.author);
    setScriptRoles(preset.roles);
    setError("");
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Название партии обязательно.");
      return;
    }

    if (!storyteller.trim()) {
      setError("Имя ведущего обязательно.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const regularPlayerValues = playerNames.map((player, index) => ({
        id: player.id,
        name: player.name.trim() || `Игрок ${index + 1}`,
        mainRole: players.find((currentPlayer) => currentPlayer.id === player.id)?.mainRole,
        seatIndex: index,
        isTraveller: false,
        travellerRole: undefined,
        travellerTeam: undefined,
        joinedPhaseId: undefined,
        leftPhaseId: undefined,
      }));

      await onSave(
        {
          title: title.trim(),
          date,
          storyteller: storyteller.trim(),
          scriptName: scriptName.trim() || undefined,
          scriptVersion: scriptVersion.trim() || undefined,
          scriptAuthor: scriptAuthor.trim() || undefined,
          scriptRoles,
          playerCount: playerNames.length,
        },
        regularPlayerValues,
        sortedPlayers
          .filter((player) => !playerNames.some((currentPlayer) => currentPlayer.id === player.id))
          .map((player) => player.id),
      );
      onClose();
    } catch {
      setError("Не удалось сохранить настройки.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={clsx(
          "relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border p-4 pb-20 shadow-2xl sm:mx-auto sm:max-w-5xl sm:rounded-3xl sm:p-6 sm:pb-24",
          lightTheme
            ? "border-amber-700/18 bg-[#f7eddc] text-stone-800 shadow-[0_22px_60px_rgba(60,44,20,0.18)]"
            : "border-ember-200/15 bg-ink-850",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start gap-3">
          <div>
            <p className={clsx("text-sm", lightTheme ? "text-stone-500" : "text-stone-400")}>Setup активной партии</p>
            <h2 className={clsx("text-2xl font-bold", lightTheme ? "text-stone-800" : "text-stone-50")}>Редактирование</h2>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 sm:col-span-2">
                <span className="label">Название партии</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="field" />
              </label>
              <label className="block space-y-2">
                <span className="label">Дата</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="field" />
              </label>
              <label className="block space-y-2">
                <span className="label">Ведущий</span>
                <input
                  value={storyteller}
                  onChange={(event) => setStoryteller(event.target.value)}
                  className="field"
                />
              </label>
            </div>

            <div className={clsx("rounded-2xl border p-4", lightTheme ? "border-amber-700/14 bg-white/55" : "border-ember-200/10 bg-black/15")}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className={clsx("font-semibold", lightTheme ? "text-stone-800" : "text-stone-50")}>Сценарий</h3>
                  <p className={clsx("text-sm", lightTheme ? "text-stone-500" : "text-stone-400")}>{scriptRoles.length} ролей</p>
                </div>
                <label className="secondary-button cursor-pointer">
                  <FileJson className="h-4 w-4" />
                  Загрузить JSON
                  <input type="file" accept=".json,application/json" onChange={handleScriptFile} className="hidden" />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {baseScriptPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyBaseScript(preset.id)}
                    className={scriptName === preset.name ? "primary-button min-h-10 px-3" : "secondary-button min-h-10 px-3"}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="url"
                  value={scriptUrl}
                  onChange={(event) => setScriptUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && scriptUrl.trim()) {
                      event.preventDefault();
                      void handleScriptUrl();
                    }
                  }}
                  className="field"
                  placeholder="https://www.botcscripts.com/api/scripts/15466/json/"
                />
                <button
                  type="button"
                  onClick={handleScriptUrl}
                  disabled={loadingScriptUrl || !scriptUrl.trim()}
                  className="secondary-button min-h-12 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LinkIcon className="h-4 w-4" />
                  {loadingScriptUrl ? "Загрузка" : "Загрузить"}
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="label">Название сценария</span>
                  <input
                    value={scriptName}
                    onChange={(event) => setScriptName(event.target.value)}
                    className="field"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="label">Автор</span>
                  <input
                    value={scriptAuthor}
                    onChange={(event) => setScriptAuthor(event.target.value)}
                    className="field"
                  />
                </label>
              </div>
            </div>

            <div>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className={clsx("font-semibold", lightTheme ? "text-stone-800" : "text-stone-50")}>Имена игроков</h3>
                  <p className={clsx("text-sm", lightTheme ? "text-stone-500" : "text-stone-400")}>{playerNames.length} игроков за столом</p>
                </div>
                {canEditPlayerCount ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updatePlayerCount(playerNames.length - 1)}
                      disabled={playerNames.length <= MIN_PLAYERS}
                      className="secondary-button h-10 min-h-0 w-10 shrink-0 px-0 disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="Уменьшить количество игроков"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="field flex h-10 w-14 items-center justify-center px-0 text-center font-semibold">
                      {playerNames.length}
                    </div>
                    <button
                      type="button"
                      onClick={() => updatePlayerCount(playerNames.length + 1)}
                      disabled={playerNames.length >= MAX_PLAYERS}
                      className="secondary-button h-10 min-h-0 w-10 shrink-0 px-0 disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="Увеличить количество игроков"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                {playerNames.map((player, index) => (
                  <div
                    key={player.id}
                    className={clsx(
                      "grid gap-2 rounded-2xl border p-3 sm:grid-cols-[92px_1fr] sm:items-center",
                      lightTheme ? "border-amber-700/14 bg-white/55" : "border-ember-200/10 bg-black/15",
                    )}
                  >
                    <span className="label">Игрок {index + 1}</span>
                    <input
                      value={player.name}
                      onChange={(event) => updatePlayerName(player.id, event.target.value)}
                      className="field"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className={clsx("rounded-2xl border p-4", lightTheme ? "border-amber-700/14 bg-white/55" : "border-ember-200/10 bg-black/15")}>
              <h3 className={clsx("font-semibold", lightTheme ? "text-stone-800" : "text-stone-50")}>Добавить роль</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                <input
                  value={newRoleName}
                  onChange={(event) => setNewRoleName(event.target.value)}
                  className="field"
                  placeholder="Например, Big Wig"
                />
                <select
                  value={newRoleType}
                  onChange={(event) => setNewRoleType(event.target.value as RoleType)}
                  className="field"
                >
                  {editableRoleTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addRole} className="primary-button">
                  <Plus className="h-4 w-4" />
                  Добавить
                </button>
              </div>
            </div>

            <div className={clsx("max-h-[420px] space-y-2 overflow-y-auto rounded-2xl border p-3", lightTheme ? "border-amber-700/14 bg-white/55" : "border-ember-200/10 bg-black/15")}>
              {scriptRoles.length === 0 ? (
                <p className={clsx("p-4 text-center text-sm", lightTheme ? "text-stone-500" : "text-stone-400")}>Роли пока не добавлены.</p>
              ) : (
                scriptRoles.map((role) => (
                  <div
                    key={`${role.type}-${role.id}`}
                    className={clsx(
                      "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                      lightTheme ? "border-amber-700/14 bg-[#eadfce]" : "border-ember-200/10 bg-ink-900/60",
                    )}
                  >
                    <div className="min-w-0">
                      <p className={clsx("truncate font-medium", lightTheme ? "text-stone-800" : "text-stone-100")}>{getRoleLabel(role.id, scriptRoles)}</p>
                      <p className={clsx("text-xs uppercase tracking-wide", lightTheme ? "text-stone-500" : "text-stone-500")}>{role.type}</p>
                    </div>
                    <button type="button" onClick={() => removeRole(role.id)} className="danger-button px-3">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {error ? <p className="mt-4 text-sm text-red-200">{error}</p> : null}

        <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[95] sm:bottom-5 sm:right-5">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              aria-label={saving ? "Сохранение setup" : "Сохранить setup"}
              title={saving ? "Сохранение setup" : "Сохранить setup"}
              className="modal-save-button h-11 w-11"
            >
              <Save className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              title="Закрыть"
              className="modal-close-button h-11 w-11"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
