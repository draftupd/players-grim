import { Edit3, Save, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Note, Phase, Player, RoleType, ScriptRole } from "../types";
import { formatDate, formatTime } from "../utils/dates";
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

type RoleSpecialConfig =
  | {
      kind: "generic";
      helper: string;
    }
  | {
      kind: "players_exact";
      count: number;
      helper: string;
      summary: (names: string[]) => string;
    }
  | {
      kind: "players_and_role";
      count: number;
      roleTypes?: RoleType[];
      helper: string;
      roleLabel: string;
      summary: (roleName: string, names: string[]) => string;
    }
  | {
      kind: "single_player";
      helper: string;
      summary: (name: string) => string;
    }
  | {
      kind: "single_player_and_role";
      helper: string;
      roleTypes?: RoleType[];
      roleLabel: string;
      summary: (name: string, roleName: string) => string;
    }
  | {
      kind: "player_and_two_roles";
      helper: string;
      firstRoleLabel: string;
      secondRoleLabel: string;
      firstRoleTypes?: RoleType[];
      secondRoleTypes?: RoleType[];
      summary: (name: string, firstRoleName: string, secondRoleName: string) => string;
    }
  | {
      kind: "two_players_choice";
      helper: string;
      choiceLabel: string;
      choices: Array<{ label: string; value: string }>;
      summary: (names: string[], choiceLabel: string) => string;
    }
  | {
      kind: "count";
      helper: string;
      label: string;
      min?: number;
      max?: number;
      summary: (count: number) => string;
    };

const getRoleNoteTitle = (roleId?: string) => {
  const normalized = normalizeRoleId(roleId ?? "");

  if (normalized === "noble") {
    return "Показанные игроки Noble";
  }

  return "Заметка по роли";
};

const withExtraText = (baseText: string, extraText: string) => {
  const trimmedExtraText = extraText.trim();

  if (!trimmedExtraText) {
    return baseText;
  }

  return `${baseText}\nДополнительно: ${trimmedExtraText}`;
};

const extraTextOnlyResult = (extraText: string, players: Player[]) => {
  const trimmedExtraText = extraText.trim();

  if (!trimmedExtraText) {
    return { text: "", linkedPlayerIds: [] as string[] };
  }

  return {
    text: trimmedExtraText,
    linkedPlayerIds: mergeManualAndMentionLinks(trimmedExtraText, players, []),
  };
};

const buildPartialRoleIntelText = ({
  roleConfig,
  selectedNames,
  selectedRoleName,
  selectedSecondaryRoleName,
  selectedChoiceLabel,
  selectedCountValue,
}: {
  roleConfig: RoleSpecialConfig;
  selectedNames: string[];
  selectedRoleName?: string;
  selectedSecondaryRoleName?: string;
  selectedChoiceLabel?: string;
  selectedCountValue?: string;
}) => {
  switch (roleConfig.kind) {
    case "generic":
      return selectedNames.length > 0 ? `Связанные игроки: ${selectedNames.join(", ")}` : "";
    case "players_exact":
      return selectedNames.length > 0 ? `Выбраны игроки: ${selectedNames.join(", ")}` : "";
    case "players_and_role":
      if (selectedNames.length > 0 && selectedRoleName) {
        return `Выбраны игроки: ${selectedNames.join(", ")}\nВыбрана роль: ${selectedRoleName}`;
      }
      if (selectedNames.length > 0) {
        return `Выбраны игроки: ${selectedNames.join(", ")}`;
      }
      return selectedRoleName ? `Выбрана роль: ${selectedRoleName}` : "";
    case "single_player":
      return selectedNames[0] ? `Выбран игрок: ${selectedNames[0]}` : "";
    case "single_player_and_role":
      if (selectedNames[0] && selectedRoleName) {
        return `Выбран игрок: ${selectedNames[0]}\nВыбрана роль: ${selectedRoleName}`;
      }
      if (selectedNames[0]) {
        return `Выбран игрок: ${selectedNames[0]}`;
      }
      return selectedRoleName ? `Выбрана роль: ${selectedRoleName}` : "";
    case "player_and_two_roles": {
      const parts = [];
      if (selectedNames[0]) parts.push(`Выбран игрок: ${selectedNames[0]}`);
      if (selectedRoleName) parts.push(`Первая роль: ${selectedRoleName}`);
      if (selectedSecondaryRoleName) parts.push(`Вторая роль: ${selectedSecondaryRoleName}`);
      return parts.join("\n");
    }
    case "two_players_choice": {
      const parts = [];
      if (selectedNames.length > 0) parts.push(`Выбраны игроки: ${selectedNames.join(", ")}`);
      if (selectedChoiceLabel) parts.push(`Результат: ${selectedChoiceLabel}`);
      return parts.join("\n");
    }
    case "count":
      return selectedCountValue ? `Выбрано число: ${selectedCountValue}` : "";
  }
};

