import { Edit3, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Note, PersonalTeam, Phase, Player, PlayerTeam, ScriptRole, TokenTint } from "../types";
import { sortPhases } from "../utils/dates";
import { mergeManualAndMentionLinks, uniqueIds } from "../utils/mentions";
import { getRoleLabel, groupRolesByType } from "../utils/scripts";
import MentionTextarea from "./MentionTextarea";
import RolePicker from "./RolePicker";
import RoleTokenImage from "./RoleTokenImage";

type PlayerDetailModalProps = {
  player: Player | null;
  isMyToken?: boolean;
  myTokenLocked?: boolean;
  myTeam?: PersonalTeam;
  notes: Note[];
  players: Player[];
  phases: Phase[];
  scriptRoles?: ScriptRole[];
  onClose: () => void;
  onSave: (
    playerId: string,
    values: Pick<Player, "name" | "alive" | "deadVoteAvailable" | "mainRole" | "additionalRoles" | "travellerTeam" | "tokenTint">,
    isMyToken: boolean,
    myTeam: PersonalTeam | undefined,
  ) => Promise<void>;
  onAddNote: (phaseId: string, text: string, linkedPlayerIds: string[]) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onUpdateNote: (noteId: string, text: string, linkedPlayerIds: string[]) => Promise<void>;
};

export default function PlayerDetailModal({
  player,
  isMyToken = false,
  myTokenLocked = false,
  myTeam,
  notes,
  players,
  phases,
  scriptRoles = [],
  onClose,
  onSave,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
}: PlayerDetailModalProps) {
  if (!player) {
    return null;
  }

  return (
    <PlayerDetailForm
      key={player.id}
      player={player}
      isMyToken={isMyToken}
      myTokenLocked={myTokenLocked}
      myTeam={myTeam}
      notes={notes}
      players={players}
      phases={phases}
      scriptRoles={scriptRoles}
      onClose={onClose}
      onSave={onSave}
      onAddNote={onAddNote}
      onDeleteNote={onDeleteNote}
      onUpdateNote={onUpdateNote}
    />
  );
}

type PlayerDetailFormProps = Omit<PlayerDetailModalProps, "player"> & {
  player: Player;
};

