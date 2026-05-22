import { Edit3, Save, Send, Trash2, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Note, PersonalTeam, Phase, Player, ScriptRole, TokenTint } from "../types";
import { sortPhases } from "../utils/dates";
import { mergeManualAndMentionLinks, uniqueIds } from "../utils/mentions";
import { mergeReferenceRoles, useReferenceData } from "../utils/referenceData";
import { getRoleLabel, getRoleTypeFromRoles, groupRolesByType, prettifyRoleName } from "../utils/scripts";
import MentionTextarea from "./MentionTextarea";
import RoleIconGrid from "./RoleIconGrid";
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
  myTeam: _myTeam,
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
  const [markedAsMine, setMarkedAsMine] = useState(isMyToken);
  const [additionalRoles, setAdditionalRoles] = useState([
    player.additionalRoles[0] ?? "",
    player.additionalRoles[1] ?? "",
    player.additionalRoles[2] ?? "",
  ]);
  const [myTokenHint, setMyTokenHint] = useState("");
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [notePhaseId, setNotePhaseId] = useState(sortPhases(phases)[0]?.id ?? "");
  const [noteError, setNoteError] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [activeRoleSlot, setActiveRoleSlot] = useState<"main" | 0 | 1 | 2>("main");
  const [saving, setSaving] = useState(false);
  const sortedPhases = sortPhases(phases);
  const { data: referenceData } = useReferenceData();
  const linkedPlayerNotes = useMemo(
    () => notes.filter((note) => note.linkedPlayerIds.includes(player.id)),
    [notes, player.id],
  );

  const notesByPhase = useMemo(() => {
    return sortedPhases.map((phase) => ({
      phase,
      notes: linkedPlayerNotes.filter((note) => note.phaseId === phase.id),
    }));
  }, [linkedPlayerNotes, sortedPhases]);

  const updateAdditionalRole = (index: number, value: string) => {
    setAdditionalRoles((current) =>
      current.map((role, roleIndex) => (roleIndex === index ? value : role)),
    );
  };

  const mergedScriptRoles = useMemo(
    () =>
      mergeReferenceRoles(
        scriptRoles,
        referenceData?.roleMap ?? new Map(),
        scriptRoles.map((role) => role.id),
      ),
    [referenceData?.roleMap, scriptRoles],
  );
  const roleOptions = useMemo(
    () =>
      mergedScriptRoles.filter(
        (role) => role.type !== "traveller" && role.type !== "fabled" && role.type !== "loric",
      ),
    [mergedScriptRoles],
  );
  const roleGroups = groupRolesByType(roleOptions);
  const roleIconGroups = roleGroups.map((group) => ({
    key: group.type,
    label: group.label,
    roleIds: group.roles.map((role) => role.id),
  }));
  const roleIconGroupsByKey = useMemo(
    () => new Map(roleIconGroups.map((group) => [group.key, group])),
    [roleIconGroups],
  );
  const townsfolkRoleGroup = roleIconGroupsByKey.get("townsfolk");
  const sideRoleGroups = ["outsider", "minion", "demon"]
    .map((key) => roleIconGroupsByKey.get(key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const currentVisibleRoleId = player.isTraveller ? player.travellerRole ?? mainRole : mainRole;
  const inferredPersonalTeam = useMemo<PersonalTeam>(() => {
    const roleType = player.isTraveller ? "traveller" : getRoleTypeFromRoles(currentVisibleRoleId, mergedScriptRoles);

    if (roleType === "traveller") {
      return "traveller";
    }

    if (roleType === "townsfolk" || roleType === "outsider") {
      return "good";
    }

    if (roleType === "minion" || roleType === "demon") {
      return "evil";
    }

    return "unknown";
  }, [currentVisibleRoleId, mergedScriptRoles, player.isTraveller]);
  const effectivePersonalTeam = useMemo<PersonalTeam>(() => {
    if (tokenTint === "good") {
      return "good";
    }

    if (tokenTint === "evil") {
      return "evil";
    }

    return inferredPersonalTeam;
  }, [inferredPersonalTeam, tokenTint]);
  const linkedNoteCount = linkedPlayerNotes.length;

  const assignRoleToSlot = (roleId: string) => {
    if (activeRoleSlot === "main") {
      setMainRole(roleId);
      setActiveRoleSlot(0);
      return;
    }

    setAdditionalRoles((current) =>
      current.map((role, index) => (index === activeRoleSlot ? roleId : role)),
    );
    setActiveRoleSlot((current) => (current === 0 ? 1 : current === 1 ? 2 : "main"));
  };

  const appendMention = (
    currentText: string,
    setText: (value: string) => void,
    playerName: string,
  ) => {
    const mention = `@${playerName}`;
    const trimmedEnd = currentText.replace(/\s+$/u, "");

    if (trimmedEnd.includes(mention)) {
      return;
    }

    const separator = trimmedEnd.length > 0 ? " " : "";
    setText(`${trimmedEnd}${separator}${mention} `);
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
        mergeManualAndMentionLinks(trimmed, players, uniqueIds([player.id])),
      );
      setNoteText("");
    } catch {
      setNoteError("Не удалось сохранить заметку.");
    } finally {
      setNoteSaving(false);
    }
  };

  const startEditingNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingText(note.text);
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditingText("");
  };

  const saveEditingNote = async (noteId: string) => {
    const trimmed = editingText.trim();

    if (!trimmed) {
      setNoteError("Заполни текст заметки.");
      return;
    }

    try {
      await onUpdateNote(noteId, trimmed, mergeManualAndMentionLinks(trimmed, players, [player.id]));
      cancelEditingNote();
      setNoteError("");
    } catch {
      setNoteError("Не удалось обновить заметку.");
    }
  };

  const handleToggleMyToken = () => {
    if (myTokenLocked && !markedAsMine) {
      setMyTokenHint("Сначала снимите «Это мой жетон» с другого жетона.");
      return;
    }

    setMyTokenHint("");
    setMarkedAsMine((current) => !current);
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
        travellerTeam: player.travellerTeam,
      }, Boolean(markedAsMine), markedAsMine ? effectivePersonalTeam : undefined);
      onClose();
    } catch {
      setError("Не удалось сохранить игрока.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="player-detail-modal fixed inset-0 z-50 flex items-end bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="player-detail-shell flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-ember-200/15 bg-ink-850 shadow-2xl sm:mx-auto sm:max-w-3xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="player-detail-header flex items-start justify-between gap-3 border-b border-ember-200/10 bg-ink-850/95 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
          <div>
            <p className="text-sm text-stone-400">Карточка игрока</p>
            <h2 className="text-2xl font-bold text-stone-50">{player.name}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              aria-label="Сохранить игрока"
              title="Сохранить игрока"
              className="primary-button min-h-12 px-4"
            >
              <Save className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} className="secondary-button shrink-0 px-3">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="player-detail-body overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-4">
            <div className="player-detail-top space-y-4">
              <div className="space-y-3">
                <div className="grid grid-cols-[minmax(0,1fr)_56px_56px_56px] gap-3">
                  <label className="block">
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="field min-h-[56px]"
                      placeholder="Имя игрока"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleToggleMyToken}
                    aria-disabled={myTokenLocked && !markedAsMine}
                    aria-pressed={markedAsMine}
                    aria-label="Это мой жетон"
                    title="Это мой жетон"
                    className={`flex min-h-[56px] items-center justify-center rounded-xl border px-3 py-2 transition ${
                      myTokenLocked
                        ? "cursor-not-allowed border-stone-200/10 bg-black/10 text-stone-600"
                        : markedAsMine
                          ? "border-ember-200/35 bg-ember-200/10 text-ember-100 shadow-[0_0_18px_rgba(242,204,116,0.12)]"
                          : "border-stone-200/10 bg-black/20 text-stone-300"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                        myTokenLocked
                          ? "bg-black/20 text-stone-600"
                          : markedAsMine
                            ? "bg-ember-200 text-ink-900"
                            : "bg-black/20 text-stone-500"
                      }`}
                    >
                      <UserRound className="h-4.5 w-4.5" />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlive((current) => !current)}
                    aria-pressed={alive}
                    aria-label="Игрок жив"
                    title="Игрок жив"
                    className={`flex min-h-[56px] items-center justify-center rounded-xl border px-3 py-2 transition ${
                      alive
                        ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 shadow-[0_0_18px_rgba(110,231,183,0.12)]"
                        : "border-stone-200/10 bg-black/20 text-stone-300"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                        alive ? "bg-emerald-200/18 text-emerald-100" : "bg-black/20 text-stone-500"
                      }`}
                    >
                      <span className="text-xl leading-none">♥</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeadVoteAvailable((current) => !current)}
                    disabled={alive}
                    aria-pressed={deadVoteAvailable}
                    aria-label="Есть мертвый голос"
                    title="Есть мертвый голос"
                    className={`flex min-h-[56px] items-center justify-center rounded-xl border px-3 py-2 transition ${
                      alive
                        ? "cursor-not-allowed border-stone-200/10 bg-black/10 text-stone-600"
                        : deadVoteAvailable
                          ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 shadow-[0_0_18px_rgba(110,231,183,0.12)]"
                          : "border-stone-200/10 bg-black/20 text-stone-300"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                        alive
                          ? "bg-black/20 text-stone-600"
                          : deadVoteAvailable
                            ? "bg-emerald-200/18 text-emerald-100"
                            : "bg-black/20 text-stone-500"
                      }`}
                    >
                      <span className="text-xl leading-none">☠</span>
                    </span>
                  </button>
                </div>

                {myTokenHint ? (
                  <p className="text-[10px] leading-3 text-stone-500">
                    {myTokenHint}
                  </p>
                ) : null}
              </div>

            <div className="player-detail-role-panel space-y-3 rounded-2xl border border-ember-100/35 bg-ember-200/10 p-3 shadow-[0_0_20px_rgba(242,204,116,0.08)]">
              <div className="grid grid-cols-[minmax(0,1fr)_10.5rem] items-start gap-3">
                <label className="block space-y-3">
                  <span className="text-xs font-black uppercase tracking-wide text-ember-100">Основная роль</span>
                  {player.isTraveller ? (
                    <input
                      value={getRoleLabel(player.travellerRole ?? player.mainRole, scriptRoles)}
                      className="field border-ember-100/35 bg-black/35 text-lg font-bold text-stone-50"
                      disabled
                    />
                  ) : roleOptions.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveRoleSlot("main")}
                        className={`flex min-h-[52px] w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition ${
                          activeRoleSlot === "main"
                            ? "border-amber-200/60 bg-black/30 shadow-[0_0_0_2px_rgba(242,204,116,0.12)]"
                            : "border-ember-100/35 bg-black/25"
                        }`}
                      >
                        {mainRole ? (
                          <RoleTokenImage
                            roleId={mainRole}
                            roles={roleOptions}
                            className="h-7 w-7 shrink-0 overflow-hidden rounded-full border-0 bg-transparent"
                            imageClassName="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-full border border-dashed border-ember-200/20 bg-black/10" />
                        )}
                        <span className="text-sm font-semibold text-stone-50">
                          {mainRole ? getRoleLabel(mainRole, roleOptions) : "Основная роль"}
                        </span>
                      </button>
                    </>
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
                </label>

                <div className="player-detail-extra-roles space-y-2 rounded-2xl border border-stone-200/10 bg-black/10 p-3">
                  <p className="text-xs font-medium text-stone-500">Дополнительные роли</p>
                  <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((index) => (
                    roleOptions.length > 0 ? (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setActiveRoleSlot(index as 0 | 1 | 2)}
                        className={`flex min-h-[52px] items-center justify-center rounded-2xl border px-2 py-2 transition ${
                          activeRoleSlot === index
                            ? "border-amber-200/60 bg-black/30 shadow-[0_0_0_2px_rgba(242,204,116,0.12)]"
                            : "border-stone-200/10 bg-black/20"
                        }`}
                        title={additionalRoles[index] ? getRoleLabel(additionalRoles[index], roleOptions) : `Роль ${index + 1}`}
                      >
                        {additionalRoles[index] ? (
                          <RoleTokenImage
                            roleId={additionalRoles[index]}
                            roles={roleOptions}
                            className="h-7 w-7 overflow-hidden rounded-full border-0 bg-transparent"
                            imageClassName="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="h-7 w-7 rounded-full border border-dashed border-ember-200/20 bg-black/10" />
                        )}
                      </button>
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
                  </div>
                  {roleOptions.length === 0 ? (
                    <p className="text-xs leading-4 text-stone-500">
                      После загрузки сценария дополнительные роли тоже начнут выпадать списком.
                    </p>
                  ) : null}
                </div>
              </div>

              {roleOptions.length > 0 && !player.isTraveller ? (
                <div className="grid grid-cols-2 gap-2">
                  {townsfolkRoleGroup ? (
                    <RoleIconGrid
                      groups={[townsfolkRoleGroup]}
                      roles={roleOptions}
                      selectedRoleId={activeRoleSlot === "main" ? mainRole : additionalRoles[activeRoleSlot] ?? ""}
                      onSelect={assignRoleToSlot}
                      className="h-full"
                      groupClassName="h-full rounded-2xl border border-ember-200/10 px-1 py-0.5"
                      columnsClassName="grid-cols-5 gap-0.5"
                      buttonClassName="rounded-sm"
                      iconClassName="h-6 w-6"
                      unframed
                      showGroupLabel={false}
                    />
                  ) : (
                    <div className="rounded-2xl border border-ember-200/10 px-1 py-0.5" />
                  )}

                  <div className="space-y-1.5">
                    {sideRoleGroups.map((group) => (
                      <RoleIconGrid
                        key={group.key}
                        groups={[group]}
                        roles={roleOptions}
                        selectedRoleId={activeRoleSlot === "main" ? mainRole : additionalRoles[activeRoleSlot] ?? ""}
                        onSelect={assignRoleToSlot}
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
              ) : null}
            </div>

            {error ? <p className="text-sm text-red-200">{error}</p> : null}
          </div>

          <div className="player-detail-notes space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-stone-50">Заметки игрока</h3>
              <p className="text-sm text-stone-400">{linkedNoteCount} записей</p>
            </div>

            <div className="player-detail-note-composer space-y-3 rounded-2xl border border-ember-200/10 bg-black/15 p-3">
              <div className="space-y-2">
                <label className="block space-y-2">
                  <span className="label">
                    Новая заметка <span className="text-stone-500">(@имя игрока)</span>
                  </span>
                  <div className="relative">
                    <MentionTextarea
                      value={noteText}
                      onChange={setNoteText}
                      players={players}
                      minHeightClassName="min-h-11 pr-16 pt-3 pb-3"
                      placeholder="Что хотите записать?"
                    />
                    <div className="pointer-events-none absolute right-3 top-[22px] -translate-y-1/2">
                      <button
                        type="button"
                        onClick={handleAddPlayerNote}
                        disabled={noteSaving}
                        aria-label="Добавить заметку"
                        title="Добавить заметку"
                        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-ember-200/35 bg-ember-200 text-ink-900 transition hover:bg-ember-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                {players.map((linkedPlayer) => (
                  <button
                    key={linkedPlayer.id}
                    type="button"
                    onClick={() => appendMention(noteText, setNoteText, linkedPlayer.name)}
                    className="rounded-xl border border-ember-200/10 bg-black/20 px-3 py-2 text-sm text-stone-200 transition hover:border-ember-200/25 hover:bg-ember-200/8 hover:text-stone-50"
                  >
                    {linkedPlayer.name}
                  </button>
                ))}
              </div>

              {noteError ? <p className="text-sm text-red-200">{noteError}</p> : null}
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
                    <section key={phase.id} className="player-detail-note-group rounded-2xl border border-ember-200/10 bg-black/18 p-4">
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
                                <div className="flex flex-wrap gap-2">
                                  {players.map((linkedPlayer) => (
                                    <button
                                      key={linkedPlayer.id}
                                      type="button"
                                      onClick={() => appendMention(editingText, setEditingText, linkedPlayer.name)}
                                      className="rounded-xl border border-ember-200/10 bg-black/20 px-3 py-2 text-sm text-stone-200 transition hover:border-ember-200/25 hover:bg-ember-200/8 hover:text-stone-50"
                                    >
                                      {linkedPlayer.name}
                                    </button>
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

            <div className="player-detail-token-tint space-y-2 rounded-xl border border-ember-200/10 bg-black/20 px-4 py-3">
              <span className="label">Окрас жетона (если игрока перекрасили)</span>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "default", label: "По роли", className: "text-stone-200" },
                  { value: "good", label: "Синий", className: "text-sky-200" },
                  { value: "evil", label: "Красный", className: "text-rose-200" },
                ] as const).map((option) => {
                  const active = tokenTint === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTokenTint(option.value)}
                      aria-pressed={active}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                        active
                          ? "border-ember-200/35 bg-ember-200/12 shadow-[0_0_16px_rgba(242,204,116,0.10)]"
                          : "border-stone-200/10 bg-black/20"
                      } ${option.className}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
