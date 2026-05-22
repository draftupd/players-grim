import { Edit3, Save, Send, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Note, Phase, Player, ScriptRole } from "../types";
import { formatDate } from "../utils/dates";
import { mergeManualAndMentionLinks } from "../utils/mentions";
import { groupRolesByType, normalizeRoleId, prettifyRoleName } from "../utils/scripts";
import MentionTextarea from "./MentionTextarea";
import RoleIconGrid from "./RoleIconGrid";

type RoleIntelPanelProps = {
  phase?: Phase;
  notes: Note[];
  players: Player[];
  roles: ScriptRole[];
  onAddNote: (roleId: string, text: string, linkedPlayerIds: string[]) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onUpdateNote: (noteId: string, text: string, linkedPlayerIds: string[]) => Promise<void>;
};

const getRoleNoteTitle = (roleId?: string) => {
  const normalized = normalizeRoleId(roleId ?? "");

  if (normalized === "noble") {
    return "Показанные игроки Noble";
  }

  return "Заметка по роли";
};

export default function RoleIntelPanel({
  phase,
  notes,
  players,
  roles,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
}: RoleIntelPanelProps) {
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [genericText, setGenericText] = useState("");
  const [nobleShownIds, setNobleShownIds] = useState<string[]>(["", "", ""]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sortedRoles = useMemo(
    () =>
      [...roles].sort((a, b) =>
        (a.name || prettifyRoleName(a.id)).localeCompare(b.name || prettifyRoleName(b.id), "ru"),
      ),
    [roles],
  );
  const roleGroups = useMemo(
    () =>
      groupRolesByType(sortedRoles).map((group) => ({
        key: group.type,
        label: group.label,
        roleIds: group.roles.map((role) => role.id),
      })),
    [sortedRoles],
  );
  const roleGroupsByKey = useMemo(
    () => new Map(roleGroups.map((group) => [group.key, group])),
    [roleGroups],
  );
  const townsfolkRoleGroup = roleGroupsByKey.get("townsfolk");
  const sideRoleGroups = ["outsider", "minion", "demon"]
    .map((key) => roleGroupsByKey.get(key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const miscRoleGroups = ["traveller", "fabled", "loric"]
    .map((key) => roleGroupsByKey.get(key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const miscRoleGroup = useMemo(
    () =>
      miscRoleGroups.length > 0
        ? {
            key: "misc",
            roleIds: miscRoleGroups.flatMap((group) => group.roleIds),
          }
        : null,
    [miscRoleGroups],
  );
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const isNobleSelected = normalizeRoleId(selectedRoleId) === "noble";

  const resetComposer = () => {
    setGenericText("");
    setNobleShownIds(["", "", ""]);
  };

  const buildRoleText = () => {
    if (!selectedRoleId) {
      return { text: "", linkedPlayerIds: [] as string[] };
    }

    if (isNobleSelected) {
      const uniqueIds = nobleShownIds.filter(Boolean);

      if (uniqueIds.length !== 3 || new Set(uniqueIds).size !== 3) {
        return { text: "", linkedPlayerIds: [] };
      }

      const names = uniqueIds.map((playerId) => playersById.get(playerId)?.name ?? "Неизвестно");
      return {
        text: `Noble увидел: ${names.join(", ")}`,
        linkedPlayerIds: uniqueIds,
      };
    }

    const trimmed = genericText.trim();
    return { text: trimmed, linkedPlayerIds: [] };
  };

  const handleAdd = async () => {
    const { text, linkedPlayerIds } = buildRoleText();

    if (!selectedRoleId) {
      setError("Сначала выберите роль.");
      return;
    }

    if (!text) {
      setError(isNobleSelected ? "Выберите трёх игроков для Noble." : "Заполни заметку по роли.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onAddNote(selectedRoleId, text, linkedPlayerIds);
      resetComposer();
    } catch {
      setError("Не удалось сохранить ролевую заметку.");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingText(note.text);
  };

  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditingText("");
  };

  const saveEditing = async (note: Note) => {
    const trimmed = editingText.trim();

    if (!trimmed) {
      setError("Заполни заметку по роли.");
      return;
    }

    try {
      await onUpdateNote(
        note.id,
        trimmed,
        normalizeRoleId(note.roleId ?? "") === "noble"
          ? note.linkedPlayerIds
          : mergeManualAndMentionLinks(trimmed, players, note.linkedPlayerIds),
      );
      cancelEditing();
      setError("");
    } catch {
      setError("Не удалось обновить ролевую заметку.");
    }
  };

  if (!phase) {
    return <section className="panel p-5 text-center text-stone-300">Фаза пока не выбрана.</section>;
  }

  return (
    <section className="panel min-w-0 p-3 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-50">{phase.title}</h2>
        <p className="text-sm text-stone-400">Записи по конкретным ролям</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:p-4">
        <div className="p-1">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-ember-100/75">
            {selectedRoleId
              ? `Выбрана роль: ${sortedRoles.find((role) => role.id === selectedRoleId)?.name ?? prettifyRoleName(selectedRoleId)}`
              : "Выберите роль"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              {townsfolkRoleGroup ? (
                <RoleIconGrid
                  groups={[townsfolkRoleGroup]}
                  roles={sortedRoles}
                  selectedRoleId={selectedRoleId}
                  onSelect={setSelectedRoleId}
                  groupClassName="rounded-2xl border border-ember-200/10 px-1 py-0.5"
                  columnsClassName="grid-cols-5 gap-0.5"
                  buttonClassName="rounded-sm"
                  iconClassName="h-6 w-6"
                  unframed
                  showGroupLabel={false}
                />
              ) : (
                <div className="rounded-2xl border border-ember-200/10 px-1 py-0.5" />
              )}
              {miscRoleGroup ? (
                <RoleIconGrid
                  groups={[miscRoleGroup]}
                  roles={sortedRoles}
                  selectedRoleId={selectedRoleId}
                  onSelect={setSelectedRoleId}
                  groupClassName="rounded-2xl border border-ember-200/10 px-1 py-0.5"
                  columnsClassName="grid-cols-5 gap-0.5"
                  buttonClassName="rounded-sm"
                  iconClassName="h-6 w-6"
                  unframed
                  showGroupLabel={false}
                />
              ) : null}
            </div>

            <div className="space-y-1.5">
              {sideRoleGroups.map((group) => (
                <RoleIconGrid
                  key={group.key}
                  groups={[group]}
                  roles={sortedRoles}
                  selectedRoleId={selectedRoleId}
                  onSelect={setSelectedRoleId}
                  groupClassName="rounded-2xl border border-ember-200/10 px-1 py-0.5"
                  columnsClassName="grid-cols-4 gap-0.5"
                  buttonClassName="rounded-sm"
                  iconClassName="h-6 w-6"
                  unframed
                  showGroupLabel={false}
                />
              ))}
            </div>
          </div>
        </div>

        {isNobleSelected ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {nobleShownIds.map((playerId, index) => (
              <select
                key={index}
                value={playerId}
                onChange={(event) =>
                  setNobleShownIds((current) =>
                    current.map((value, currentIndex) => (currentIndex === index ? event.target.value : value)),
                  )
                }
                className="field"
              >
                <option value="">Игрок {index + 1}</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        ) : (
          <label className="block">
            <div className="relative">
              <MentionTextarea
                value={genericText}
                onChange={setGenericText}
                players={players}
                minHeightClassName="min-h-11 pr-16 pt-3 pb-3"
                placeholder="Что известно по этой роли? Можно выбрать игроков кнопками ниже или ввести @ для быстрого выбора."
              />
              <div className="pointer-events-none absolute right-3 top-[22px] -translate-y-1/2">
                <button
                  type="button"
                  onClick={() => void handleAdd()}
                  disabled={saving}
                  aria-label="Сохранить ролевую заметку"
                  title="Сохранить ролевую заметку"
                  className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-ember-200/35 bg-ember-200 text-ink-900 transition hover:bg-ember-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </label>
        )}

        {!isNobleSelected ? (
          <div className="flex flex-wrap gap-2">
            {players.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => setGenericText((current) => `${current.replace(/\s+$/u, "")}${current.trim() ? " " : ""}@${player.name} `)}
                className="rounded-xl border border-ember-200/10 bg-black/20 px-3 py-2 text-sm text-stone-200 transition hover:border-ember-200/25 hover:bg-ember-200/8 hover:text-stone-50"
              >
                {player.name}
              </button>
            ))}
          </div>
        ) : null}

        {isNobleSelected ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={saving}
              aria-label="Сохранить ролевую заметку"
              title="Сохранить ролевую заметку"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-ember-200/35 bg-ember-200 text-ink-900 transition hover:bg-ember-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-200">{error}</p> : null}
      </div>

      <div className="mt-5 space-y-3">
        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
            В этой фазе пока нет ролевых записей.
          </div>
        ) : (
          notes.map((note) => {
            const roleName =
              sortedRoles.find((role) => normalizeRoleId(role.id) === normalizeRoleId(note.roleId ?? ""))?.name ??
              prettifyRoleName(note.roleId ?? "role");
            const linkedPlayers = note.linkedPlayerIds
              .map((playerId) => playersById.get(playerId))
              .filter((player): player is Player => Boolean(player));
            const isEditing = editingNoteId === note.id;

            return (
              <article key={note.id} className="rounded-2xl border border-ember-200/10 bg-black/18 p-3 sm:p-4">
                <div className="mb-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-ember-100/70">{roleName}</p>
                  <h3 className="mt-1 text-sm font-semibold text-stone-100">{getRoleNoteTitle(note.roleId)}</h3>
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <MentionTextarea value={editingText} onChange={setEditingText} players={players} minHeightClassName="min-h-11" />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void saveEditing(note)} className="primary-button">
                        <Save className="h-4 w-4" />
                        Сохранить
                      </button>
                      <button type="button" onClick={cancelEditing} className="secondary-button">
                        <X className="h-4 w-4" />
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-stone-100">{note.text}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {linkedPlayers.length > 0 ? (
                        linkedPlayers.map((player) => (
                          <span key={player.id} className="chip">
                            {player.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-stone-500">Без привязки к игрокам</span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-stone-500">{formatDate(note.createdAt.slice(0, 10))}</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEditing(note)} className="secondary-button min-h-10 px-3">
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => onDeleteNote(note.id)} className="danger-button">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
