import { ArrowDown, ArrowUp, FileJson, Plus, Save, Trash2, X } from "lucide-react";
import { ChangeEvent, useState } from "react";
import type { Game, Phase, Player, PlayerTeam, RoleType, ScriptRole } from "../types";
import { phaseTitle, sortPhases } from "../utils/dates";
import { createId } from "../utils/ids";
import {
  defaultTravellerRoles,
  mergeScriptRoles,
  parseScriptJson,
  prettifyRoleName,
} from "../utils/scripts";

type SetupEditorModalProps = {
  game: Game | null;
  players: Player[];
  phases: Phase[];
  onClose: () => void;
  onSave: (
    gameValues: Pick<
      Game,
      "title" | "date" | "storyteller" | "scriptName" | "scriptAuthor" | "scriptRoles"
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

export default function SetupEditorModal({ game, players, phases, onClose, onSave }: SetupEditorModalProps) {
  if (!game) {
    return null;
  }

  return (
    <SetupEditorForm
      key={game.updatedAt}
      game={game}
      players={players}
      phases={phases}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function SetupEditorForm({ game, players, phases, onClose, onSave }: SetupEditorFormProps) {
  const sortedPhases = sortPhases(phases);
  const sortedPlayers = [...players].filter((player) => !player.isTraveller).sort((a, b) => a.seatIndex - b.seatIndex);
  const existingTravellers = [...players].filter((player) => player.isTraveller).sort((a, b) => a.seatIndex - b.seatIndex);
  const [title, setTitle] = useState(game.title);
  const [date, setDate] = useState(game.date);
  const [storyteller, setStoryteller] = useState(game.storyteller ?? "");
  const [scriptName, setScriptName] = useState(game.scriptName ?? "");
  const [scriptAuthor, setScriptAuthor] = useState(game.scriptAuthor ?? "");
  const [scriptRoles, setScriptRoles] = useState<ScriptRole[]>(game.scriptRoles ?? []);
  const [playerNames, setPlayerNames] = useState(
    sortedPlayers.map((player) => ({ id: player.id, name: player.name })),
  );
  const [travellers, setTravellers] = useState(
    existingTravellers.map((traveller) => ({
      id: traveller.id,
      name: traveller.name,
      travellerRole: traveller.travellerRole ?? traveller.mainRole ?? "",
      travellerTeam: traveller.travellerTeam ?? "unknown",
      mainRole: traveller.mainRole && traveller.mainRole !== traveller.travellerRole ? traveller.mainRole : "",
      joinedPhaseId: traveller.joinedPhaseId ?? "",
      leftPhaseId: traveller.leftPhaseId ?? "",
    })),
  );
  const [deletedTravellerIds, setDeletedTravellerIds] = useState<string[]>([]);
  const [newTravellerName, setNewTravellerName] = useState("");
  const [newTravellerRole, setNewTravellerRole] = useState("");
  const [newTravellerJoinedPhaseId, setNewTravellerJoinedPhaseId] = useState(sortedPhases[0]?.id ?? "");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleType, setNewRoleType] = useState<RoleType>("traveller");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const travellerRoleOptions = mergeScriptRoles(
    defaultTravellerRoles,
    scriptRoles.filter((role) => role.type === "traveller"),
  );

  const handleScriptFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = parseScriptJson(JSON.parse(await file.text()));

      setScriptName(parsed.name ?? file.name.replace(/\.json$/i, ""));
      setScriptAuthor(parsed.author ?? "");
      setScriptRoles((current) => mergeScriptRoles(current, parsed.roles));
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось прочитать JSON сценария.");
    } finally {
      event.target.value = "";
    }
  };

  const updatePlayerName = (playerId: string, name: string) => {
    setPlayerNames((current) =>
      current.map((player) => (player.id === playerId ? { ...player, name } : player)),
    );
  };

  const movePlayerName = (playerId: string, direction: -1 | 1) => {
    setPlayerNames((current) => {
      const index = current.findIndex((player) => player.id === playerId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const updateTraveller = (travellerId: string, values: Partial<(typeof travellers)[number]>) => {
    setTravellers((current) =>
      current.map((traveller) => (traveller.id === travellerId ? { ...traveller, ...values } : traveller)),
    );
  };

  const addTraveller = () => {
    const trimmedName = newTravellerName.trim();

    if (!trimmedName) {
      setError("Введите имя Traveller.");
      return;
    }

    if (!newTravellerRole) {
      setError("Выберите роль Traveller.");
      return;
    }

    setTravellers((current) => [
      ...current,
      {
        id: createId(),
        name: trimmedName,
        travellerRole: newTravellerRole,
        travellerTeam: "unknown",
        mainRole: "",
        joinedPhaseId: newTravellerJoinedPhaseId,
        leftPhaseId: "",
      },
    ]);
    setNewTravellerName("");
    setNewTravellerRole("");
    setError("");
  };

  const removeTraveller = (travellerId: string) => {
    if (existingTravellers.some((traveller) => traveller.id === travellerId)) {
      setDeletedTravellerIds((current) => [...current, travellerId]);
    }

    setTravellers((current) => current.filter((traveller) => traveller.id !== travellerId));
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

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Название партии обязательно.");
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
      const travellerPlayerValues = travellers.map((traveller, index) => ({
        id: traveller.id,
        name: traveller.name.trim() || `Traveller ${index + 1}`,
        mainRole: traveller.mainRole || undefined,
        seatIndex: playerNames.length + index,
        isTraveller: true,
        travellerRole: traveller.travellerRole || traveller.mainRole || undefined,
        travellerTeam: traveller.travellerTeam,
        joinedPhaseId: traveller.joinedPhaseId || undefined,
        leftPhaseId: traveller.leftPhaseId || undefined,
      }));

      await onSave(
        {
          title: title.trim(),
          date,
          storyteller: storyteller.trim() || undefined,
          scriptName: scriptName.trim() || undefined,
          scriptAuthor: scriptAuthor.trim() || undefined,
          scriptRoles,
        },
        [...regularPlayerValues, ...travellerPlayerValues],
        deletedTravellerIds,
      );
      onClose();
    } catch {
      setError("Не удалось сохранить настройки.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:max-w-5xl sm:rounded-3xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-stone-400">Setup активной партии</p>
            <h2 className="text-2xl font-bold text-stone-50">Редактирование</h2>
          </div>
          <button type="button" onClick={onClose} className="secondary-button px-3">
            <X className="h-5 w-5" />
          </button>
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

            <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-stone-50">Сценарий</h3>
                  <p className="text-sm text-stone-400">{scriptRoles.length} ролей</p>
                </div>
                <label className="secondary-button cursor-pointer">
                  <FileJson className="h-4 w-4" />
                  Загрузить JSON
                  <input type="file" accept=".json,application/json" onChange={handleScriptFile} className="hidden" />
                </label>
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
              <h3 className="mb-3 font-semibold text-stone-50">Имена игроков</h3>
              <div className="space-y-3">
                {playerNames.map((player, index) => (
                  <div
                    key={player.id}
                    className="grid gap-2 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:grid-cols-[92px_1fr_auto] sm:items-center"
                  >
                    <span className="label">Игрок {index + 1}</span>
                    <input
                      value={player.name}
                      onChange={(event) => updatePlayerName(player.id, event.target.value)}
                      className="field"
                    />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => movePlayerName(player.id, -1)}
                          disabled={index === 0}
                          className="secondary-button h-8 min-h-0 px-2 disabled:cursor-not-allowed disabled:opacity-35"
                          title="Сдвинуть место выше"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => movePlayerName(player.id, 1)}
                          disabled={index === playerNames.length - 1}
                          className="secondary-button h-8 min-h-0 px-2 disabled:cursor-not-allowed disabled:opacity-35"
                          title="Сдвинуть место ниже"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
              <h3 className="font-semibold text-stone-50">Travellers за столом</h3>
              <p className="mt-1 text-sm text-stone-400">
                Traveller добавляется как отдельный игрок и получает жетон в круге.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input
                  value={newTravellerName}
                  onChange={(event) => setNewTravellerName(event.target.value)}
                  className="field"
                  placeholder="Имя Traveller"
                />
                <select
                  value={newTravellerRole}
                  onChange={(event) => setNewTravellerRole(event.target.value)}
                  className="field"
                >
                  <option value="">Роль Traveller</option>
                  {travellerRoleOptions.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newTravellerJoinedPhaseId}
                  onChange={(event) => setNewTravellerJoinedPhaseId(event.target.value)}
                  className="field"
                >
                  <option value="">Фаза прихода</option>
                  {sortedPhases.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.title || phaseTitle(phase.number, phase.type)}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addTraveller} className="primary-button">
                  <Plus className="h-4 w-4" />
                  Traveller
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {travellers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-ember-200/15 p-4 text-center text-sm text-stone-400">
                    Travellers пока не добавлены.
                  </p>
                ) : (
                  travellers.map((traveller) => (
                    <div key={traveller.id} className="rounded-xl border border-ember-200/10 bg-ink-900/60 p-3">
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                        <input
                          value={traveller.name}
                          onChange={(event) => updateTraveller(traveller.id, { name: event.target.value })}
                          className="field"
                        />
                        <select
                          value={traveller.travellerRole}
                          onChange={(event) => updateTraveller(traveller.id, { travellerRole: event.target.value })}
                          className="field"
                        >
                          <option value="">Роль Traveller</option>
                          {travellerRoleOptions.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={traveller.joinedPhaseId}
                          onChange={(event) => updateTraveller(traveller.id, { joinedPhaseId: event.target.value })}
                          className="field"
                        >
                          <option value="">Пришел</option>
                          {sortedPhases.map((phase) => (
                            <option key={phase.id} value={phase.id}>
                              {phase.title || phaseTitle(phase.number, phase.type)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={traveller.leftPhaseId}
                          onChange={(event) => updateTraveller(traveller.id, { leftPhaseId: event.target.value })}
                          className="field"
                        >
                          <option value="">Еще в игре</option>
                          {sortedPhases.map((phase) => (
                            <option key={phase.id} value={phase.id}>
                              Ушел: {phase.title || phaseTitle(phase.number, phase.type)}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => removeTraveller(traveller.id)} className="danger-button px-3">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <select
                          value={traveller.travellerTeam}
                          onChange={(event) =>
                            updateTraveller(traveller.id, { travellerTeam: event.target.value as PlayerTeam })
                          }
                          className="field"
                        >
                          <option value="unknown">Команда неизвестна</option>
                          <option value="good">Синий / добро</option>
                          <option value="evil">Красный / зло</option>
                        </select>
                        <select
                          value={traveller.mainRole}
                          onChange={(event) => updateTraveller(traveller.id, { mainRole: event.target.value })}
                          className="field"
                        >
                          <option value="">Доп. роль из сценария</option>
                          {scriptRoles
                            .filter((role) => role.type !== "traveller" && role.type !== "fabled" && role.type !== "loric")
                            .map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-ember-200/10 bg-black/15 p-4">
              <h3 className="font-semibold text-stone-50">Добавить роль</h3>
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

            <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-2xl border border-ember-200/10 bg-black/15 p-3">
              {scriptRoles.length === 0 ? (
                <p className="p-4 text-center text-sm text-stone-400">Роли пока не добавлены.</p>
              ) : (
                scriptRoles.map((role) => (
                  <div
                    key={`${role.type}-${role.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ember-200/10 bg-ink-900/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-100">{role.name}</p>
                      <p className="text-xs uppercase tracking-wide text-stone-500">{role.type}</p>
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

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="secondary-button">
            Отмена
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="primary-button">
            <Save className="h-4 w-4" />
            {saving ? "Сохранение" : "Сохранить setup"}
          </button>
        </div>
      </div>
    </div>
  );
}
