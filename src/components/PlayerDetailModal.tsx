import { Edit3, Save, Trash2, UserRound, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { Note, PersonalTeam, Phase, Player, RoleType, ScriptRole, TokenTint } from "../types";
import { formatDate, formatTime, sortPhases } from "../utils/dates";
import { mergeManualAndMentionLinks, uniqueIds } from "../utils/mentions";
import { mergeReferenceRoles, useReferenceData } from "../utils/referenceData";
import { getRoleLabel, getRoleTypeFromRoles, groupRolesByType, normalizeRoleId, prettifyRoleName } from "../utils/scripts";
import RoleIntelPanel from "./RoleIntelPanel";
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
  currentPhase?: Phase;
  scriptRoles?: ScriptRole[];
  onClose: () => void;
  onSave: (
    playerId: string,
    values: Pick<Player, "name" | "alive" | "deadVoteAvailable" | "mainRole" | "additionalRoles" | "travellerTeam" | "tokenTint">,
    isMyToken: boolean,
    myTeam: PersonalTeam | undefined,
  ) => Promise<void>;
  onAddNote: (
    phaseId: string,
    text: string,
    linkedPlayerIds: string[],
    options?: { kind?: Note["kind"]; roleId?: string },
  ) => Promise<void>;
  onDeleteTraveller?: (playerId: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onUpdateNote: (noteId: string, text: string, linkedPlayerIds: string[]) => Promise<void>;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function PlayerDetailModal({
  player,
  isMyToken = false,
  myTokenLocked = false,
  myTeam,
  notes,
  players,
  phases,
  currentPhase,
  scriptRoles = [],
  onClose,
  onSave,
  onAddNote,
  onDeleteTraveller,
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
      currentPhase={currentPhase}
      scriptRoles={scriptRoles}
      onClose={onClose}
      onSave={onSave}
      onAddNote={onAddNote}
      onDeleteTraveller={onDeleteTraveller}
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
  currentPhase,
  scriptRoles = [],
  onClose,
  onSave,
  onAddNote,
  onDeleteTraveller,
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
  const [noteError, setNoteError] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [activeRoleSlot, setActiveRoleSlot] = useState<"main" | 0 | 1 | 2 | null>(null);
  const [saving, setSaving] = useState(false);
  const sortedPhases = sortPhases(phases);
  const { data: referenceData } = useReferenceData();
  const linkedPlayerNotes = useMemo(
    () =>
      notes.filter(
        (note) =>
          note.linkedPlayerIds.includes(player.id) &&
          note.kind === "role_intel",
      ),
    [notes, player.id],
  );

  const notesByPhase = useMemo(() => {
    return sortedPhases.map((phase) => ({
      phase,
      notes: linkedPlayerNotes
        .filter((note) => note.phaseId === phase.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
  const roleMentionEntries = useMemo(() => {
    const mentions = new Map<string, string>();

    mergedScriptRoles.forEach((role) => {
      [role.name, getRoleLabel(role.id, mergedScriptRoles)].forEach((label) => {
        const trimmed = label.trim();

        if (trimmed) {
          mentions.set(trimmed, role.id);
        }
      });
    });

    return Array.from(mentions.entries()).sort((a, b) => b[0].length - a[0].length);
  }, [mergedScriptRoles]);
  const roleMentionMap = useMemo(() => new Map(roleMentionEntries), [roleMentionEntries]);
  const roleMentionRegex = useMemo(
    () =>
      roleMentionEntries.length > 0
        ? new RegExp(`(${roleMentionEntries.map(([label]) => escapeRegExp(label)).join("|")})`, "g")
        : null,
    [roleMentionEntries],
  );
  const roleOptions = useMemo(
    () =>
      mergedScriptRoles.filter((role) => role.type !== "fabled" && role.type !== "loric"),
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
  const travellerRoleGroup = roleIconGroupsByKey.get("traveller");
  const sideRoleGroups = (["outsider", "minion", "demon"] satisfies RoleType[])
    .map((key) => roleIconGroupsByKey.get(key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const currentVisibleRoleId = player.isTraveller ? player.travellerRole ?? mainRole : mainRole;
  const mainRoleReference = currentVisibleRoleId
    ? referenceData?.roleMap.get(normalizeRoleId(currentVisibleRoleId)) ?? null
    : null;
  const mainRoleAbilityText = mainRoleReference?.ability?.trim() ?? "";
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
  const mainRoleNoteRoleId = player.isTraveller ? player.travellerRole ?? mainRole : mainRole;

  const assignRoleToSlot = (roleId: string) => {
    if (activeRoleSlot === null) {
      return;
    }

    if (activeRoleSlot === "main") {
      setMainRole(roleId);
      return;
    }

    setAdditionalRoles((current) =>
      current.map((role, index) => (index === activeRoleSlot ? roleId : role)),
    );
  };

  const startEditingNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingText(note.text);
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditingText("");
  };

  const saveEditingNote = async (note: Note) => {
    const trimmed = editingText.trim();

    if (!trimmed) {
      setNoteError("Заполни текст заметки.");
      return;
    }

    try {
      await onUpdateNote(
        note.id,
        trimmed,
        mergeManualAndMentionLinks(trimmed, players, uniqueIds([player.id, ...note.linkedPlayerIds])),
      );
      cancelEditingNote();
      setNoteError("");
    } catch {
      setNoteError("Не удалось обновить заметку.");
    }
  };

  const addPlayerRoleIntelNote = async (roleId: string, text: string, linkedPlayerIds: string[]) => {
    if (!currentPhase) {
      setNoteError("Сейчас нет активной фазы для заметки.");
      throw new Error("phase_required");
    }

    await onAddNote(currentPhase.id, text, uniqueIds([player.id, ...linkedPlayerIds]), {
      kind: "role_intel",
      roleId,
    });
    setNoteError("");
  };

  const renderPlayerNoteText = (text: string) => {
    if (!roleMentionRegex) {
      return <p className="whitespace-pre-wrap text-sm leading-6 text-stone-200">{text}</p>;
    }

    const lines = text.split("\n");

    return (
      <p className="whitespace-pre-wrap text-sm leading-6 text-stone-200">
        {lines.map((line, lineIndex) => (
          <Fragment key={`${lineIndex}-${line}`}>
            {line.split(roleMentionRegex).map((part, partIndex) => {
              const roleId = roleMentionMap.get(part);

              if (!roleId) {
                return <Fragment key={`${lineIndex}-${partIndex}`}>{part}</Fragment>;
              }

              const roleLabel = getRoleLabel(roleId, mergedScriptRoles);

              return (
                <span
                  key={`${lineIndex}-${partIndex}-${normalizeRoleId(roleId)}`}
                  className="mx-0.5 inline-flex h-8 w-8 align-middle"
                  title={roleLabel}
                >
                  <RoleTokenImage
                    roleId={roleId}
                    roles={mergedScriptRoles}
                    className="h-8 w-8 overflow-hidden rounded-full border border-ember-200/20 bg-white/90 shadow-[0_4px_10px_rgba(0,0,0,0.12)]"
                    imageClassName="h-full w-full object-cover"
                    fallback={
                      <span className="inline-flex items-center rounded-full border border-ember-200/20 bg-black/10 px-2 py-1 text-xs">
                        {roleLabel}
                      </span>
                    }
                  />
                </span>
              );
            })}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </p>
    );
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

  const handleDeleteTraveller = async () => {
    if (!player.isTraveller || !onDeleteTraveller) {
      return;
    }

    if (!window.confirm(`Удалить Traveller ${player.name}?`)) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onDeleteTraveller(player.id);
      onClose();
    } catch {
      setError("Не удалось удалить Traveller.");
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
            {player.isTraveller ? (
              <button
                type="button"
                onClick={() => void handleDeleteTraveller()}
                disabled={saving}
                aria-label="Удалить Traveller"
                title="Удалить Traveller"
                className="danger-button min-h-12 px-4"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
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
                  {mainRoleAbilityText ? (
                    <p className="text-[11px] leading-4 text-stone-500">
                      {mainRoleAbilityText}
                    </p>
                  ) : null}
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
                <div className="space-y-0.5">
                  <div className="grid grid-cols-2 gap-1">
                    {townsfolkRoleGroup ? (
                      <RoleIconGrid
                        groups={[townsfolkRoleGroup]}
                        roles={roleOptions}
                        selectedRoleId={activeRoleSlot === null ? "" : activeRoleSlot === "main" ? mainRole : additionalRoles[activeRoleSlot] ?? ""}
                        onSelect={assignRoleToSlot}
                        className="h-full"
                        groupClassName="h-full rounded-2xl border border-ember-200/10 p-0.5 sm:p-1"
                        columnsClassName="grid-cols-4 gap-0 sm:grid-cols-4"
                        buttonClassName="relative overflow-visible rounded-lg sm:!min-h-[3.1rem] sm:py-0.5"
                        iconClassName="h-8 w-8 sm:h-10 sm:w-10"
                        roleLabelClassName="mt-[-0.32rem] max-w-[2.5rem] rounded bg-[rgba(255,248,237,0.94)] px-0.5 text-[6px] leading-[0.48rem] text-stone-700 sm:mt-0 sm:max-w-none sm:rounded-none sm:bg-transparent sm:px-0 sm:text-[8px] sm:leading-3 sm:text-inherit"
                        compact
                        unframed
                        showGroupLabel={false}
                      />
                    ) : (
                      <div className="rounded-2xl border border-ember-200/10 p-0.5 sm:p-1" />
                    )}

                    <RoleIconGrid
                      groups={sideRoleGroups}
                      roles={roleOptions}
                      selectedRoleId={activeRoleSlot === null ? "" : activeRoleSlot === "main" ? mainRole : additionalRoles[activeRoleSlot] ?? ""}
                      onSelect={assignRoleToSlot}
                      className="h-full"
                      groupClassName="rounded-2xl border border-ember-200/10 p-0.5 sm:p-1"
                      columnsClassName="grid-cols-4 gap-0 sm:grid-cols-4"
                      buttonClassName="relative overflow-visible rounded-lg sm:!min-h-[3.1rem] sm:py-0.5"
                      iconClassName="h-8 w-8 sm:h-10 sm:w-10"
                      roleLabelClassName="mt-[-0.32rem] max-w-[2.5rem] rounded bg-[rgba(255,248,237,0.94)] px-0.5 text-[6px] leading-[0.48rem] text-stone-700 sm:mt-0 sm:max-w-none sm:rounded-none sm:bg-transparent sm:px-0 sm:text-[8px] sm:leading-3 sm:text-inherit"
                      compact
                      unframed
                      showGroupLabel={false}
                    />
                  </div>

                  {travellerRoleGroup ? (
                    <RoleIconGrid
                      groups={[travellerRoleGroup]}
                      roles={roleOptions}
                      selectedRoleId={activeRoleSlot === null ? "" : activeRoleSlot === "main" ? mainRole : additionalRoles[activeRoleSlot] ?? ""}
                      onSelect={assignRoleToSlot}
                      groupClassName="rounded-2xl border border-ember-200/10 p-0.5 sm:p-1"
                      columnsClassName="grid-cols-4 gap-0 sm:grid-cols-4"
                      buttonClassName="relative overflow-visible rounded-lg sm:!min-h-[3.1rem] sm:py-0.5"
                      iconClassName="h-8 w-8 sm:h-10 sm:w-10"
                      roleLabelClassName="mt-[-0.32rem] max-w-[2.5rem] rounded bg-[rgba(255,248,237,0.94)] px-0.5 text-[6px] leading-[0.48rem] text-stone-700 sm:mt-0 sm:max-w-none sm:rounded-none sm:bg-transparent sm:px-0 sm:text-[8px] sm:leading-3 sm:text-inherit"
                      compact
                      unframed
                      showGroupLabel={false}
                    />
                  ) : null}
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

            {mainRoleNoteRoleId && currentPhase ? (
              <div className="space-y-3 rounded-2xl border border-ember-200/10 bg-black/15 p-3">
                <RoleIntelPanel
                  phase={currentPhase}
                  notes={[]}
                  players={players}
                  roles={mergedScriptRoles}
                  onAddNote={addPlayerRoleIntelNote}
                  onDeleteNote={onDeleteNote}
                  onUpdateNote={onUpdateNote}
                  availableRoleIds={[mainRoleNoteRoleId]}
                  selectedRoleIdOverride={mainRoleNoteRoleId}
                  fixedLinkedPlayerIds={[player.id]}
                  showSourcePlayerPicker={false}
                  hideHistory
                  hideHeader
                  embedded
                />
                {noteError ? <p className="text-sm text-red-200">{noteError}</p> : null}
              </div>
            ) : null}

            <div className="space-y-3">
              {notesByPhase.every((group) => group.notes.length === 0) ? (
                <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
                  Для этого игрока пока нет ролевой информации.
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
                                <textarea
                                  value={editingText}
                                  onChange={(event) => setEditingText(event.target.value)}
                                  className="field min-h-24"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" onClick={() => saveEditingNote(note)} className="primary-button">
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
                                {note.kind === "role_intel" && note.roleId ? (
                                  <div className="mb-3 flex items-center gap-2">
                                    <RoleTokenImage
                                      roleId={note.roleId}
                                      roles={mergedScriptRoles}
                                      className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-ember-200/20 bg-white/90"
                                      imageClassName="h-full w-full object-cover"
                                    />
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.22em] text-ember-100/70">Ролевая информация</p>
                                      <p className="text-sm font-semibold text-stone-100">
                                        {getRoleLabel(note.roleId, mergedScriptRoles)}
                                      </p>
                                    </div>
                                  </div>
                                ) : null}
                                {renderPlayerNoteText(note.text)}
                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <span className="text-xs text-stone-500">
                                    {formatDate(note.createdAt)} · {formatTime(note.createdAt)}
                                  </span>
                                  <div className="flex gap-2">
                                  <button type="button" onClick={() => startEditingNote(note)} className="secondary-button min-h-10 px-3">
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
