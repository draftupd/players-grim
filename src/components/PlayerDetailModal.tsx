import { Edit3, Save, Shuffle, Trash2, UserRound, X } from "lucide-react";
import clsx from "clsx";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Note, PersonalTeam, Phase, Player, ScriptRole, TokenTint } from "../types";
import { sortPhases } from "../utils/dates";
import { mergeManualAndMentionLinks, uniqueIds } from "../utils/mentions";
import { mergeReferenceRoles, useReferenceData } from "../utils/referenceData";
import {
  defaultTravellerRoles,
  getRoleLabel,
  getRoleTypeFromRoles,
  groupRolesByType,
  mergeScriptRoles,
  normalizeRoleId,
  prettifyRoleName,
} from "../utils/scripts";
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
    values: Pick<
      Player,
      | "name"
      | "alive"
      | "deadVoteAvailable"
      | "mainRole"
      | "additionalRoles"
      | "isTraveller"
      | "travellerRole"
      | "travellerTeam"
      | "joinedPhaseId"
      | "leftPhaseId"
      | "tokenTint"
    >,
    isMyToken: boolean,
    myTeam: PersonalTeam | undefined,
  ) => Promise<void>;
  onAddNote: (
    phaseId: string,
    text: string,
    linkedPlayerIds: string[],
    options?: { kind?: Note["kind"]; roleId?: string },
  ) => Promise<void>;
  onDeletePlayer?: (playerId: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onUpdateNote: (noteId: string, text: string, linkedPlayerIds: string[]) => Promise<void>;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ROLE_SELECTION_ARM_DELAY_MS = 450;

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
  onDeletePlayer,
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
      onDeletePlayer={onDeletePlayer}
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
  onDeletePlayer,
  onDeleteNote,
  onUpdateNote,
}: PlayerDetailFormProps) {
  const [name, setName] = useState(player.name);
  const [alive, setAlive] = useState(player.alive);
  const [deadVoteAvailable, setDeadVoteAvailable] = useState(player.deadVoteAvailable ?? true);
  const [tokenTint, setTokenTint] = useState<TokenTint>(player.tokenTint ?? "default");
  const [isTravellerToken, setIsTravellerToken] = useState(Boolean(player.isTraveller));
  const [mainRole, setMainRole] = useState(player.mainRole ?? "");
  const [selectedTravellerRole, setSelectedTravellerRole] = useState(player.travellerRole ?? player.mainRole ?? "");
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
  const [activeRoleSlot, setActiveRoleSlot] = useState<"main" | 0 | 1 | 2 | null>("main");
  const [saving, setSaving] = useState(false);
  const roleSelectionEnabledAtRef = useRef(0);
  const previousRegularMainRoleRef = useRef(player.isTraveller ? "" : player.mainRole ?? "");
  const sortedPhases = sortPhases(phases);
  const isNightPhase = currentPhase?.type === "night";
  const myTokenButtonLocked = myTokenLocked && !markedAsMine;
  const myTokenButtonStyle = isNightPhase
    ? {
        backgroundColor: markedAsMine ? "rgba(20, 184, 166, 0.78)" : "rgba(82, 82, 91, 0.92)",
        borderColor: markedAsMine ? "rgba(204, 251, 241, 0.9)" : "rgba(245, 245, 244, 0.72)",
        color: "#ffffff",
        boxShadow: markedAsMine
          ? "0 0 0 2px rgba(20,184,166,0.32), 0 10px 24px rgba(15,118,110,0.24)"
          : "0 10px 30px rgba(0,0,0,0.22)",
      }
    : {
        backgroundColor: markedAsMine ? "rgba(94, 234, 212, 0.78)" : "rgba(255, 250, 241, 0.95)",
        borderColor: markedAsMine ? "rgba(15, 118, 110, 0.62)" : "rgba(68, 64, 60, 0.28)",
        color: markedAsMine ? "#042f2e" : "#1c1917",
        boxShadow: markedAsMine
          ? "0 0 0 2px rgba(20,184,166,0.18), 0 10px 24px rgba(15,118,110,0.16)"
          : "0 10px 30px rgba(0,0,0,0.16)",
      };
  const { data: referenceData } = useReferenceData();

  useEffect(() => {
    setActiveRoleSlot("main");
    roleSelectionEnabledAtRef.current = Date.now() + ROLE_SELECTION_ARM_DELAY_MS;
  }, [player.id]);
  const linkedPlayerNotes = useMemo(
    () =>
      notes.filter(
        (note) =>
          note.linkedPlayerIds[0] === player.id &&
          note.kind === "role_intel",
      ),
    [notes, player.id],
  );
  const playersById = useMemo(
    () => new Map(players.map((currentPlayer) => [currentPlayer.id, currentPlayer])),
    [players],
  );

  const getRoleIntelSourcePlayerName = (note: Note) => {
    const sourcePlayerId = note.linkedPlayerIds[0];
    return sourcePlayerId ? playersById.get(sourcePlayerId)?.name : undefined;
  };

  const notesByPhase = useMemo(() => {
    return sortedPhases
      .map((phase) => ({
        phase,
        notes: linkedPlayerNotes
          .filter((note) => note.phaseId === phase.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      }))
      .sort((a, b) => {
        const aLatest = a.notes[0]?.createdAt ?? a.phase.createdAt;
        const bLatest = b.notes[0]?.createdAt ?? b.phase.createdAt;
        return bLatest.localeCompare(aLatest);
      });
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
      mergedScriptRoles.filter((role) => role.type !== "fabled" && role.type !== "loric" && role.type !== "traveller"),
    [mergedScriptRoles],
  );
  const travellerRoleOptions = useMemo(
    () => mergeScriptRoles(defaultTravellerRoles, mergedScriptRoles.filter((role) => role.type === "traveller")),
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
  const outsiderRoleGroup = roleIconGroupsByKey.get("outsider");
  const minionRoleGroup = roleIconGroupsByKey.get("minion");
  const demonRoleGroup = roleIconGroupsByKey.get("demon");
  const currentVisibleRoleId = isTravellerToken ? selectedTravellerRole || mainRole : mainRole;
  const mainRoleReference = currentVisibleRoleId
    ? referenceData?.roleMap.get(normalizeRoleId(currentVisibleRoleId)) ?? null
    : null;
  const mainRoleAbilityText = mainRoleReference?.ability?.trim() ?? "";
  const inferredPersonalTeam = useMemo<PersonalTeam>(() => {
    const roleType = isTravellerToken ? "traveller" : getRoleTypeFromRoles(currentVisibleRoleId, mergedScriptRoles);

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
  }, [currentVisibleRoleId, isTravellerToken, mergedScriptRoles]);
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
  const mainRoleNoteRoleId = isTravellerToken ? selectedTravellerRole || mainRole : mainRole;

  const getNextRoleSlot = (roleSlot: "main" | 0 | 1 | 2): "main" | 0 | 1 | 2 => {
    if (roleSlot === "main") {
      return 0;
    }

    if (roleSlot === 0) {
      return 1;
    }

    if (roleSlot === 1) {
      return 2;
    }

    return "main";
  };

  const assignRoleToSlot = (roleId: string) => {
    if (Date.now() < roleSelectionEnabledAtRef.current) {
      return;
    }

    const targetRoleSlot = activeRoleSlot ?? "main";

    if (targetRoleSlot === "main") {
      setMainRole(roleId);
      setActiveRoleSlot(getNextRoleSlot(targetRoleSlot));
      return;
    }

    setAdditionalRoles((current) =>
      current.map((role, index) => (index === targetRoleSlot ? roleId : role)),
    );
    setActiveRoleSlot(getNextRoleSlot(targetRoleSlot));
  };

  const clearRoleSlot = (roleSlot: "main" | 0 | 1 | 2) => {
    if (roleSlot === "main") {
      setMainRole("");
      return;
    }

    updateAdditionalRole(roleSlot, "");
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

  const stripLeadingRoleLabel = (text: string, roleId?: string) => {
    if (!roleId) {
      return text;
    }

    const labels = uniqueIds([getRoleLabel(roleId, mergedScriptRoles), prettifyRoleName(roleId), roleId])
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    return labels.reduce((current, label) => {
      const pattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*[:—-]?\\s*`, "iu");
      return current.replace(pattern, "");
    }, text);
  };

  const renderPlayerNoteText = (text: string, hiddenRoleId?: string, sourcePlayerName?: string) => {
    const noteText = stripLeadingRoleLabel(text, hiddenRoleId);
    const hiddenNormalizedRoleId = hiddenRoleId ? normalizeRoleId(hiddenRoleId) : "";
    const trimmedSourcePlayerName = sourcePlayerName?.trim() ?? "";
    const shouldShowSourcePlayerName =
      Boolean(trimmedSourcePlayerName) &&
      !noteText.trim().toLocaleLowerCase("ru-RU").startsWith(trimmedSourcePlayerName.toLocaleLowerCase("ru-RU"));

    if (!noteText.trim()) {
      return null;
    }

    if (!roleMentionRegex) {
      return (
        <p className="whitespace-pre-wrap text-[13px] leading-4 text-stone-200">
          {shouldShowSourcePlayerName ? (
            <>
              <span className="font-semibold text-stone-100">{trimmedSourcePlayerName}</span>
              {": "}
            </>
          ) : null}
          {noteText}
        </p>
      );
    }

    const lines = noteText.split("\n");

    return (
      <p className="whitespace-pre-wrap text-[13px] leading-4 text-stone-200">
        {shouldShowSourcePlayerName ? (
          <>
            <span className="font-semibold text-stone-100">{trimmedSourcePlayerName}</span>
            {": "}
          </>
        ) : null}
        {lines.map((line, lineIndex) => (
          <Fragment key={`${lineIndex}-${line}`}>
            {line.split(roleMentionRegex).map((part, partIndex) => {
              const roleId = roleMentionMap.get(part);

              if (!roleId) {
                return <Fragment key={`${lineIndex}-${partIndex}`}>{part}</Fragment>;
              }

              if (hiddenNormalizedRoleId && normalizeRoleId(roleId) === hiddenNormalizedRoleId) {
                return null;
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
                    className="inline-flex h-8 max-h-8 min-h-8 w-8 min-w-8 max-w-8 overflow-hidden rounded-full border border-ember-200/20 bg-white/90 shadow-[0_4px_10px_rgba(0,0,0,0.12)]"
                    imageClassName="h-8 max-h-8 w-8 max-w-8 object-cover"
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

  const handleToggleTravellerToken = () => {
    if (isTravellerToken) {
      setIsTravellerToken(false);
      setMainRole(previousRegularMainRoleRef.current);
      return;
    }

    previousRegularMainRoleRef.current = mainRole;
    const nextTravellerRole =
      getRoleTypeFromRoles(mainRole, travellerRoleOptions) === "traveller"
        ? mainRole
        : selectedTravellerRole || travellerRoleOptions[0]?.id || "traveller";

    setSelectedTravellerRole(nextTravellerRole);
    setMainRole(nextTravellerRole);
    setAdditionalRoles(["", "", ""]);
    setIsTravellerToken(true);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const nextTravellerRole = isTravellerToken
      ? selectedTravellerRole || travellerRoleOptions[0]?.id || "traveller"
      : undefined;

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
        mainRole: isTravellerToken ? nextTravellerRole : mainRole.trim() || undefined,
        additionalRoles: isTravellerToken ? ["", "", ""] : additionalRoles.map((role) => role.trim()).slice(0, 3),
        isTraveller: isTravellerToken,
        travellerRole: nextTravellerRole,
        travellerTeam: isTravellerToken ? player.travellerTeam : undefined,
        joinedPhaseId: isTravellerToken ? player.joinedPhaseId ?? currentPhase?.id : undefined,
        leftPhaseId: isTravellerToken ? player.leftPhaseId : undefined,
      }, Boolean(markedAsMine), markedAsMine ? effectivePersonalTeam : undefined);
      onClose();
    } catch {
      setError("Не удалось сохранить игрока.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlayer = async () => {
    if (!onDeletePlayer) {
      return;
    }

    const playerTypeLabel = player.isTraveller ? "Traveller" : "жетон игрока";

    if (!window.confirm(`Удалить ${playerTypeLabel} ${player.name}?`)) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onDeletePlayer(player.id);
      onClose();
    } catch {
      setError(player.isTraveller ? "Не удалось удалить Traveller." : "Не удалось удалить жетон игрока.");
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
        className="player-detail-shell relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-ember-200/15 bg-ink-850 shadow-2xl sm:mx-auto sm:max-w-3xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="player-detail-header flex items-start gap-3 border-b border-ember-200/10 bg-ink-850/95 px-4 py-2.5 backdrop-blur sm:px-5 sm:py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-stone-400">Карточка игрока</p>
            <h2 className="text-xl font-bold leading-tight text-stone-50">{player.name}</h2>
          </div>
        </div>

        <div className="player-detail-body overflow-y-auto px-4 py-2.5 pb-24 sm:px-5 sm:py-3 sm:pb-28">
          <div className="space-y-3">
            <div className="player-detail-top space-y-2.5">
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(0,1fr)_44px_44px] gap-2">
                  <label className="block">
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="field min-h-11"
                      placeholder="Имя игрока"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setAlive((current) => !current)}
                    aria-pressed={alive}
                    aria-label="Игрок жив"
                    title="Игрок жив"
                    className={`flex min-h-11 items-center justify-center rounded-xl border px-2 py-1.5 transition ${
                      alive
                        ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 shadow-[0_0_18px_rgba(110,231,183,0.12)]"
                        : "border-stone-200/10 bg-black/20 text-stone-300"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
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
                    className={`flex min-h-11 items-center justify-center rounded-xl border px-2 py-1.5 transition ${
                      alive
                        ? "cursor-not-allowed border-stone-200/10 bg-black/10 text-stone-600"
                        : deadVoteAvailable
                          ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 shadow-[0_0_18px_rgba(110,231,183,0.12)]"
                          : "border-stone-200/10 bg-black/20 text-stone-300"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
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
                  <p className="text-[9px] leading-3 text-stone-500">
                    {myTokenHint}
                  </p>
                ) : null}
              </div>

            <div className="player-detail-role-panel space-y-2 rounded-2xl border border-ember-100/35 bg-ember-200/10 p-2.5 shadow-[0_0_20px_rgba(242,204,116,0.08)]">
              <div className="grid grid-cols-[minmax(0,1fr)_9.25rem] items-start gap-2">
                <div className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wide text-ember-100">Основная роль</span>
                  {isTravellerToken ? (
                    <select
                      value={selectedTravellerRole || travellerRoleOptions[0]?.id || ""}
                      onChange={(event) => {
                        setSelectedTravellerRole(event.target.value);
                        setMainRole(event.target.value);
                      }}
                      className="field border-ember-100/35 bg-black/35 text-lg font-bold text-stone-50"
                    >
                      {travellerRoleOptions.map((role) => (
                        <option key={role.id} value={role.id}>
                          {getRoleLabel(role.id, travellerRoleOptions)}
                        </option>
                      ))}
                    </select>
                  ) : roleOptions.length > 0 ? (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActiveRoleSlot("main")}
                        className={`flex min-h-11 w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${mainRole ? "pr-9" : ""} ${
                          activeRoleSlot === "main"
                            ? "border-amber-200/60 bg-black/30 shadow-[0_0_0_2px_rgba(242,204,116,0.12)]"
                            : "border-ember-100/35 bg-black/25"
                        }`}
                      >
                        {mainRole ? (
                          <RoleTokenImage
                            roleId={mainRole}
                            roles={roleOptions}
                            className="h-6 w-6 shrink-0 overflow-hidden rounded-full border-0 bg-transparent"
                            imageClassName="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="h-6 w-6 shrink-0 rounded-full border border-dashed border-ember-200/20 bg-black/10" />
                        )}
                        <span className="text-sm font-semibold text-stone-50">
                          {mainRole ? getRoleLabel(mainRole, roleOptions) : "Основная роль"}
                        </span>
                      </button>
                      {mainRole ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            clearRoleSlot("main");
                          }}
                          className="secondary-button absolute right-1.5 top-1/2 h-7 min-h-0 w-7 -translate-y-1/2 rounded-lg px-0 py-0"
                          aria-label="Очистить основную роль"
                          title="Очистить основную роль"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="w-full space-y-2">
                      <div className="relative">
                        <input
                          value={mainRole}
                          onChange={(event) => setMainRole(event.target.value)}
                          className={`field border-ember-100/35 bg-black/35 text-lg font-bold text-stone-50 ${mainRole ? "pr-11" : ""}`}
                          placeholder="Например, Clockmaker"
                        />
                        {mainRole ? (
                          <button
                            type="button"
                            onClick={() => clearRoleSlot("main")}
                            className="secondary-button absolute right-2 top-1/2 h-8 min-h-0 w-8 -translate-y-1/2 rounded-lg px-0 py-0"
                            aria-label="Очистить основную роль"
                            title="Очистить основную роль"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
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
                </div>

                <div className="player-detail-extra-roles space-y-2 rounded-2xl border border-stone-200/10 bg-black/10 p-2">
                  <p className="text-xs font-medium text-stone-500">Доп.роли</p>
                  <div className="grid grid-cols-3 gap-1.5">
                  {[0, 1, 2].map((index) => (
                    roleOptions.length > 0 ? (
                      <div key={index} className="flex min-w-0 flex-col items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveRoleSlot(index as 0 | 1 | 2)}
                          className={`flex min-h-11 w-full items-center justify-center rounded-xl border px-1.5 py-1.5 transition ${
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
                              className="h-6 w-6 overflow-hidden rounded-full border-0 bg-transparent"
                              imageClassName="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="h-6 w-6 rounded-full border border-dashed border-ember-200/20 bg-black/10" />
                          )}
                        </button>
                        {additionalRoles[index] ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              clearRoleSlot(index as 0 | 1 | 2);
                            }}
                            className="secondary-button h-5 min-h-0 w-8 rounded-md px-0 py-0"
                            aria-label={`Очистить доп. роль ${index + 1}`}
                            title={`Очистить доп. роль ${index + 1}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="h-5" aria-hidden="true" />
                        )}
                      </div>
                    ) : (
                    <div key={index} className="flex items-center gap-2">
                      <RoleTokenImage
                        roleId={additionalRoles[index]}
                        roles={scriptRoles}
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-stone-200/15 bg-black/20"
                        imageClassName="h-full w-full object-cover opacity-85"
                      />
                      <div className="relative min-w-0 flex-1">
                        <input
                          value={additionalRoles[index]}
                          onChange={(event) => updateAdditionalRole(index, event.target.value)}
                          className={`field min-h-11 border-stone-200/10 bg-black/20 text-sm text-stone-400 ${additionalRoles[index] ? "pr-10" : ""}`}
                          placeholder={`Роль ${index + 1}`}
                        />
                        {additionalRoles[index] ? (
                          <button
                            type="button"
                            onClick={() => clearRoleSlot(index as 0 | 1 | 2)}
                            className="secondary-button absolute right-1.5 top-1/2 h-7 min-h-0 w-7 -translate-y-1/2 rounded-lg px-0 py-0"
                            aria-label={`Очистить доп. роль ${index + 1}`}
                            title={`Очистить доп. роль ${index + 1}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
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

              {roleOptions.length > 0 && !isTravellerToken ? (
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
                        wrap
                        buttonClassName="relative min-h-[3.9rem] shrink-0 overflow-visible rounded-xl py-1 sm:!min-h-[4.2rem] sm:py-1"
                        iconClassName="h-12 w-12 sm:h-[3.75rem] sm:w-[3.75rem]"
                        roleLabelClassName="mt-[-0.42rem] max-w-[3.25rem] rounded bg-[rgba(255,248,237,0.94)] px-1 text-[8px] leading-[0.72rem] text-stone-700 sm:mt-[-0.5rem] sm:max-w-[3.75rem] sm:text-[9px] sm:leading-3"
                        compact
                        unframed
                        showGroupLabel={false}
                      />
                    ) : (
                      <div className="rounded-2xl border border-ember-200/10 p-0.5 sm:p-1" />
                    )}

                    {outsiderRoleGroup ? (
                      <RoleIconGrid
                        groups={[outsiderRoleGroup]}
                        roles={roleOptions}
                        selectedRoleId={activeRoleSlot === null ? "" : activeRoleSlot === "main" ? mainRole : additionalRoles[activeRoleSlot] ?? ""}
                        onSelect={assignRoleToSlot}
                        className="h-full"
                        groupClassName="h-full rounded-2xl border border-ember-200/10 p-0.5 sm:p-1"
                        wrap
                        buttonClassName="relative min-h-[3.9rem] shrink-0 overflow-visible rounded-xl py-1 sm:!min-h-[4.2rem] sm:py-1"
                        iconClassName="h-12 w-12 sm:h-[3.75rem] sm:w-[3.75rem]"
                        roleLabelClassName="mt-[-0.42rem] max-w-[3.25rem] rounded bg-[rgba(255,248,237,0.94)] px-1 text-[8px] leading-[0.72rem] text-stone-700 sm:mt-[-0.5rem] sm:max-w-[3.75rem] sm:text-[9px] sm:leading-3"
                        compact
                        unframed
                        showGroupLabel={false}
                      />
                    ) : (
                      <div className="rounded-2xl border border-ember-200/10 p-0.5 sm:p-1" />
                    )}
                  </div>

                  {minionRoleGroup || demonRoleGroup ? (
                    <div className="grid grid-cols-2 gap-1">
                      {minionRoleGroup ? (
                        <RoleIconGrid
                          groups={[minionRoleGroup]}
                          roles={roleOptions}
                          selectedRoleId={activeRoleSlot === null ? "" : activeRoleSlot === "main" ? mainRole : additionalRoles[activeRoleSlot] ?? ""}
                          onSelect={assignRoleToSlot}
                          className="h-full"
                          groupClassName="h-full rounded-2xl border border-ember-200/10 p-0.5 sm:p-1"
                          wrap
                          buttonClassName="relative min-h-[3.9rem] shrink-0 overflow-visible rounded-xl py-1 sm:!min-h-[4.2rem] sm:py-1"
                          iconClassName="h-12 w-12 sm:h-[3.75rem] sm:w-[3.75rem]"
                          roleLabelClassName="mt-[-0.42rem] max-w-[3.25rem] rounded bg-[rgba(255,248,237,0.94)] px-1 text-[8px] leading-[0.72rem] text-stone-700 sm:mt-[-0.5rem] sm:max-w-[3.75rem] sm:text-[9px] sm:leading-3"
                          compact
                          unframed
                          showGroupLabel={false}
                        />
                      ) : (
                        <div className="rounded-2xl border border-ember-200/10 p-0.5 sm:p-1" />
                      )}

                      {demonRoleGroup ? (
                        <RoleIconGrid
                          groups={[demonRoleGroup]}
                          roles={roleOptions}
                          selectedRoleId={activeRoleSlot === null ? "" : activeRoleSlot === "main" ? mainRole : additionalRoles[activeRoleSlot] ?? ""}
                          onSelect={assignRoleToSlot}
                          className="h-full"
                          groupClassName="h-full rounded-2xl border border-ember-200/10 p-0.5 sm:p-1"
                          wrap
                          buttonClassName="relative min-h-[3.9rem] shrink-0 overflow-visible rounded-xl py-1 sm:!min-h-[4.2rem] sm:py-1"
                          iconClassName="h-12 w-12 sm:h-[3.75rem] sm:w-[3.75rem]"
                          roleLabelClassName="mt-[-0.42rem] max-w-[3.25rem] rounded bg-[rgba(255,248,237,0.94)] px-1 text-[8px] leading-[0.72rem] text-stone-700 sm:mt-[-0.5rem] sm:max-w-[3.75rem] sm:text-[9px] sm:leading-3"
                          compact
                          unframed
                          showGroupLabel={false}
                        />
                      ) : (
                        <div className="rounded-2xl border border-ember-200/10 p-0.5 sm:p-1" />
                      )}
                    </div>
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
                    <section key={phase.id} className="player-detail-note-group rounded-2xl border border-ember-200/10 bg-black/18 p-2.5">
                      <h4 className="mb-1.5 text-sm font-semibold leading-4 text-ember-100">{phase.title}</h4>
                      <div className="space-y-1.5">
                        {phaseNotes.map((note) => (
                          <article key={note.id} className="rounded-lg border border-ember-200/10 bg-black/15 px-2 py-1.5">
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
                              <div className="flex items-center gap-2">
                                {note.kind === "role_intel" && note.roleId ? (
                                  <div className="shrink-0">
                                    <RoleTokenImage
                                      roleId={note.roleId}
                                      roles={mergedScriptRoles}
                                      className="inline-flex h-6 max-h-6 min-h-6 w-6 min-w-6 max-w-6 shrink-0 overflow-hidden rounded-full border border-ember-200/20 bg-white/90"
                                      imageClassName="h-6 max-h-6 w-6 max-w-6 object-cover"
                                    />
                                  </div>
                                ) : null}
                                <div className="min-w-0 flex-1">
                                  {renderPlayerNoteText(
                                    note.text,
                                    note.kind === "role_intel" ? note.roleId : undefined,
                                    note.kind === "role_intel" ? getRoleIntelSourcePlayerName(note) : undefined,
                                  )}
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <button type="button" onClick={() => startEditingNote(note)} className="secondary-button min-h-7 px-1.5">
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" onClick={() => onDeleteNote(note.id)} className="danger-button min-h-7 px-1.5">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
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

        <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[95] sm:bottom-5 sm:right-5">
          <div className="pointer-events-auto flex items-center gap-2">
            {onDeletePlayer ? (
              <button
                type="button"
                onClick={() => void handleDeletePlayer()}
                disabled={saving}
                aria-label={player.isTraveller ? "Удалить Traveller" : "Удалить жетон"}
                title={player.isTraveller ? "Удалить Traveller" : "Удалить жетон"}
                className="danger-button h-11 min-h-0 w-11 rounded-2xl px-0 py-0"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleToggleTravellerToken}
              disabled={saving}
              aria-pressed={isTravellerToken}
              aria-label={isTravellerToken ? "Сделать обычным игроком" : "Сделать Traveller"}
              title={isTravellerToken ? "Сделать обычным игроком" : "Сделать Traveller"}
              className={clsx(
                "secondary-button h-11 min-h-0 w-11 rounded-2xl px-0 py-0",
                isTravellerToken && "border-amber-300/60 bg-amber-300/18 text-amber-100",
              )}
            >
              <Shuffle className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleToggleMyToken}
              disabled={myTokenLocked && !markedAsMine}
              aria-disabled={myTokenLocked && !markedAsMine}
              aria-pressed={markedAsMine}
              aria-label="Это мой жетон"
              title="Это мой жетон"
              className={clsx(
                "flex h-11 w-11 items-center justify-center rounded-2xl border backdrop-blur transition",
                myTokenButtonLocked && "cursor-not-allowed",
              )}
              style={myTokenButtonStyle}
            >
              <UserRound className="h-5 w-5" strokeWidth={2.55} />
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              aria-label="Сохранить игрока"
              title="Сохранить игрока"
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