const splitRoleGroupsForCompactPicker = (
  roles: ScriptRole[],
) => {
  const roleGroupsByKey = new Map(
    groupRolesByType(roles).map((group) => [
      group.type,
      {
        key: group.type,
        roleIds: group.roles.map((role) => role.id),
      },
    ]),
  );

  const leftPrimaryGroup = roleGroupsByKey.get("townsfolk");
  const leftSecondaryGroups = ["traveller", "fabled", "loric"]
    .map((key) => roleGroupsByKey.get(key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const leftSecondaryMergedGroup =
    leftSecondaryGroups.length > 0
      ? {
          key: "misc",
          roleIds: leftSecondaryGroups.flatMap((group) => group.roleIds),
        }
      : null;
  const rightGroups = ["outsider", "minion", "demon"]
    .map((key) => roleGroupsByKey.get(key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));

  return {
    leftPrimaryGroup,
    leftSecondaryMergedGroup,
    rightGroups,
  };
};

const getRoleSpecialConfig = (roleId: string): RoleSpecialConfig => {
  const normalizedRoleId = normalizeRoleId(roleId);

  if (normalizedRoleId === "noble") {
    return {
      kind: "players_exact",
      count: 3,
      helper: "Выберите 3 игроков. Среди них ровно 1 злой.",
      summary: (names) => `Noble увидел: ${names.join(", ")}`,
    };
  }

  if (["washerwoman", "librarian", "investigator"].includes(normalizedRoleId)) {
    const roleTypeById: Record<string, RoleType> = {
      washerwoman: "townsfolk",
      librarian: "outsider",
      investigator: "minion",
    };
    const labelById: Record<string, string> = {
      washerwoman: "какая роль показана",
      librarian: "какая роль показана",
      investigator: "какая роль показана",
    };

    return {
      kind: "players_and_role",
      count: 2,
      roleTypes: [roleTypeById[normalizedRoleId]],
      helper: "Выберите 2 игроков и роль, которую показал рассказчик.",
      roleLabel: labelById[normalizedRoleId],
      summary: (roleName, names) => `Показано, что 1 из ${names.join(" / ")} — ${roleName}`,
    };
  }

  if (normalizedRoleId === "knight") {
    return {
      kind: "players_exact",
      count: 2,
      helper: "Выберите 2 игроков, которые не являются Демоном.",
      summary: (names) => `Knight увидел не-Демонов: ${names.join(", ")}`,
    };
  }

  if (normalizedRoleId === "steward") {
    return {
      kind: "single_player",
      helper: "Выберите игрока, которого Steward узнал как доброго.",
      summary: (name) => `Steward узнал доброго игрока: ${name}`,
    };
  }

  if (normalizedRoleId === "dreamer") {
    return {
      kind: "player_and_two_roles",
      helper: "Выберите игрока и 2 роли, одну из которых он действительно имеет.",
      firstRoleLabel: "первая роль",
      secondRoleLabel: "вторая роль",
      summary: (name, firstRoleName, secondRoleName) =>
        `Dreamer узнал, что ${name} — это либо ${firstRoleName}, либо ${secondRoleName}`,
    };
  }

  if (normalizedRoleId === "seamstress") {
    return {
      kind: "two_players_choice",
      helper: "Выберите 2 игроков и отметьте, одинакового ли они мировоззрения.",
      choiceLabel: "результат",
      choices: [
        { label: "Одинаковое мировоззрение", value: "одинаковое мировоззрение" },
        { label: "Разное мировоззрение", value: "разное мировоззрение" },
      ],
      summary: (names, choiceLabel) => `Seamstress: ${names.join(" и ")} имеют ${choiceLabel}`,
    };
  }

  if (["chef", "clockmaker", "oracle", "mathematician", "empath"].includes(normalizedRoleId)) {
    const helperById: Record<string, string> = {
      chef: "Укажите число, которое получил Chef.",
      clockmaker: "Укажите расстояние между Демоном и ближайшим Миньоном.",
      oracle: "Укажите число мёртвых злых игроков.",
      mathematician: "Укажите число игроков, чья способность сработала неправильно.",
      empath: "Укажите число злых соседей.",
    };

    return {
      kind: "count",
      helper: helperById[normalizedRoleId],
      label: "число",
      min: 0,
      max: 20,
      summary: (count) => `${prettifyRoleName(roleId)} получил число: ${count}`,
    };
  }

  if (["undertaker", "ravenkeeper", "cannibal"].includes(normalizedRoleId)) {
    return {
      kind: "single_player_and_role",
      helper: "Выберите игрока и роль, которую про него узнали.",
      roleLabel: "какая роль была узнана",
      summary: (name, roleName) => `${prettifyRoleName(roleId)} узнал, что ${name} — ${roleName}`,
    };
  }

  if (["monk", "poisoner", "snakecharmer", "slayer", "exorcist", "courtier", "preacher"].includes(normalizedRoleId)) {
    return {
      kind: "single_player",
      helper: "Выберите игрока, на которого была направлена способность.",
      summary: (name) => `${prettifyRoleName(roleId)} выбрал игрока: ${name}`,
    };
  }

  return {
    kind: "generic",
    helper: "Выберите связанных игроков и при необходимости добавьте пояснение.",
  };
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
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedRoleOptionId, setSelectedRoleOptionId] = useState("");
  const [selectedSecondaryRoleOptionId, setSelectedSecondaryRoleOptionId] = useState("");
  const [selectedCountValue, setSelectedCountValue] = useState("");
  const [selectedChoiceValue, setSelectedChoiceValue] = useState("");
  const [extraText, setExtraText] = useState("");
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
  const selectedRoleConfig = useMemo(
    () => (selectedRoleId ? getRoleSpecialConfig(selectedRoleId) : null),
    [selectedRoleId],
  );
  const filteredRoleOptions = useMemo(() => {
    if (!selectedRoleConfig || !("roleTypes" in selectedRoleConfig) || !selectedRoleConfig.roleTypes) {
      return sortedRoles;
    }

    return sortedRoles.filter((role) => selectedRoleConfig.roleTypes?.includes(role.type));
  }, [selectedRoleConfig, sortedRoles]);
  const firstFilteredRoleOptions = useMemo(() => {
    if (!selectedRoleConfig || !("firstRoleTypes" in selectedRoleConfig) || !selectedRoleConfig.firstRoleTypes) {
      return sortedRoles;
    }

    return sortedRoles.filter((role) => selectedRoleConfig.firstRoleTypes?.includes(role.type));
  }, [selectedRoleConfig, sortedRoles]);
  const secondFilteredRoleOptions = useMemo(() => {
    if (!selectedRoleConfig || !("secondRoleTypes" in selectedRoleConfig) || !selectedRoleConfig.secondRoleTypes) {
      return sortedRoles;
    }

    return sortedRoles.filter((role) => selectedRoleConfig.secondRoleTypes?.includes(role.type));
  }, [selectedRoleConfig, sortedRoles]);
  const compactFilteredRolePicker = useMemo(
    () => splitRoleGroupsForCompactPicker(filteredRoleOptions),
    [filteredRoleOptions],
  );
  const compactFirstRolePicker = useMemo(
    () => splitRoleGroupsForCompactPicker(firstFilteredRoleOptions),
    [firstFilteredRoleOptions],
  );
  const compactSecondRolePicker = useMemo(
    () => splitRoleGroupsForCompactPicker(secondFilteredRoleOptions),
    [secondFilteredRoleOptions],
  );

  useEffect(() => {
    setSelectedPlayerIds([]);
    setSelectedRoleOptionId("");
    setSelectedSecondaryRoleOptionId("");
    setSelectedCountValue("");
    setSelectedChoiceValue("");
    setExtraText("");
    setError("");
  }, [selectedRoleId]);

  const togglePlayer = (playerId: string, limit?: number) => {
    setSelectedPlayerIds((current) => {
      if (current.includes(playerId)) {
        return current.filter((id) => id !== playerId);
      }

      if (limit && current.length >= limit) {
        return current;
      }

      return [...current, playerId];
    });
  };

  const resetComposer = () => {
    setSelectedPlayerIds([]);
    setSelectedRoleOptionId("");
    setSelectedSecondaryRoleOptionId("");
    setSelectedCountValue("");
    setSelectedChoiceValue("");
    setExtraText("");
  };

  const buildRoleText = () => {
    if (!selectedRoleId || !selectedRoleConfig) {
      return { text: "", linkedPlayerIds: [] as string[] };
    }

    const selectedNames = selectedPlayerIds
      .map((playerId) => playersById.get(playerId)?.name ?? "Неизвестно");

    switch (selectedRoleConfig.kind) {
      case "generic": {
        const trimmedExtraText = extraText.trim();

        if (selectedPlayerIds.length === 0 && !trimmedExtraText) {
          return { text: "", linkedPlayerIds: [] };
        }

        const baseText = selectedPlayerIds.length > 0 ? `Связанные игроки: ${selectedNames.join(", ")}` : "Заметка по роли";
        return {
          text: withExtraText(baseText, trimmedExtraText),
          linkedPlayerIds: mergeManualAndMentionLinks(trimmedExtraText, players, selectedPlayerIds),
        };
      }
      case "players_exact": {
        if (selectedPlayerIds.length !== selectedRoleConfig.count) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(selectedNames), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
        };
      }
      case "players_and_role": {
        const selectedRoleName = sortedRoles.find((role) => role.id === selectedRoleOptionId)?.name ?? prettifyRoleName(selectedRoleOptionId);

        if (selectedPlayerIds.length !== selectedRoleConfig.count || !selectedRoleOptionId) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedRoleName: selectedRoleOptionId ? selectedRoleName : undefined,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(selectedRoleName, selectedNames), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
        };
      }
      case "single_player": {
        if (selectedPlayerIds.length !== 1) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(selectedNames[0]), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
        };
      }
      case "single_player_and_role": {
        const selectedRoleName = sortedRoles.find((role) => role.id === selectedRoleOptionId)?.name ?? prettifyRoleName(selectedRoleOptionId);

        if (selectedPlayerIds.length !== 1 || !selectedRoleOptionId) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedRoleName: selectedRoleOptionId ? selectedRoleName : undefined,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(selectedNames[0], selectedRoleName), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
        };
      }
      case "player_and_two_roles": {
        const firstRoleName = sortedRoles.find((role) => role.id === selectedRoleOptionId)?.name ?? prettifyRoleName(selectedRoleOptionId);
        const secondRoleName =
          sortedRoles.find((role) => role.id === selectedSecondaryRoleOptionId)?.name ??
          prettifyRoleName(selectedSecondaryRoleOptionId);

        if (selectedPlayerIds.length !== 1 || !selectedRoleOptionId || !selectedSecondaryRoleOptionId) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedRoleName: selectedRoleOptionId ? firstRoleName : undefined,
            selectedSecondaryRoleName: selectedSecondaryRoleOptionId ? secondRoleName : undefined,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(
            selectedRoleConfig.summary(selectedNames[0], firstRoleName, secondRoleName),
            extraText,
          ),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
        };
      }
      case "two_players_choice": {
        const selectedChoice = selectedRoleConfig.choices.find((choice) => choice.value === selectedChoiceValue);

        if (selectedPlayerIds.length !== 2 || !selectedChoice) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedChoiceLabel: selectedChoice?.label,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(selectedNames, selectedChoice.label), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
        };
      }
      case "count": {
        const parsedCount = Number(selectedCountValue);

        if (selectedCountValue === "" || Number.isNaN(parsedCount)) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedCountValue,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, []),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(parsedCount), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, []),
        };
      }
    }
  };

  const handleAdd = async () => {
    const { text, linkedPlayerIds } = buildRoleText();
    const fallbackRoleName =
      sortedRoles.find((role) => normalizeRoleId(role.id) === normalizeRoleId(selectedRoleId))?.name ??
      prettifyRoleName(selectedRoleId);
    const noteText = text || `${fallbackRoleName}: заметка без деталей`;

    if (!selectedRoleId) {
      setError("Сначала выберите роль.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onAddNote(selectedRoleId, noteText, linkedPlayerIds);
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
        mergeManualAndMentionLinks(trimmed, players, note.linkedPlayerIds),
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

        {selectedRoleConfig ? (
          <div className="space-y-3">
            <p className="text-sm text-stone-400">{selectedRoleConfig.helper}</p>

            {selectedRoleConfig.kind === "generic" || selectedRoleConfig.kind === "players_exact" ? (
              <div className="flex flex-wrap gap-2">
                {players.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() =>
                      togglePlayer(
                        player.id,
                        selectedRoleConfig.kind === "players_exact" ? selectedRoleConfig.count : undefined,
                      )
                    }
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      selectedPlayerIds.includes(player.id)
                        ? "role-player-selected border-transparent text-stone-50"
                        : "border-ember-200/10 bg-black/20 text-stone-200 hover:border-ember-200/25 hover:bg-ember-200/8"
                    }`}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            ) : null}

            {selectedRoleConfig.kind === "players_and_role" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => togglePlayer(player.id, selectedRoleConfig.count)}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${
                        selectedPlayerIds.includes(player.id)
                          ? "role-player-selected border-transparent text-stone-50"
                          : "border-ember-200/10 bg-black/20 text-stone-200 hover:border-ember-200/25 hover:bg-ember-200/8"
                      }`}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-stone-400">
                    {selectedRoleConfig.roleLabel}
                  </span>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        {compactFilteredRolePicker.leftPrimaryGroup ? (
                          <RoleIconGrid
                            groups={[compactFilteredRolePicker.leftPrimaryGroup]}
                            roles={filteredRoleOptions}
                            selectedRoleId={selectedRoleOptionId}
                            onSelect={setSelectedRoleOptionId}
                            groupClassName="rounded-2xl border border-ember-200/10 px-1 py-0.5"
                            columnsClassName="grid-cols-5 gap-0.5"
                            buttonClassName="rounded-sm"
                            iconClassName="h-6 w-6"
                            unframed
                            showGroupLabel={false}
                          />
                        ) : null}
                        {compactFilteredRolePicker.leftSecondaryMergedGroup ? (
                          <RoleIconGrid
                            groups={[compactFilteredRolePicker.leftSecondaryMergedGroup]}
                            roles={filteredRoleOptions}
                            selectedRoleId={selectedRoleOptionId}
                            onSelect={setSelectedRoleOptionId}
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
                        {compactFilteredRolePicker.rightGroups.map((group) => (
                          <RoleIconGrid
                            key={group.key}
                            groups={[group]}
                            roles={filteredRoleOptions}
                            selectedRoleId={selectedRoleOptionId}
                            onSelect={setSelectedRoleOptionId}
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
                    <p className="text-sm text-stone-400">
                      {selectedRoleOptionId
                        ? filteredRoleOptions.find((role) => role.id === selectedRoleOptionId)?.name ?? prettifyRoleName(selectedRoleOptionId)
                        : "Роль пока не выбрана"}
                    </p>
                  </div>
                </label>
              </div>
            ) : null}

            {selectedRoleConfig.kind === "single_player" ? (
              <div className="flex flex-wrap gap-2">
                {players.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerIds((current) => (current[0] === player.id ? [] : [player.id]))}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      selectedPlayerIds[0] === player.id
                        ? "role-player-selected border-transparent text-stone-50"
                        : "border-ember-200/10 bg-black/20 text-stone-200 hover:border-ember-200/25 hover:bg-ember-200/8"
                    }`}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            ) : null}

            {selectedRoleConfig.kind === "single_player_and_role" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerIds((current) => (current[0] === player.id ? [] : [player.id]))}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      selectedPlayerIds[0] === player.id
                        ? "role-player-selected border-transparent text-stone-50"
                        : "border-ember-200/10 bg-black/20 text-stone-200 hover:border-ember-200/25 hover:bg-ember-200/8"
                    }`}
                  >
                      {player.name}
                    </button>
                  ))}
                </div>
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-stone-400">
                      {selectedRoleConfig.roleLabel}
                    </span>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          {compactFilteredRolePicker.leftPrimaryGroup ? (
                            <RoleIconGrid
                              groups={[compactFilteredRolePicker.leftPrimaryGroup]}
                              roles={filteredRoleOptions}
                              selectedRoleId={selectedRoleOptionId}
                              onSelect={setSelectedRoleOptionId}
                              groupClassName="rounded-2xl border border-ember-200/10 px-1 py-0.5"
                              columnsClassName="grid-cols-5 gap-0.5"
                              buttonClassName="rounded-sm"
                              iconClassName="h-6 w-6"
                              unframed
                              showGroupLabel={false}
                            />
                          ) : null}
                          {compactFilteredRolePicker.leftSecondaryMergedGroup ? (
                            <RoleIconGrid
                              groups={[compactFilteredRolePicker.leftSecondaryMergedGroup]}
                              roles={filteredRoleOptions}
                              selectedRoleId={selectedRoleOptionId}
                              onSelect={setSelectedRoleOptionId}
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
                          {compactFilteredRolePicker.rightGroups.map((group) => (
                            <RoleIconGrid
                              key={group.key}
                              groups={[group]}
                              roles={filteredRoleOptions}
                              selectedRoleId={selectedRoleOptionId}
                              onSelect={setSelectedRoleOptionId}
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
                    <p className="text-sm text-stone-400">
                      {selectedRoleOptionId
                        ? filteredRoleOptions.find((role) => role.id === selectedRoleOptionId)?.name ?? prettifyRoleName(selectedRoleOptionId)
                        : "Роль пока не выбрана"}
                    </p>
                  </div>
                </label>
              </div>
            ) : null}

            {selectedRoleConfig.kind === "player_and_two_roles" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerIds((current) => (current[0] === player.id ? [] : [player.id]))}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      selectedPlayerIds[0] === player.id
                        ? "role-player-selected border-transparent text-stone-50"
                        : "border-ember-200/10 bg-black/20 text-stone-200 hover:border-ember-200/25 hover:bg-ember-200/8"
                    }`}
                  >
                      {player.name}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-stone-400">
                      {selectedRoleConfig.firstRoleLabel}
                    </span>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          {compactFirstRolePicker.leftPrimaryGroup ? (
                            <RoleIconGrid
                              groups={[compactFirstRolePicker.leftPrimaryGroup]}
                              roles={firstFilteredRoleOptions}
                              selectedRoleId={selectedRoleOptionId}
                              onSelect={setSelectedRoleOptionId}
                              groupClassName="rounded-2xl border border-ember-200/10 px-1 py-0.5"
                              columnsClassName="grid-cols-5 gap-0.5"
                              buttonClassName="rounded-sm"
                              iconClassName="h-6 w-6"
                              unframed
                              showGroupLabel={false}
                            />
                          ) : null}
                          {compactFirstRolePicker.leftSecondaryMergedGroup ? (
                            <RoleIconGrid
                              groups={[compactFirstRolePicker.leftSecondaryMergedGroup]}
                              roles={firstFilteredRoleOptions}
                              selectedRoleId={selectedRoleOptionId}
                              onSelect={setSelectedRoleOptionId}
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
                          {compactFirstRolePicker.rightGroups.map((group) => (
                            <RoleIconGrid
                              key={group.key}
                              groups={[group]}
                              roles={firstFilteredRoleOptions}
                              selectedRoleId={selectedRoleOptionId}
                              onSelect={setSelectedRoleOptionId}
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
                      <p className="text-sm text-stone-400">
                        {selectedRoleOptionId
                          ? firstFilteredRoleOptions.find((role) => role.id === selectedRoleOptionId)?.name ?? prettifyRoleName(selectedRoleOptionId)
                          : "Роль пока не выбрана"}
                      </p>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-stone-400">
                      {selectedRoleConfig.secondRoleLabel}
                    </span>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          {compactSecondRolePicker.leftPrimaryGroup ? (
                            <RoleIconGrid
                              groups={[compactSecondRolePicker.leftPrimaryGroup]}
                              roles={secondFilteredRoleOptions}
                              selectedRoleId={selectedSecondaryRoleOptionId}
                              onSelect={setSelectedSecondaryRoleOptionId}
                              groupClassName="rounded-2xl border border-ember-200/10 px-1 py-0.5"
                              columnsClassName="grid-cols-5 gap-0.5"
                              buttonClassName="rounded-sm"
                              iconClassName="h-6 w-6"
                              unframed
                              showGroupLabel={false}
                            />
                          ) : null}
                          {compactSecondRolePicker.leftSecondaryMergedGroup ? (
                            <RoleIconGrid
                              groups={[compactSecondRolePicker.leftSecondaryMergedGroup]}
                              roles={secondFilteredRoleOptions}
                              selectedRoleId={selectedSecondaryRoleOptionId}
                              onSelect={setSelectedSecondaryRoleOptionId}
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
                          {compactSecondRolePicker.rightGroups.map((group) => (
                            <RoleIconGrid
                              key={group.key}
                              groups={[group]}
                              roles={secondFilteredRoleOptions}
                              selectedRoleId={selectedSecondaryRoleOptionId}
                              onSelect={setSelectedSecondaryRoleOptionId}
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
                      <p className="text-sm text-stone-400">
                        {selectedSecondaryRoleOptionId
                          ? secondFilteredRoleOptions.find((role) => role.id === selectedSecondaryRoleOptionId)?.name ?? prettifyRoleName(selectedSecondaryRoleOptionId)
                          : "Роль пока не выбрана"}
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            ) : null}

            {selectedRoleConfig.kind === "two_players_choice" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                    key={player.id}
                    type="button"
                    onClick={() => togglePlayer(player.id, 2)}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      selectedPlayerIds.includes(player.id)
                        ? "role-player-selected border-transparent text-stone-50"
                        : "border-ember-200/10 bg-black/20 text-stone-200 hover:border-ember-200/25 hover:bg-ember-200/8"
                    }`}
                  >
                      {player.name}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-stone-400">
                    {selectedRoleConfig.choiceLabel}
                  </span>
                  <select value={selectedChoiceValue} onChange={(event) => setSelectedChoiceValue(event.target.value)} className="field">
                    <option value="">Выберите результат</option>
                    {selectedRoleConfig.choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {selectedRoleConfig.kind === "count" ? (
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-stone-400">
                  {selectedRoleConfig.label}
                </span>
                <input
                  type="number"
                  min={selectedRoleConfig.min ?? 0}
                  max={selectedRoleConfig.max ?? 20}
                  value={selectedCountValue}
                  onChange={(event) => setSelectedCountValue(event.target.value)}
                  className="field"
                  placeholder="Введите число"
                />
              </label>
            ) : null}

            <label className="block">
              <div className="relative">
                <MentionTextarea
                  value={extraText}
                  onChange={setExtraText}
                  players={players}
                  minHeightClassName="min-h-11 pr-16 pt-3 pb-3"
                  placeholder="Дополнительный текст к спец. заметке."
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
                      <span className="text-xs text-stone-500">
                        {formatDate(note.createdAt)} · {formatTime(note.createdAt)}
                      </span>
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