function PlayerDetailForm({
  player,
  isMyToken,
  myTokenLocked,
  myTeam,
  notes,
  players,
  phases,
  scriptRoles = [],
  onClose,
  onSave,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
}: PlayerDetailFormProps) {
  const [name, setName] = useState(player.name);
  const [alive, setAlive] = useState(player.alive);
  const [deadVoteAvailable, setDeadVoteAvailable] = useState(player.deadVoteAvailable ?? true);
  const [tokenTint, setTokenTint] = useState<TokenTint>(player.tokenTint ?? "default");
  const [mainRole, setMainRole] = useState(player.mainRole ?? "");
  const [travellerTeam, setTravellerTeam] = useState<PlayerTeam>(player.travellerTeam ?? "unknown");
  const [markedAsMine, setMarkedAsMine] = useState(isMyToken);
  const [personalTeam, setPersonalTeam] = useState<PersonalTeam>(myTeam ?? "unknown");
  const [additionalRoles, setAdditionalRoles] = useState([
    player.additionalRoles[0] ?? "",
    player.additionalRoles[1] ?? "",
    player.additionalRoles[2] ?? "",
  ]);
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [notePhaseId, setNotePhaseId] = useState(sortPhases(phases)[0]?.id ?? "");
  const [noteLinks, setNoteLinks] = useState<string[]>([]);
  const [noteError, setNoteError] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingLinks, setEditingLinks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const sortedPhases = sortPhases(phases);

  const notesByPhase = useMemo(() => {
    return sortPhases(phases).map((phase) => ({
      phase,
      notes: notes.filter((note) => note.linkedPlayerIds.includes(player.id) && note.phaseId === phase.id),
    }));
  }, [notes, phases, player]);

  const updateAdditionalRole = (index: number, value: string) => {
    setAdditionalRoles((current) =>
      current.map((role, roleIndex) => (roleIndex === index ? value : role)),
    );
  };

  const roleOptions = useMemo(
    () => scriptRoles.filter((role) => role.type !== "traveller" && role.type !== "fabled" && role.type !== "loric"),
    [scriptRoles],
  );
  const roleGroups = groupRolesByType(roleOptions);
  const pickerGroups = roleGroups.map((group) => ({
    key: group.type,
    label: group.label,
    options: group.roles.map((role) => ({ id: role.id, label: role.name })),
  }));
  const linkedNoteCount = notes.filter((note) => note.linkedPlayerIds.includes(player.id)).length;

  const toggleNoteLink = (playerId: string) => {
    setNoteLinks((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId],
    );
  };

  const toggleEditingLink = (playerId: string) => {
    setEditingLinks((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId],
    );
  };

  const handleAddPlayerNote = async () => {
    const trimmed = noteText.trim();

    if (!trimmed) {
      setNoteError("Заполни текст заметки.");
      return;
    }

    if (!notePhaseId) {
      setNoteError("Выбери фазу для заметки.");
      return;
    }

    setNoteSaving(true);
    setNoteError("");

    try {
      await onAddNote(
        notePhaseId,
        trimmed,
        mergeManualAndMentionLinks(trimmed, players, uniqueIds([player.id, ...noteLinks])),
      );
      setNoteText("");
      setNoteLinks([]);
    } catch {
      setNoteError("Не удалось сохранить заметку.");
    } finally {
      setNoteSaving(false);
    }
  };

  const startEditingNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingText(note.text);
    setEditingLinks(note.linkedPlayerIds);
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditingText("");
    setEditingLinks([]);
  };

  const saveEditingNote = async (noteId: string) => {
    const trimmed = editingText.trim();

    if (!trimmed) {
      setNoteError("Заполни текст заметки.");
      return;
    }

    try {
      await onUpdateNote(noteId, trimmed, mergeManualAndMentionLinks(trimmed, players, editingLinks));
      cancelEditingNote();
      setNoteError("");
    } catch {
      setNoteError("Не удалось обновить заметку.");
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Имя игрока не может быть пустым.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave(player.id, {
        name: trimmedName,
        alive,
        deadVoteAvailable,
        tokenTint,
        mainRole: mainRole.trim() || undefined,
        additionalRoles: additionalRoles.map((role) => role.trim()).slice(0, 3),
        travellerTeam,
      }, Boolean(markedAsMine), markedAsMine ? personalTeam : undefined);
      onClose();
    } catch {
      setError("Не удалось сохранить игрока.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-ember-200/15 bg-ink-850 shadow-2xl sm:mx-auto sm:max-w-3xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-ember-200/10 bg-ink-850/95 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
          <div>
            <p className="text-sm text-stone-400">Карточка игрока</p>
            <h2 className="text-2xl font-bold text-stone-50">{player.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="secondary-button shrink-0 px-3">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-4 md:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-2">
                <span className="label">Имя</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className="field" />
              </label>

              <div className="space-y-2">
                <span className="label opacity-0">Это мой жетон</span>
                <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-ember-200/20 bg-ember-200/10 px-4 py-3 has-[:disabled]:border-stone-200/10 has-[:disabled]:bg-black/15">
                  <span>
                    <span className="block font-semibold text-ember-50">Это мой жетон</span>
                    {myTokenLocked ? (
                      <span className="mt-1 block text-xs leading-4 text-stone-500">
                        Сначала снимите галочку с текущего личного жетона.
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="checkbox"
                    checked={markedAsMine}
                    disabled={myTokenLocked}
                    onChange={(event) => setMarkedAsMine(event.target.checked)}
                    className="h-5 w-5 shrink-0 accent-ember-200 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-ember-200/10 bg-black/20 px-4 py-3">
                <span className="font-medium text-stone-100">Игрок жив</span>
                <input
                  type="checkbox"
                  checked={alive}
                  onChange={(event) => setAlive(event.target.checked)}
                  className="h-5 w-5 accent-ember-200"
                />
              </label>

              <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-ember-200/10 bg-black/20 px-4 py-3 has-[:disabled]:border-stone-200/10 has-[:disabled]:bg-black/10">
                <span>
                  <span className="block font-medium text-stone-100">Есть мертвый голос</span>
                  <span className="mt-1 block text-xs leading-4 text-stone-500">
                    Доступно только для мертвого игрока.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={deadVoteAvailable}
                  disabled={alive}
                  onChange={(event) => setDeadVoteAvailable(event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-ember-200 disabled:cursor-not-allowed disabled:opacity-40"
                />
              </label>
            </div>

            {markedAsMine ? (
              <label className="block space-y-2 rounded-xl border border-ember-200/15 bg-black/20 px-4 py-3">
                <span className="label">Моя команда</span>
                <select
                  value={personalTeam}
                  onChange={(event) => setPersonalTeam(event.target.value as PersonalTeam)}
                  className="field"
                >
                  <option value="unknown">Неизвестно</option>
                  <option value="good">Добро</option>
                  <option value="evil">Зло</option>
                  <option value="traveller">Traveller</option>
                </select>
              </label>
            ) : null}

            {player.isTraveller ? (
              <div className="rounded-2xl border border-amber-200/25 bg-amber-400/10 p-4 text-sm text-amber-50">
                <p className="font-semibold">Traveller</p>
                <p className="mt-1">
                  Роль Traveller: {getRoleLabel(player.travellerRole ?? player.mainRole, scriptRoles)}
                </p>
                <div className="mt-3">
                  <select
                    value={travellerTeam}
                    onChange={(event) => setTravellerTeam(event.target.value as PlayerTeam)}
                    className="field"
                  >
                    <option value="unknown">Неизвестно</option>
                    <option value="good">Синий / добро</option>
                    <option value="evil">Красный / зло</option>
                  </select>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-2 rounded-2xl border border-ember-100/35 bg-ember-200/10 p-3 shadow-[0_0_20px_rgba(242,204,116,0.08)]">
                <span className="text-xs font-black uppercase tracking-wide text-ember-100">Основная роль</span>
                <div className="flex items-center gap-3">
                  {player.isTraveller ? (
                    <input
                      value={getRoleLabel(player.travellerRole ?? player.mainRole, scriptRoles)}
                      className="field border-ember-100/35 bg-black/35 text-lg font-bold text-stone-50"
                      disabled
                    />
                  ) : roleOptions.length > 0 ? (
                    <RolePicker
                      value={mainRole}
                      onChange={setMainRole}
                      groups={pickerGroups}
                      roles={roleOptions}
                      placeholder="Не выбрана"
                      className="w-full"
                      buttonClassName="border-ember-100/35 bg-black/35 text-lg font-bold text-stone-50"
                    />
                  ) : (
                    <div className="w-full space-y-2">
                      <input
                        value={mainRole}
                        onChange={(event) => setMainRole(event.target.value)}
                        className="field border-ember-100/35 bg-black/35 text-lg font-bold text-stone-50"
                        placeholder="Например, Clockmaker"
                      />
                      <p className="text-xs leading-4 text-stone-400">
                        Загрузите JSON сценария в Setup, чтобы роли выбирались из выпадающего списка автоматически.
                      </p>
                    </div>
                  )}
                </div>
              </label>

              <div className="space-y-2 rounded-2xl border border-stone-200/10 bg-black/10 p-3">
                <p className="text-xs font-medium text-stone-500">Дополнительные роли</p>
                {[0, 1, 2].map((index) => (
                  roleOptions.length > 0 ? (
                    <div key={index} className="flex items-center gap-2">
                      <RolePicker
                        value={additionalRoles[index]}
                        onChange={(value) => updateAdditionalRole(index, value)}
                        groups={pickerGroups}
                        roles={roleOptions}
                        placeholder={`Роль ${index + 1}`}
                        className="w-full"
                        buttonClassName="min-h-11 border-stone-200/10 bg-black/20 text-sm text-stone-400"
                      />
                    </div>
                  ) : (
                    <div key={index} className="flex items-center gap-2">
                      <RoleTokenImage
                        roleId={additionalRoles[index]}
                        roles={scriptRoles}
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-stone-200/15 bg-black/20"
                        imageClassName="h-full w-full object-cover opacity-85"
                      />
                      <input
                        value={additionalRoles[index]}
                        onChange={(event) => updateAdditionalRole(index, event.target.value)}
                        className="field min-h-11 border-stone-200/10 bg-black/20 text-sm text-stone-400"
                        placeholder={`Роль ${index + 1}`}
                      />
                    </div>
                  )
                ))}
                {roleOptions.length === 0 ? (
                  <p className="text-xs leading-4 text-stone-500">
                    После загрузки сценария дополнительные роли тоже начнут выпадать списком.
                  </p>
                ) : null}
              </div>
            </div>

            <label className="block space-y-2 rounded-xl border border-ember-200/10 bg-black/20 px-4 py-3">
              <span className="label">Окрас жетона (если игрока перекрасили)</span>
              <select
                value={tokenTint}
                onChange={(event) => setTokenTint(event.target.value as TokenTint)}
                className="field"
              >
                <option value="default">По роли</option>
                <option value="good">Синий</option>
                <option value="evil">Красный</option>
              </select>
            </label>

            {error ? <p className="text-sm text-red-200">{error}</p> : null}
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-stone-50">Заметки игрока</h3>
              <p className="text-sm text-stone-400">{linkedNoteCount} записей</p>
            </div>

            <div className="space-y-3 rounded-2xl border border-ember-200/10 bg-black/15 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                <label className="block space-y-2">
                  <span className="label">
                    Новая заметка <span className="text-stone-500">(@имя игрока)</span>
                  </span>
                  <MentionTextarea
                    value={noteText}
                    onChange={setNoteText}
                    players={players}
                    minHeightClassName="min-h-24"
                    placeholder="Что хотите записать?"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="label">Фаза</span>
                  <select value={notePhaseId} onChange={(event) => setNotePhaseId(event.target.value)} className="field">
                    {sortedPhases.map((phase) => (
                      <option key={phase.id} value={phase.id}>
                        {phase.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <p className="label mb-2">Дополнительно связать с игроками</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {players.map((linkedPlayer) => (
                    <label
                      key={linkedPlayer.id}
                      className="flex min-h-10 items-center gap-2 rounded-xl border border-ember-200/10 bg-black/20 px-3 py-2 text-sm text-stone-200"
                    >
                      <input
                        type="checkbox"
                        checked={linkedPlayer.id === player.id || noteLinks.includes(linkedPlayer.id)}
                        disabled={linkedPlayer.id === player.id}
                        onChange={() => toggleNoteLink(linkedPlayer.id)}
                        className="h-4 w-4 accent-ember-200 disabled:opacity-60"
                      />
                      <span className="min-w-0 truncate">{linkedPlayer.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {noteError ? <p className="text-sm text-red-200">{noteError}</p> : null}

              <button type="button" onClick={handleAddPlayerNote} disabled={noteSaving} className="primary-button w-full sm:w-auto">
                <Save className="h-4 w-4" />
                {noteSaving ? "Сохранение" : "Добавить заметку"}
              </button>
            </div>

            <div className="space-y-3">
              {notesByPhase.every((group) => group.notes.length === 0) ? (
                <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                  Для этого игрока пока нет связанных заметок.
                </div>
              ) : (
                notesByPhase
                  .filter((group) => group.notes.length > 0)
                  .map(({ phase, notes: phaseNotes }) => (
                    <section key={phase.id} className="rounded-2xl border border-ember-200/10 bg-black/18 p-4">
                      <h4 className="mb-3 font-semibold text-ember-100">{phase.title}</h4>
                      <div className="space-y-3">
                        {phaseNotes.map((note) => (
                          <article key={note.id} className="rounded-xl border border-ember-200/10 bg-black/15 p-3">
                            {editingNoteId === note.id ? (
                              <div className="space-y-3">
                                <MentionTextarea
                                  value={editingText}
                                  onChange={setEditingText}
                                  players={players}
                                  minHeightClassName="min-h-24"
                                />
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                  {players.map((linkedPlayer) => (
                                    <label
                                      key={linkedPlayer.id}
                                      className="flex min-h-10 items-center gap-2 rounded-xl border border-ember-200/10 bg-black/20 px-3 py-2 text-sm text-stone-200"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={editingLinks.includes(linkedPlayer.id)}
                                        onChange={() => toggleEditingLink(linkedPlayer.id)}
                                        className="h-4 w-4 accent-ember-200"
                                      />
                                      <span className="min-w-0 truncate">{linkedPlayer.name}</span>
                                    </label>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" onClick={() => saveEditingNote(note.id)} className="primary-button">
                                    <Save className="h-4 w-4" />
                                    Сохранить
                                  </button>
                                  <button type="button" onClick={cancelEditingNote} className="secondary-button">
                                    <X className="h-4 w-4" />
                                    Отмена
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="whitespace-pre-wrap text-sm leading-6 text-stone-200">{note.text}</p>
                                <div className="mt-3 flex justify-end gap-2">
                                  <button type="button" onClick={() => startEditingNote(note)} className="secondary-button min-h-10 px-3">
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button type="button" onClick={() => onDeleteNote(note.id)} className="danger-button">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </>
                            )}
                          </article>
                        ))}
                      </div>
                    </section>
                  ))
              )}
            </div>
          </div>
        </div>
        </div>
        <div className="border-t border-ember-200/10 bg-ink-850/95 px-4 py-4 backdrop-blur sm:px-6">
          <button type="button" onClick={handleSave} disabled={saving} className="primary-button w-full">
            <Save className="h-4 w-4" />
            {saving ? "Сохранение" : "Сохранить игрока"}
          </button>
        </div>
      </div>
    </div>
  );
}
