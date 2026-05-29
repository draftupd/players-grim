import { Edit3, Save, Send, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { Note, Phase, Player, RoleType, ScriptRole } from "../types";
import { formatDate, formatTime } from "../utils/dates";
import { mergeManualAndMentionLinks } from "../utils/mentions";
import { getRoleLabel, groupRolesByType, normalizeRoleId, prettifyRoleName } from "../utils/scripts";
import MentionTextarea from "./MentionTextarea";
import RoleIconGrid from "./RoleIconGrid";
import RoleTokenImage from "./RoleTokenImage";

type RoleIntelPanelProps = {
  phase?: Phase;
  notes: Note[];
  players: Player[];
  roles: ScriptRole[];
  onAddNote: (roleId: string, text: string, linkedPlayerIds: string[]) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onUpdateNote: (noteId: string, text: string, linkedPlayerIds: string[]) => Promise<void>;
  availableRoleIds?: string[];
  selectedRoleIdOverride?: string;
  onRoleSelect?: (roleId: string) => void;
  fixedLinkedPlayerIds?: string[];
  showSourcePlayerPicker?: boolean;
  hideHistory?: boolean;
  hideHeader?: boolean;
  emptyHistoryText?: string;
  embedded?: boolean;
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
      kind: "players_up_to";
      max: number;
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
      kind: "players_any_choice";
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
    }
  | {
      kind: "role_only";
      helper: string;
      roleLabel: string;
      roleTypes?: RoleType[];
      summary: (roleName: string) => string;
    }
  | {
      kind: "roles_multi";
      helper: string;
      roleLabel: string;
      min?: number;
      max?: number;
      roleTypes?: RoleType[];
      summary: (roleNames: string[]) => string;
    }
  | {
      kind: "player_role_pairs";
      helper: string;
      maxPairs: number;
      roleLabel: string;
      roleTypes?: RoleType[];
      summary: (pairs: Array<{ playerName: string; roleName: string }>) => string;
    }
  | {
      kind: "players_exact_and_count";
      count: number;
      helper: string;
      countLabel: string;
      min?: number;
      max?: number;
      summary: (names: string[], count: number) => string;
    }
  | {
      kind: "choice_only";
      helper: string;
      choiceLabel: string;
      choices: Array<{ label: string; value: string }>;
      summary: (choiceLabel: string) => string;
    }
  | {
      kind: "single_player_and_choice";
      helper: string;
      choiceLabel: string;
      choices: Array<{ label: string; value: string }>;
      summary: (name: string, choiceLabel: string) => string;
    };

const getRoleNoteTitle = (roleId?: string) => {
  const normalized = normalizeRoleId(roleId ?? "");

  if (normalized === "noble") {
    return "Показанные игроки Noble";
  }

  return "Заметка по роли";
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const toggleRoleId = (
  current: string[],
  roleId: string,
  max?: number,
) => {
  if (current.includes(roleId)) {
    return current.filter((id) => id !== roleId);
  }

  if (max && current.length >= max) {
    return current;
  }

  return [...current, roleId];
};

const buildPartialRoleIntelText = ({
  roleConfig,
  selectedNames,
  selectedRoleName,
  selectedSecondaryRoleName,
  selectedChoiceLabel,
  selectedCountValue,
  selectedPairTexts,
}: {
  roleConfig: RoleSpecialConfig;
  selectedNames: string[];
  selectedRoleName?: string;
  selectedSecondaryRoleName?: string;
  selectedChoiceLabel?: string;
  selectedCountValue?: string;
  selectedPairTexts?: string[];
}) => {
  switch (roleConfig.kind) {
    case "generic":
      return selectedNames.length > 0 ? `Связанные игроки: ${selectedNames.join(", ")}` : "";
    case "players_exact":
      return selectedNames.length > 0 ? `Выбраны игроки: ${selectedNames.join(", ")}` : "";
    case "players_up_to":
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
    case "players_any_choice": {
      const parts = [];
      if (selectedNames.length > 0) parts.push(`Выбраны игроки: ${selectedNames.join(", ")}`);
      if (selectedChoiceLabel) parts.push(`Результат: ${selectedChoiceLabel}`);
      return parts.join("\n");
    }
    case "count":
      return selectedCountValue ? `Выбрано число: ${selectedCountValue}` : "";
    case "role_only":
      return selectedRoleName ? `Выбрана роль: ${selectedRoleName}` : "";
    case "roles_multi":
      return selectedRoleName ? `Выбраны роли: ${selectedRoleName}` : "";
    case "player_role_pairs":
      return selectedPairTexts && selectedPairTexts.length > 0
        ? `Выбраны связки:\n${selectedPairTexts.join("\n")}`
        : "";
    case "players_exact_and_count": {
      const parts = [];
      if (selectedNames.length > 0) parts.push(`Выбраны игроки: ${selectedNames.join(", ")}`);
      if (selectedCountValue) parts.push(`Выбрано число: ${selectedCountValue}`);
      return parts.join("\n");
    }
    case "choice_only":
      return selectedChoiceLabel ? `Результат: ${selectedChoiceLabel}` : "";
    case "single_player_and_choice": {
      const parts = [];
      if (selectedNames[0]) parts.push(`Выбран игрок: ${selectedNames[0]}`);
      if (selectedChoiceLabel) parts.push(`Результат: ${selectedChoiceLabel}`);
      return parts.join("\n");
    }
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

  const townsfolkGroup = roleGroupsByKey.get("townsfolk");
  const outsiderGroup = roleGroupsByKey.get("outsider");
  const minionGroup = roleGroupsByKey.get("minion");
  const demonGroup = roleGroupsByKey.get("demon");
  const bottomGroups = (["traveller", "fabled", "loric"] satisfies RoleType[])
    .map((key) => roleGroupsByKey.get(key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const bottomMergedGroup =
    bottomGroups.length > 0
      ? {
          key: "misc",
          roleIds: bottomGroups.flatMap((group) => group.roleIds),
        }
      : null;
  return {
    townsfolkGroup,
    outsiderGroup,
    minionGroup,
    demonGroup,
    bottomMergedGroup,
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

  if (normalizedRoleId === "sage") {
    return {
      kind: "players_exact",
      count: 2,
      helper: "Выберите 2 игроков, среди которых был показан Демон.",
      summary: (names) => `Sage узнал, что Демон — это 1 из: ${names.join(", ")}`,
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
      firstRoleTypes: ["townsfolk", "outsider"],
      secondRoleTypes: ["minion", "demon"],
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

  if (["xaan"].includes(normalizedRoleId)) {
    return {
      kind: "count",
      helper: "Укажите значение X для Xaan.",
      label: "значение X",
      min: 0,
      max: 10,
      summary: (count) => `Xaan: значение X = ${count}`,
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

  if (["drunk"].includes(normalizedRoleId)) {
    return {
      kind: "role_only",
      helper: "Выберите роль, которой считал себя Drunk.",
      roleLabel: "мнимая роль",
      roleTypes: ["townsfolk"],
      summary: (roleName) => `Drunk думал, что он ${roleName}`,
    };
  }

  if (
    [
      "monk",
      "poisoner",
      "snakecharmer",
      "slayer",
      "exorcist",
      "preacher",
      "professor",
      "highpriestess",
      "balloonist",
      "bountyhunter",
      "steward",
      "butler",
      "klutz",
      "moonchild",
      "golem",
      "bonecollector",
      "bureaucrat",
      "thief",
      "gunslinger",
      "assassin",
      "fearmonger",
      "psychopath",
      "widow",
      "farmer",
      "lycanthrope",
      "witch",
      "sweetheart",
      "goon",
      "scapegoat",
    ].includes(normalizedRoleId)
  ) {
    return {
      kind: "single_player",
      helper: "Выберите игрока, на которого была направлена способность.",
      summary: (name) => `${prettifyRoleName(roleId)} выбрал игрока: ${name}`,
    };
  }

  if (["fortuneteller"].includes(normalizedRoleId)) {
    return {
      kind: "two_players_choice",
      helper: "Выберите 2 игроков и отметьте, есть ли среди них Демон.",
      choiceLabel: "результат",
      choices: [
        { label: "Среди них есть Демон", value: "demon_yes" },
        { label: "Среди них нет Демона", value: "demon_no" },
      ],
      summary: (names, choiceLabel) => `Fortune Teller: ${names.join(" и ")} — ${choiceLabel.toLowerCase()}`,
    };
  }

  if (["chambermaid", "duchess"].includes(normalizedRoleId)) {
    return {
      kind: "players_exact_and_count",
      count: normalizedRoleId === "duchess" ? 3 : 2,
      helper:
        normalizedRoleId === "duchess"
          ? "Выберите 3 посетителей Duchess и укажите, сколько среди них злых."
          : "Выберите 2 игроков и укажите, сколько из них просыпались из-за способности.",
      countLabel: normalizedRoleId === "duchess" ? "сколько злых" : "сколько просыпались",
      min: 0,
      max: normalizedRoleId === "duchess" ? 3 : 2,
      summary: (names, count) =>
        normalizedRoleId === "duchess"
          ? `Duchess: ${names.join(", ")}; злых среди них: ${count}`
          : `Chambermaid: ${names.join(", ")}; просыпались: ${count}`,
    };
  }

  if (normalizedRoleId === "flowergirl") {
    return {
      kind: "players_any_choice",
      helper: "Отметьте игроков, связанных с голосованием, и укажите, голосовал ли Демон сегодня.",
      choiceLabel: "результат",
      choices: [
        { label: "Да", value: "yes" },
        { label: "Нет", value: "no" },
      ],
      summary: (names, choiceLabel) =>
        `Flowergirl: Демон голосовал — ${choiceLabel.toLowerCase()}${names.length > 0 ? `; игроки: ${names.join(", ")}` : ""}`,
    };
  }

  if (normalizedRoleId === "towncrier") {
    return {
      kind: "choice_only",
      helper: "Отметьте, номинировал ли Миньон сегодня.",
      choiceLabel: "результат",
      choices: [
        { label: "Да", value: "yes" },
        { label: "Нет", value: "no" },
      ],
      summary: (choiceLabel) => `${prettifyRoleName(roleId)}: ${choiceLabel}`,
    };
  }

  if (["general"].includes(normalizedRoleId)) {
    return {
      kind: "choice_only",
      helper: "Отметьте, кто по мнению рассказчика сейчас ближе к победе.",
      choiceLabel: "кто выигрывает",
      choices: [
        { label: "Добро", value: "good" },
        { label: "Зло", value: "evil" },
        { label: "Никто", value: "neither" },
      ],
      summary: (choiceLabel) => `General: ближе к победе ${choiceLabel.toLowerCase()}`,
    };
  }

  if (["shugenja", "judge", "organgrinder", "organ_grinder"].includes(normalizedRoleId)) {
    const configById = {
      shugenja: {
        helper: "Отметьте направление к ближайшему злому игроку.",
        choiceLabel: "направление",
        choices: [
          { label: "По часовой", value: "clockwise" },
          { label: "Против часовой", value: "counterclockwise" },
          { label: "Произвольно", value: "arbitrary" },
        ],
      },
      judge: {
        helper: "Отметьте решение Судьи по текущей казни.",
        choiceLabel: "решение",
        choices: [
          { label: "Пропустить", value: "pass" },
          { label: "Провалить", value: "fail" },
        ],
      },
      organgrinder: {
        helper: "Отметьте, выбрал ли Organ Grinder быть пьяным до рассвета.",
        choiceLabel: "состояние",
        choices: [
          { label: "Пьян", value: "drunk" },
          { label: "Не пьян", value: "sober" },
        ],
      },
      organ_grinder: {
        helper: "Отметьте, выбрал ли Organ Grinder быть пьяным до рассвета.",
        choiceLabel: "состояние",
        choices: [
          { label: "Пьян", value: "drunk" },
          { label: "Не пьян", value: "sober" },
        ],
      },
    } as const;
    const config = configById[normalizedRoleId as keyof typeof configById];

    return {
      kind: "choice_only",
      helper: config.helper,
      choiceLabel: config.choiceLabel,
      choices: [...config.choices],
      summary: (choiceLabel) => `${prettifyRoleName(roleId)}: ${choiceLabel}`,
    };
  }

  if (["villageidiot", "barista", "beggar", "cultleader"].includes(normalizedRoleId)) {
    const configById = {
      villageidiot: {
        helper: "Выберите игрока и отметьте, какую сторону он показал.",
        choiceLabel: "мировоззрение",
        choices: [
          { label: "Добрый", value: "good" },
          { label: "Злой", value: "evil" },
        ],
      },
      barista: {
        helper: "Выберите игрока и эффект Barista.",
        choiceLabel: "эффект",
        choices: [
          { label: "Трезв, здоров, получает правду", value: "clean_info" },
          { label: "Способность срабатывает дважды", value: "double_ability" },
        ],
      },
      beggar: {
        helper: "Выберите мёртвого игрока, отдавшего жетон, и отметьте его сторону.",
        choiceLabel: "мировоззрение",
        choices: [
          { label: "Добрый", value: "good" },
          { label: "Злой", value: "evil" },
        ],
      },
      cultleader: {
        helper: "Выберите соседа, чьё мировоззрение вы получили.",
        choiceLabel: "мировоззрение",
        choices: [
          { label: "Добрый", value: "good" },
          { label: "Злой", value: "evil" },
        ],
      },
    } as const;
    const config = configById[normalizedRoleId as keyof typeof configById];

    return {
      kind: "single_player_and_choice",
      helper: config.helper,
      choiceLabel: config.choiceLabel,
      choices: [...config.choices],
      summary: (name, choiceLabel) => `${prettifyRoleName(roleId)}: ${name} — ${choiceLabel.toLowerCase()}`,
    };
  }

  if (["philosopher", "courtier", "alchemist", "pixie", "apprentice", "plaguedoctor", "ojo"].includes(normalizedRoleId)) {
    const roleTypesById: Partial<Record<string, RoleType[]>> = {
      philosopher: ["townsfolk", "outsider"],
      courtier: ["townsfolk", "outsider", "minion", "demon", "traveller"],
      alchemist: ["minion"],
      pixie: ["townsfolk"],
      apprentice: ["townsfolk", "minion"],
      plaguedoctor: ["minion"],
    };

    return {
      kind: "role_only",
      helper: "Выберите роль, с которой связана способность.",
      roleLabel: "роль",
      roleTypes: roleTypesById[normalizedRoleId],
      summary: (roleName) => `${prettifyRoleName(roleId)} выбрал роль: ${roleName}`,
    };
  }

  if (["engineer", "snitch"].includes(normalizedRoleId)) {
    return {
      kind: "roles_multi",
      helper:
        normalizedRoleId === "engineer"
          ? "Выберите роли, которые Engineer решил оставить/создать в игре."
          : "Выберите блефы, которые получили Миньоны.",
      roleLabel: normalizedRoleId === "engineer" ? "выбранные роли" : "блефы",
      max: normalizedRoleId === "snitch" ? 3 : 3,
      roleTypes: normalizedRoleId === "engineer" ? ["minion", "demon"] : undefined,
      summary: (roleNames) =>
        normalizedRoleId === "engineer"
          ? `Engineer выбрал роли: ${roleNames.join(", ")}`
          : `Snitch: блефы — ${roleNames.join(", ")}`,
    };
  }

  if (["godfather"].includes(normalizedRoleId)) {
    return {
      kind: "roles_multi",
      helper: "Выберите Outsider-ов, которых узнал Godfather.",
      roleLabel: "аутсайдеры в игре",
      roleTypes: ["outsider"],
      max: 4,
      summary: (roleNames) => `Godfather узнал Outsider-ов: ${roleNames.join(", ")}`,
    };
  }

  if (
    [
      "grandmother",
      "gambler",
      "huntsman",
      "king",
      "cerenovus",
      "pithag",
      "pit-hag",
      "summoner",
      "harlot",
    ].includes(normalizedRoleId)
  ) {
    const roleTypesById: Partial<Record<string, RoleType[]>> = {
      grandmother: ["townsfolk", "outsider"],
      gambler: ["townsfolk", "outsider", "minion", "demon", "traveller"],
      huntsman: ["townsfolk"],
      king: ["townsfolk", "outsider", "minion", "demon"],
      cerenovus: ["townsfolk", "outsider"],
      pithag: ["townsfolk", "outsider", "minion", "demon", "traveller"],
      "pit-hag": ["townsfolk", "outsider", "minion", "demon", "traveller"],
      summoner: ["demon"],
    };

    return {
      kind: "single_player_and_role",
      helper: "Выберите игрока и роль, связанную со способностью.",
      roleLabel: "роль",
      roleTypes: roleTypesById[normalizedRoleId],
      summary: (name, roleName) => `${prettifyRoleName(roleId)}: ${name} — ${roleName}`,
    };
  }

  if (["fortune_teller", "fortuneteller", "innkeeper", "harpy", "barber", "shabaloth", "alhadikhia"].includes(normalizedRoleId)) {
    const configById = {
      fortuneteller: {
        kind: "two_players_choice" as const,
      },
      innkeeper: {
        kind: "players_exact" as const,
        count: 2,
      },
      harpy: {
        kind: "players_exact" as const,
        count: 2,
      },
      barber: {
        kind: "players_exact" as const,
        count: 2,
      },
      shabaloth: {
        kind: "players_exact" as const,
        count: 2,
      },
      alhadikhia: {
        kind: "players_exact" as const,
        count: 3,
      },
    } as const;

    if (normalizedRoleId === "fortuneteller" || normalizedRoleId === "fortune_teller") {
      return {
        kind: "two_players_choice",
        helper: "Выберите 2 игроков и отметьте, есть ли среди них Демон.",
        choiceLabel: "результат",
        choices: [
          { label: "Да", value: "yes" },
          { label: "Нет", value: "no" },
        ],
        summary: (names, choiceLabel) => `${prettifyRoleName(roleId)}: ${names.join(" и ")} — ${choiceLabel.toLowerCase()}`,
      };
    }

    const config = configById[normalizedRoleId as keyof typeof configById];

    if (config.kind !== "players_exact") {
      return {
        kind: "generic",
        helper: "Выберите игроков, которых затронула способность.",
      };
    }

    return {
      kind: "players_exact",
      count: config.count,
      helper: "Выберите игроков, которых затронула способность.",
      summary: (names) => `${prettifyRoleName(roleId)} выбрал: ${names.join(", ")}`,
    };
  }

  if (["juggler", "gardener", "kazali"].includes(normalizedRoleId)) {
    const configById = {
      juggler: {
        helper: "Выберите до 5 связок игрок-роль, которые Juggler объявил в первый день.",
        maxPairs: 5,
        roleLabel: "предположенная роль",
        roleTypes: undefined,
        summary: (pairs: Array<{ playerName: string; roleName: string }>) =>
          `Juggler предположил: ${pairs.map((pair) => `${pair.playerName} — ${pair.roleName}`).join("; ")}`,
      },
      gardener: {
        helper: "Выберите связки игрок-роль, которые были назначены Gardener.",
        maxPairs: 8,
        roleLabel: "назначенная роль",
        roleTypes: undefined,
        summary: (pairs: Array<{ playerName: string; roleName: string }>) =>
          `Gardener назначил: ${pairs.map((pair) => `${pair.playerName} — ${pair.roleName}`).join("; ")}`,
      },
      kazali: {
        helper: "Выберите связки игрок-роль для Миньонов, которых Kazali распределил в начале игры.",
        maxPairs: 4,
        roleLabel: "роль Миньона",
        roleTypes: ["minion"] as RoleType[],
        summary: (pairs: Array<{ playerName: string; roleName: string }>) =>
          `Kazali назначил: ${pairs.map((pair) => `${pair.playerName} — ${pair.roleName}`).join("; ")}`,
      },
    } as const;
    const config = configById[normalizedRoleId as keyof typeof configById];

    return {
      kind: "player_role_pairs",
      helper: config.helper,
      maxPairs: config.maxPairs,
      roleLabel: config.roleLabel,
      roleTypes: config.roleTypes,
      summary: config.summary,
    };
  }

  if (["po", "lunatic", "matron"].includes(normalizedRoleId)) {
    const configById = {
      po: {
        max: 3,
        helper: "Выберите до 3 игроков, которых Po отметил этой ночью.",
        summary: (names: string[]) => `Po выбрал: ${names.join(", ")}`,
      },
      lunatic: {
        max: 3,
        helper: "Выберите игроков, которых Lunatic думал атаковать этой ночью.",
        summary: (names: string[]) => `Lunatic выбрал: ${names.join(", ")}`,
      },
      matron: {
        max: 6,
        helper: "Выберите до 6 игроков, участвовавших в пересадке Matron. Порядок или пары можно уточнить в доп. тексте.",
        summary: (names: string[]) => `Matron пересадила: ${names.join(", ")}`,
      },
    } as const;
    const config = configById[normalizedRoleId as keyof typeof configById];

    return {
      kind: "players_up_to",
      max: config.max,
      helper: config.helper,
      summary: config.summary,
    };
  }

  if (normalizedRoleId === "sailor") {
    return {
      kind: "single_player_and_choice",
      helper: "Выберите игрока, которого выбрал Sailor, и отметьте, кто из вас был пьян до заката.",
      choiceLabel: "кто был пьян",
      choices: [
        { label: "Пьян Sailor", value: "sailor_drunk" },
        { label: "Пьян выбранный игрок", value: "target_drunk" },
      ],
      summary: (name, choiceLabel) => `Sailor выбрал ${name}: ${choiceLabel}`,
    };
  }

  if (normalizedRoleId === "tealady") {
    return {
      kind: "players_exact",
      count: 2,
      helper: "Выберите двух живых соседей Tea Lady, которые поддерживали её защиту.",
      summary: (names) => `Tea Lady опиралась на соседей: ${names.join(", ")}`,
    };
  }

  if (normalizedRoleId === "stormcatcher") {
    return {
      kind: "single_player_and_role",
      helper: "Выберите игрока и добрую роль, которую назвал Storm Catcher.",
      roleLabel: "выбранная добрая роль",
      roleTypes: ["townsfolk", "outsider", "traveller"],
      summary: (name, roleName) => `Storm Catcher: ${roleName} — ${name}`,
    };
  }

  if (normalizedRoleId === "recluse") {
    return {
      kind: "role_only",
      helper: "Выберите роль, как Recluse мог зарегистрироваться для чужой способности.",
      roleLabel: "ложная регистрация",
      roleTypes: ["minion", "demon"],
      summary: (roleName) => `Recluse мог зарегистрироваться как ${roleName}`,
    };
  }

  if (normalizedRoleId === "baron") {
    return {
      kind: "roles_multi",
      helper: "Выберите Outsider-ов, которые оказались в игре из-за Baron.",
      roleLabel: "outsider-ы в игре",
      roleTypes: ["outsider"],
      max: 4,
      summary: (roleNames) => `Baron добавил Outsider-ов: ${roleNames.join(", ")}`,
    };
  }

  if (normalizedRoleId === "yaggababble") {
    return {
      kind: "count",
      helper: "Укажите, сколько раз секретная фраза Yaggababble прозвучала публично. Саму фразу можно уточнить в доп. тексте.",
      label: "сколько раз была сказана фраза",
      min: 0,
      max: 20,
      summary: (count) => `Yaggababble: фраза прозвучала ${count} раз`,
    };
  }

  const singlePlayerHelperById: Partial<Record<string, string>> = {
    acrobat: "Выберите игрока, которого проверял Acrobat.",
    angel: "Выберите игрока, на которого сработал Angel в этой ситуации.",
    boomdandy: "Выберите игрока, который погиб из-за финального выбора Boomdandy.",
    butcher: "Выберите игрока, которого Butcher дополнительно номинировал.",
    choirboy: "Выберите игрока, которого Choirboy узнал как Демона.",
    damsel: "Выберите Миньона, который публично назвал Damsel, если это произошло.",
    devilsadvocate: "Выберите игрока, которого Devil's Advocate защитил от казни.",
    eviltwin: "Выберите противоположного Twin.",
    fanggu: "Выберите игрока, которого Fang Gu атаковал этой ночью.",
    farmer: "Выберите игрока, который стал Farmer после ночной смерти.",
    fibbin: "Выберите доброго игрока, который мог получить ложную информацию.",
    imp: "Выберите игрока, которого атаковал Imp.",
    legion: "Выберите игрока, который погиб или был помечен эффектом Legion этой ночью.",
    lleech: "Выберите хозяина Lleech.",
    lilmonsta: "Выберите игрока, который нянчил Lil' Monsta этой ночью.",
    marionette: "Выберите игрока, который оказался Marionette.",
    mayor: "Выберите игрока, который умер вместо Mayor, если это произошло.",
    mezepheles: "Выберите игрока, который стал злым из-за Mezepheles.",
    minstrel: "Выберите Миньона, чья казнь активировала Minstrel.",
    nodashii: "Выберите игрока, которого атаковал No Dashii.",
    pacifist: "Выберите доброго игрока, которого Pacifist спас от казни.",
    pukka: "Выберите игрока, которого Pukka отравил этой ночью.",
    puzzlemaster: "Выберите игрока, которого Puzzlemaster подозревает как пьяного.",
    scapegoat: "Выберите игрока, вместо которого мог быть казнён Scapegoat.",
    thief: "Выберите игрока, чей голос сделал отрицательным Thief.",
    vigormortis: "Выберите игрока, которого атаковал Vigor Mortis.",
    virgin: "Выберите номинатора, которого мог казнить эффект Virgin.",
    vizier: "Выберите игрока, которого Vizier немедленно казнил днём.",
    vortox: "Выберите игрока, которого атаковал Vortox.",
    zombuul: "Выберите игрока, которого атаковал Zombuul.",
  };

  if (singlePlayerHelperById[normalizedRoleId]) {
    return {
      kind: "single_player",
      helper: singlePlayerHelperById[normalizedRoleId],
      summary: (name) => `${prettifyRoleName(roleId)} выбрал игрока: ${name}`,
    };
  }

  const choiceOnlyConfigById: Partial<
    Record<
      string,
      {
        helper: string;
        choiceLabel: string;
        choices: Array<{ label: string; value: string }>;
      }
    >
  > = {
    banshee: {
      helper: "Отметьте, была ли Banshee раскрыта убийством Демона.",
      choiceLabel: "состояние",
      choices: [
        { label: "Раскрыта", value: "revealed" },
        { label: "Не раскрыта", value: "hidden" },
      ],
    },
    deviant: {
      helper: "Отметьте, выполнил ли Deviant своё условие на день.",
      choiceLabel: "состояние",
      choices: [
        { label: "Был смешным", value: "funny" },
        { label: "Не был смешным", value: "not_funny" },
      ],
    },
    fool: {
      helper: "Отметьте, была ли уже потрачена первая защита Fool.",
      choiceLabel: "состояние",
      choices: [
        { label: "Первая смерть отменена", value: "saved_once" },
        { label: "Защита ещё не тратилась", value: "unused" },
      ],
    },
    goblin: {
      helper: "Отметьте, заявил ли Goblin о себе публично при казни.",
      choiceLabel: "состояние",
      choices: [
        { label: "Заявил публично", value: "claimed" },
        { label: "Не заявлял", value: "silent" },
      ],
    },
    gossip: {
      helper: "Отметьте результат Gossip, а саму фразу при необходимости запишите в доп. тексте.",
      choiceLabel: "результат",
      choices: [
        { label: "Высказывание было правдой", value: "true" },
        { label: "Высказывание было ложью", value: "false" },
        { label: "Пока не проверялось", value: "unknown" },
      ],
    },
    mastermind: {
      helper: "Отметьте, сработал ли дополнительный день Mastermind.",
      choiceLabel: "состояние",
      choices: [
        { label: "Доп. день активирован", value: "active" },
        { label: "Не активирован", value: "inactive" },
      ],
    },
    mutant: {
      helper: "Отметьте, был ли Mutant наказан за mad про Outsider.",
      choiceLabel: "результат",
      choices: [
        { label: "Казнён за mad", value: "executed" },
        { label: "Без наказания", value: "safe" },
      ],
    },
    politician: {
      helper: "Отметьте, сменил ли Politician сторону ради своей победы.",
      choiceLabel: "состояние",
      choices: [
        { label: "Сменил сторону", value: "swapped" },
        { label: "Не сменил сторону", value: "stayed" },
      ],
    },
    riot: {
      helper: "Отметьте, начался ли уже режим Riot.",
      choiceLabel: "состояние",
      choices: [
        { label: "Режим Riot начался", value: "started" },
        { label: "Ещё нет", value: "not_started" },
      ],
    },
    saint: {
      helper: "Отметьте, был ли Saint казнён.",
      choiceLabel: "состояние",
      choices: [
        { label: "Казнён", value: "executed" },
        { label: "Не казнён", value: "not_executed" },
      ],
    },
    scarletwoman: {
      helper: "Отметьте, превратилась ли Scarlet Woman в Демона.",
      choiceLabel: "состояние",
      choices: [
        { label: "Стала Демоном", value: "became_demon" },
        { label: "Не превращалась", value: "stayed_minion" },
      ],
    },
    sentinel: {
      helper: "Отметьте, как Sentinel изменил число Outsider-ов.",
      choiceLabel: "эффект",
      choices: [
        { label: "На 1 Outsider больше", value: "plus_one" },
        { label: "На 1 Outsider меньше", value: "minus_one" },
        { label: "Без изменения", value: "no_change" },
      ],
    },
    soldier: {
      helper: "Отметьте, пережил ли Soldier атаку Демона.",
      choiceLabel: "состояние",
      choices: [
        { label: "Был атакован и выжил", value: "survived_attack" },
        { label: "Атаки не было", value: "no_attack" },
      ],
    },
    spiritofivory: {
      helper: "Отметьте, пришлось ли Spirit of Ivory ограничивать появление лишнего зла.",
      choiceLabel: "состояние",
      choices: [
        { label: "Ограничение сработало", value: "applied" },
        { label: "Не понадобилось", value: "unused" },
      ],
    },
    tinker: {
      helper: "Отметьте, умер ли Tinker случайно.",
      choiceLabel: "состояние",
      choices: [
        { label: "Случайно умер", value: "died" },
        { label: "Пока жив", value: "alive" },
      ],
    },
    toymaker: {
      helper: "Отметьте, выполнил ли Демон обязательный пропуск атаки для Toymaker.",
      choiceLabel: "состояние",
      choices: [
        { label: "Обязательный пропуск уже был", value: "skip_done" },
        { label: "Ещё не было пропуска", value: "skip_pending" },
      ],
    },
    zealot: {
      helper: "Отметьте, соблюдал ли Zealot обязанность голосовать за каждую номинацию.",
      choiceLabel: "состояние",
      choices: [
        { label: "Голосовал за все номинации", value: "obeyed" },
        { label: "Нарушил обязанность", value: "broke_rule" },
      ],
    },
  };

  if (choiceOnlyConfigById[normalizedRoleId]) {
    const config = choiceOnlyConfigById[normalizedRoleId];

    return {
      kind: "choice_only",
      helper: config.helper,
      choiceLabel: config.choiceLabel,
      choices: config.choices,
      summary: (choiceLabel) => `${prettifyRoleName(roleId)}: ${choiceLabel}`,
    };
  }

  const genericHelperById: Partial<Record<string, string>> = {
    amnesiac: "Выберите связанных игроков и в доп. тексте зафиксируйте догадку Amnesiac и реакцию рассказчика.",
    artist: "Выберите связанных игроков и в доп. тексте запишите вопрос Artist и полученный ответ.",
    bigwig: "Выберите связанных игроков и в доп. тексте зафиксируйте эффект Big Wig.",
    bishop: "Выберите связанных игроков и при необходимости в доп. тексте уточните, кого Storyteller номинировал.",
    bootlegger: "Выберите связанных игроков и в доп. тексте опишите домашнее правило или кастомную правку.",
    buddhist: "Выберите связанных игроков и в доп. тексте при необходимости уточните ограничение разговора от Buddhist.",
    djinn: "Выберите связанных игроков и в доп. тексте запишите специальное правило Djinn.",
    fisherman: "Выберите связанных игроков и в доп. тексте запишите совет рассказчика.",
    godofug: "Выберите связанных игроков и в доп. тексте зафиксируйте эффект God of Ug.",
    heretic: "Выберите связанных игроков и в доп. тексте зафиксируйте, как Heretic влияет на расчёт победы.",
    hindu: "Выберите связанных игроков и в доп. тексте опишите эффект Hindu.",
    knaves: "Выберите связанных игроков и в доп. тексте опишите эффект Knaves.",
    lordoftyphon: "Выберите связанных игроков и в доп. тексте зафиксируйте линию злых персонажей Lord of Typhon.",
    magician: "Выберите связанных игроков и в доп. тексте отметьте, как Magician изменил стартовую информацию зла.",
    pope: "Выберите связанных игроков и в доп. тексте опишите эффект Pope.",
    savant: "Выберите связанных игроков и в доп. тексте запишите две информации Savant.",
    spy: "Выберите важных игроков и в доп. тексте зафиксируйте ключевые детали увиденного Spy Гримуара.",
    tor: "Выберите связанных игроков и в доп. тексте опишите эффект Tor.",
    ventriloquist: "Выберите связанных игроков и в доп. тексте опишите эффект Ventriloquist.",
    voudon: "Выберите связанных игроков и в доп. тексте зафиксируйте особенности голосования Voudon.",
    wizard: "Выберите связанных игроков и в доп. тексте опишите желание Wizard и его цену или подсказку.",
    zenomancer: "Выберите связанных игроков и в доп. тексте опишите эффект Zenomancer.",
  };

  if (genericHelperById[normalizedRoleId]) {
    return {
      kind: "generic",
      helper: genericHelperById[normalizedRoleId],
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
  availableRoleIds,
  selectedRoleIdOverride,
  onRoleSelect,
  fixedLinkedPlayerIds = [],
  showSourcePlayerPicker = true,
  hideHistory = false,
  hideHeader = false,
  emptyHistoryText = "В этой фазе пока нет ролевых записей.",
  embedded = false,
}: RoleIntelPanelProps) {
  const [selectedRoleId, setSelectedRoleId] = useState(selectedRoleIdOverride ?? "");
  const [selectedSourcePlayerId, setSelectedSourcePlayerId] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedRoleOptionId, setSelectedRoleOptionId] = useState("");
  const [selectedRoleOptionIds, setSelectedRoleOptionIds] = useState<string[]>([]);
  const [selectedPlayerRolePairs, setSelectedPlayerRolePairs] = useState<Array<{ playerId: string; roleId: string }>>([]);
  const [activePairIndex, setActivePairIndex] = useState(0);
  const [activeTwoRoleSlot, setActiveTwoRoleSlot] = useState<"first" | "second">("first");
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
  const availableRoleIdSet = useMemo(
    () =>
      availableRoleIds && availableRoleIds.length > 0
        ? new Set(availableRoleIds.map((roleId) => normalizeRoleId(roleId)))
        : null,
    [availableRoleIds],
  );
  const pickerRoles = useMemo(
    () =>
      availableRoleIdSet
        ? sortedRoles.filter((role) => availableRoleIdSet.has(normalizeRoleId(role.id)))
        : sortedRoles,
    [availableRoleIdSet, sortedRoles],
  );
  const roleMentionEntries = useMemo(() => {
    const mentions = new Map<string, string>();

    sortedRoles.forEach((role) => {
      [role.name, getRoleLabel(role.id, sortedRoles)].forEach((label) => {
        const trimmed = label.trim();

        if (trimmed) {
          mentions.set(trimmed, role.id);
        }
      });
    });

    return Array.from(mentions.entries()).sort((a, b) => b[0].length - a[0].length);
  }, [sortedRoles]);
  const roleMentionMap = useMemo(() => new Map(roleMentionEntries), [roleMentionEntries]);
  const roleMentionRegex = useMemo(
    () =>
      roleMentionEntries.length > 0
        ? new RegExp(`(${roleMentionEntries.map(([label]) => escapeRegExp(label)).join("|")})`, "g")
        : null,
    [roleMentionEntries],
  );
  const roleGroups = useMemo(
    () =>
      groupRolesByType(pickerRoles).map((group) => ({
        key: group.type,
        label: group.label,
        roleIds: group.roles.map((role) => role.id),
      })),
    [pickerRoles],
  );
  const roleGroupsByKey = useMemo(
    () => new Map(roleGroups.map((group) => [group.key, group])),
    [roleGroups],
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
  useEffect(() => {
    if (selectedRoleIdOverride !== undefined) {
      setSelectedRoleId(selectedRoleIdOverride);
    }
  }, [selectedRoleIdOverride]);
  useEffect(() => {
    if (!showSourcePlayerPicker) {
      setSelectedSourcePlayerId("");
    }
  }, [showSourcePlayerPicker]);
  useEffect(() => {
    setSelectedPlayerIds([]);
    setSelectedRoleOptionId("");
    setSelectedRoleOptionIds([]);
    setSelectedPlayerRolePairs([]);
    setActivePairIndex(0);
    setActiveTwoRoleSlot("first");
    setSelectedSecondaryRoleOptionId("");
    setSelectedCountValue("");
    setSelectedChoiceValue("");
    setExtraText("");
    setError("");
  }, [selectedRoleId]);

  const handleSelectRole = (roleId: string) => {
    setSelectedRoleId(roleId);
    onRoleSelect?.(roleId);
  };

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
    setSelectedSourcePlayerId("");
    setSelectedPlayerIds([]);
    setSelectedRoleOptionId("");
    setSelectedRoleOptionIds([]);
    setSelectedPlayerRolePairs([]);
    setActivePairIndex(0);
    setActiveTwoRoleSlot("first");
    setSelectedSecondaryRoleOptionId("");
    setSelectedCountValue("");
    setSelectedChoiceValue("");
    setExtraText("");
  };

  const setPlayerRolePairValue = (
    index: number,
    nextValue: Partial<{ playerId: string; roleId: string }>,
  ) => {
    setSelectedPlayerRolePairs((current) => {
      const next = [...current];
      const existing = next[index] ?? { playerId: "", roleId: "" };
      next[index] = { ...existing, ...nextValue };

      while (next.length > 0) {
        const last = next[next.length - 1];

        if (last && (last.playerId || last.roleId)) {
          break;
        }

        next.pop();
      }

      return next;
    });
  };

  const compactPlayerChipClass = (selected: boolean) =>
    clsx(
      "min-h-8 rounded-xl border px-3 py-1.5 text-sm leading-5 transition",
      selected
        ? "role-player-selected border-transparent text-stone-50"
        : "border-ember-200/10 bg-black/20 text-stone-200 hover:border-ember-200/25 hover:bg-ember-200/8",
    );

  const renderCompactRolePicker = ({
    rolesForPicker,
    selectedId,
    selectedIds,
    onSelect,
  }: {
    rolesForPicker: ScriptRole[];
    selectedId: string;
    selectedIds?: string[];
    onSelect: (roleId: string) => void;
  }) => {
    const compactPicker = splitRoleGroupsForCompactPicker(rolesForPicker);

    return (
      <div className="space-y-0.5">
        <div className="grid grid-cols-2 gap-1">
          {compactPicker.townsfolkGroup ? (
            <RoleIconGrid
              groups={[compactPicker.townsfolkGroup]}
              roles={rolesForPicker}
              selectedRoleId={selectedId}
              selectedRoleIds={selectedIds}
              onSelect={onSelect}
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

          {compactPicker.outsiderGroup ? (
            <RoleIconGrid
              groups={[compactPicker.outsiderGroup]}
              roles={rolesForPicker}
              selectedRoleId={selectedId}
              selectedRoleIds={selectedIds}
              onSelect={onSelect}
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

        {compactPicker.minionGroup || compactPicker.demonGroup ? (
          <div className="grid grid-cols-2 gap-1">
            {compactPicker.minionGroup ? (
              <RoleIconGrid
                groups={[compactPicker.minionGroup]}
                roles={rolesForPicker}
                selectedRoleId={selectedId}
                selectedRoleIds={selectedIds}
                onSelect={onSelect}
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

            {compactPicker.demonGroup ? (
              <RoleIconGrid
                groups={[compactPicker.demonGroup]}
                roles={rolesForPicker}
                selectedRoleId={selectedId}
                selectedRoleIds={selectedIds}
                onSelect={onSelect}
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

        {compactPicker.bottomMergedGroup ? (
          <RoleIconGrid
            groups={[compactPicker.bottomMergedGroup]}
            roles={rolesForPicker}
            selectedRoleId={selectedId}
            selectedRoleIds={selectedIds}
            onSelect={onSelect}
            groupClassName="rounded-2xl border border-ember-200/10 p-0.5 sm:p-1"
            wrap
            buttonClassName="relative min-h-[3.9rem] shrink-0 overflow-visible rounded-xl py-1 sm:!min-h-[4.2rem] sm:py-1"
            iconClassName="h-12 w-12 sm:h-[3.75rem] sm:w-[3.75rem]"
            roleLabelClassName="mt-[-0.42rem] max-w-[3.25rem] rounded bg-[rgba(255,248,237,0.94)] px-1 text-[8px] leading-[0.72rem] text-stone-700 sm:mt-[-0.5rem] sm:max-w-[3.75rem] sm:text-[9px] sm:leading-3"
            compact
            unframed
            showGroupLabel={false}
          />
        ) : null}
      </div>
    );
  };

  const buildRoleText = () => {
    if (!selectedRoleId || !selectedRoleConfig) {
      return { text: "", linkedPlayerIds: [] as string[] };
    }

    const selectedNames = selectedPlayerIds
      .map((playerId) => playersById.get(playerId)?.name ?? "Неизвестно");
    const selectedPairs = selectedPlayerRolePairs.map((pair) => ({
      playerId: pair.playerId,
      roleId: pair.roleId,
      playerName: playersById.get(pair.playerId)?.name ?? "Неизвестно",
      roleName:
        sortedRoles.find((role) => role.id === pair.roleId)?.name ??
        prettifyRoleName(pair.roleId),
    }));
    const completeSelectedPairs = selectedPairs.filter((pair) => pair.playerId && pair.roleId);
    const partialSelectedPairTexts = selectedPairs
      .filter((pair) => pair.playerId || pair.roleId)
      .map((pair, index) => {
        const left = pair.playerId ? pair.playerName : `Игрок ${index + 1}`;
        const right = pair.roleId ? pair.roleName : "роль не выбрана";
        return `${index + 1}. ${left} — ${right}`;
      });

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
      case "players_up_to": {
        if (selectedPlayerIds.length === 0) {
          return extraTextOnlyResult(extraText, players);
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
        if (normalizeRoleId(selectedRoleId) === "cannibal" && selectedChoiceValue === "cannibal_did_not_wake") {
          return {
            text: withExtraText("Cannibal не просыпался.", extraText),
            linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, []),
          };
        }

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
      case "players_any_choice": {
        const selectedChoice = selectedRoleConfig.choices.find((choice) => choice.value === selectedChoiceValue);

        if (!selectedChoice) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedChoiceLabel: undefined,
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
      case "role_only": {
        const selectedRoleName =
          sortedRoles.find((role) => role.id === selectedRoleOptionId)?.name ?? prettifyRoleName(selectedRoleOptionId);

        if (!selectedRoleOptionId) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedRoleName: selectedRoleOptionId ? selectedRoleName : undefined,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, []),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(selectedRoleName), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, []),
        };
      }
      case "roles_multi": {
        const selectedRoleNames = selectedRoleOptionIds
          .map((roleId) => sortedRoles.find((role) => role.id === roleId)?.name ?? prettifyRoleName(roleId));

        if (
          selectedRoleOptionIds.length === 0 ||
          (selectedRoleConfig.min && selectedRoleOptionIds.length < selectedRoleConfig.min)
        ) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedRoleName: selectedRoleNames.join(", "),
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, []),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(selectedRoleNames), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, []),
        };
      }
      case "player_role_pairs": {
        if (completeSelectedPairs.length === 0) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedPairTexts: partialSelectedPairTexts,
          });
          const linkedPlayerIds = selectedPairs
            .map((pair) => pair.playerId)
            .filter(Boolean);

          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, linkedPlayerIds),
              }
            : extraTextOnlyResult(extraText, players);
        }

        const linkedPlayerIds = completeSelectedPairs.map((pair) => pair.playerId);

        return {
          text: withExtraText(selectedRoleConfig.summary(completeSelectedPairs), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, linkedPlayerIds),
        };
      }
      case "players_exact_and_count": {
        const parsedCount = Number(selectedCountValue);

        if (
          selectedPlayerIds.length !== selectedRoleConfig.count ||
          selectedCountValue === "" ||
          Number.isNaN(parsedCount)
        ) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedCountValue,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(selectedNames, parsedCount), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
        };
      }
      case "choice_only": {
        const selectedChoice = selectedRoleConfig.choices.find((choice) => choice.value === selectedChoiceValue);

        if (!selectedChoice) {
          const partialText = buildPartialRoleIntelText({
            roleConfig: selectedRoleConfig,
            selectedNames,
            selectedChoiceLabel: undefined,
          });
          return partialText
            ? {
                text: withExtraText(partialText, extraText),
                linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, []),
              }
            : extraTextOnlyResult(extraText, players);
        }

        return {
          text: withExtraText(selectedRoleConfig.summary(selectedChoice.label), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, []),
        };
      }
      case "single_player_and_choice": {
        const selectedChoice = selectedRoleConfig.choices.find((choice) => choice.value === selectedChoiceValue);

        if (selectedPlayerIds.length !== 1 || !selectedChoice) {
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
          text: withExtraText(selectedRoleConfig.summary(selectedNames[0], selectedChoice.label), extraText),
          linkedPlayerIds: mergeManualAndMentionLinks(extraText, players, selectedPlayerIds),
        };
      }
    }
  };

  const handleAdd = async () => {
    const { text, linkedPlayerIds } = buildRoleText();
    const fallbackRoleName =
      sortedRoles.find((role) => normalizeRoleId(role.id) === normalizeRoleId(selectedRoleId))?.name ??
      prettifyRoleName(selectedRoleId);
    const sourcePlayerName = selectedSourcePlayerId
      ? playersById.get(selectedSourcePlayerId)?.name ?? "Неизвестно"
      : "";
    const sourcePrefixedText = sourcePlayerName
      ? text
        ? `Информацию передал: ${sourcePlayerName}\n${text}`
        : `Информацию передал: ${sourcePlayerName}`
      : text;
    const finalLinkedPlayerIds = Array.from(
      new Set([
        ...linkedPlayerIds,
        ...fixedLinkedPlayerIds,
        ...(selectedSourcePlayerId ? [selectedSourcePlayerId] : []),
      ]),
    );
    const noteText = sourcePrefixedText || `${fallbackRoleName}: заметка без деталей`;

    if (!selectedRoleId) {
      setError("Сначала выберите роль.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onAddNote(selectedRoleId, noteText, finalLinkedPlayerIds);
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

  const renderRoleNoteText = (text: string) => {
    if (!roleMentionRegex) {
      return <p className="whitespace-pre-wrap text-sm leading-6 text-stone-100">{text}</p>;
    }

    const lines = text.split("\n");

    return (
      <p className="whitespace-pre-wrap text-sm leading-6 text-stone-100">
        {lines.map((line, lineIndex) => (
          <Fragment key={`${lineIndex}-${line}`}>
            {line.split(roleMentionRegex).map((part, partIndex) => {
              const roleId = roleMentionMap.get(part);

              if (!roleId) {
                return <Fragment key={`${lineIndex}-${partIndex}`}>{part}</Fragment>;
              }

              const roleLabel = getRoleLabel(roleId, sortedRoles);

              return (
                <span
                  key={`${lineIndex}-${partIndex}-${normalizeRoleId(roleId)}`}
                  className="mx-0.5 inline-flex h-8 w-8 align-middle"
                  title={roleLabel}
                >
                  <RoleTokenImage
                    roleId={roleId}
                    roles={sortedRoles}
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

  if (!phase) {
    return <section className="panel p-5 text-center text-stone-300">Фаза пока не выбрана.</section>;
  }

  return (
    <section className={embedded ? "min-w-0" : "panel min-w-0 p-3 sm:p-5"}>
      {!hideHeader ? (
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-stone-50">{phase.title}</h2>
          <p className="text-sm text-stone-400">Записи по конкретным ролям</p>
        </div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-ember-200/10 bg-black/15 p-2.5 sm:p-3">
        {!hideHeader || pickerRoles.length > 1 ? (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-ember-100/75">
              {selectedRoleId
                ? `Выбрана роль: ${sortedRoles.find((role) => role.id === selectedRoleId)?.name ?? prettifyRoleName(selectedRoleId)}`
                : "Выберите роль"}
            </p>
            {renderCompactRolePicker({
              rolesForPicker: pickerRoles,
              selectedId: selectedRoleId,
              onSelect: handleSelectRole,
            })}
          </div>
        ) : null}

        {selectedRoleConfig ? (
          <div className="space-y-3">
            {showSourcePlayerPicker ? (
              <label className="block">
                <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                  Кто передал информацию
                </span>
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() =>
                        setSelectedSourcePlayerId((current) => (current === player.id ? "" : player.id))
                      }
                      className={compactPlayerChipClass(selectedSourcePlayerId === player.id)}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              </label>
            ) : null}

            {selectedRoleConfig.kind === "generic" ||
            selectedRoleConfig.kind === "players_exact" ||
            selectedRoleConfig.kind === "players_up_to" ? (
              <div className="flex flex-wrap gap-2">
                {players.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() =>
                      togglePlayer(
                        player.id,
                        selectedRoleConfig.kind === "players_exact"
                          ? selectedRoleConfig.count
                          : selectedRoleConfig.kind === "players_up_to"
                            ? selectedRoleConfig.max
                            : undefined,
                      )
                    }
                    className={compactPlayerChipClass(selectedPlayerIds.includes(player.id))}
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
                      className={compactPlayerChipClass(selectedPlayerIds.includes(player.id))}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                    {selectedRoleConfig.roleLabel}
                  </span>
                  <div className="space-y-2">
                    {renderCompactRolePicker({
                      rolesForPicker: filteredRoleOptions,
                      selectedId: selectedRoleOptionId,
                      onSelect: setSelectedRoleOptionId,
                    })}
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
                    className={compactPlayerChipClass(selectedPlayerIds[0] === player.id)}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            ) : null}

            {selectedRoleConfig.kind === "single_player_and_role" ? (
              <div className="space-y-3">
                {normalizeRoleId(selectedRoleId) === "cannibal" ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedChoiceValue((current) =>
                          current === "cannibal_did_not_wake" ? "" : "cannibal_did_not_wake",
                        )
                      }
                      className={compactPlayerChipClass(selectedChoiceValue === "cannibal_did_not_wake")}
                    >
                      Cannibal не просыпался
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerIds((current) => (current[0] === player.id ? [] : [player.id]))}
                    className={compactPlayerChipClass(selectedPlayerIds[0] === player.id)}
                  >
                      {player.name}
                    </button>
                  ))}
                </div>
                  <label className="block">
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                    {selectedRoleConfig.roleLabel}
                  </span>
                  <div className="space-y-2">
                    {renderCompactRolePicker({
                      rolesForPicker: filteredRoleOptions,
                      selectedId: selectedRoleOptionId,
                      onSelect: setSelectedRoleOptionId,
                    })}
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
                    className={compactPlayerChipClass(selectedPlayerIds[0] === player.id)}
                  >
                      {player.name}
                    </button>
                  ))}
                </div>
                <div className="rounded-2xl border border-ember-200/10 bg-black/10 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setActiveTwoRoleSlot("first")}
                      className={clsx(
                        "flex min-h-[64px] w-full flex-col items-start justify-center rounded-2xl border px-3 py-2.5 text-left transition",
                        activeTwoRoleSlot === "first"
                          ? "border-amber-200/60 bg-black/30 shadow-[0_0_0_2px_rgba(242,204,116,0.12)]"
                          : "border-ember-100/35 bg-black/20",
                      )}
                    >
                      <span className="text-[9px] uppercase tracking-[0.12em] text-stone-400">
                        {selectedRoleConfig.firstRoleLabel}
                      </span>
                      <span className="mt-1 text-sm font-semibold text-stone-50">
                        {selectedRoleOptionId
                          ? firstFilteredRoleOptions.find((role) => role.id === selectedRoleOptionId)?.name ?? prettifyRoleName(selectedRoleOptionId)
                          : "Роль пока не выбрана"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTwoRoleSlot("second")}
                      className={clsx(
                        "flex min-h-[64px] w-full flex-col items-start justify-center rounded-2xl border px-3 py-2.5 text-left transition",
                        activeTwoRoleSlot === "second"
                          ? "border-amber-200/60 bg-black/30 shadow-[0_0_0_2px_rgba(242,204,116,0.12)]"
                          : "border-ember-100/35 bg-black/20",
                      )}
                    >
                      <span className="text-[9px] uppercase tracking-[0.12em] text-stone-400">
                        {selectedRoleConfig.secondRoleLabel}
                      </span>
                      <span className="mt-1 text-sm font-semibold text-stone-50">
                        {selectedSecondaryRoleOptionId
                          ? secondFilteredRoleOptions.find((role) => role.id === selectedSecondaryRoleOptionId)?.name ?? prettifyRoleName(selectedSecondaryRoleOptionId)
                          : "Роль пока не выбрана"}
                      </span>
                    </button>
                  </div>
                  <div className="mt-3">
                    {renderCompactRolePicker({
                      rolesForPicker: activeTwoRoleSlot === "first" ? firstFilteredRoleOptions : secondFilteredRoleOptions,
                      selectedId: activeTwoRoleSlot === "first" ? selectedRoleOptionId : selectedSecondaryRoleOptionId,
                      onSelect: activeTwoRoleSlot === "first" ? setSelectedRoleOptionId : setSelectedSecondaryRoleOptionId,
                    })}
                  </div>
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
                    className={compactPlayerChipClass(selectedPlayerIds.includes(player.id))}
                  >
                      {player.name}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                    {selectedRoleConfig.choiceLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedRoleConfig.choices.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => setSelectedChoiceValue((current) => (current === choice.value ? "" : choice.value))}
                        className={`rounded-xl border px-3 py-2 text-sm transition ${
                          selectedChoiceValue === choice.value
                            ? "role-player-selected border-transparent text-stone-50"
                            : "border-ember-200/10 bg-black/20 text-stone-200 hover:border-ember-200/25 hover:bg-ember-200/8"
                        }`}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            ) : null}

            {selectedRoleConfig.kind === "players_any_choice" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => togglePlayer(player.id)}
                      className={compactPlayerChipClass(selectedPlayerIds.includes(player.id))}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                    {selectedRoleConfig.choiceLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedRoleConfig.choices.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => setSelectedChoiceValue((current) => (current === choice.value ? "" : choice.value))}
                        className={compactPlayerChipClass(selectedChoiceValue === choice.value)}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            ) : null}

            {selectedRoleConfig.kind === "count" ? (
              <label className="block">
                <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
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

            {selectedRoleConfig.kind === "role_only" ? (
              <label className="block">
                <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                  {selectedRoleConfig.roleLabel}
                </span>
                <div className="space-y-2">
                  {renderCompactRolePicker({
                    rolesForPicker: filteredRoleOptions,
                    selectedId: selectedRoleOptionId,
                    onSelect: setSelectedRoleOptionId,
                  })}
                  <p className="text-sm text-stone-400">
                    {selectedRoleOptionId
                      ? filteredRoleOptions.find((role) => role.id === selectedRoleOptionId)?.name ?? prettifyRoleName(selectedRoleOptionId)
                      : "Роль пока не выбрана"}
                  </p>
                </div>
              </label>
            ) : null}

            {selectedRoleConfig.kind === "roles_multi" ? (
              <div className="space-y-3">
                <span className="block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                  {selectedRoleConfig.roleLabel}
                </span>
                {renderCompactRolePicker({
                  rolesForPicker: filteredRoleOptions,
                  selectedId: "",
                  selectedIds: selectedRoleOptionIds,
                  onSelect: (roleId) =>
                    setSelectedRoleOptionIds((current) => toggleRoleId(current, roleId, selectedRoleConfig.max)),
                })}
                <div className="flex flex-wrap gap-2">
                  {selectedRoleOptionIds.length > 0 ? (
                    selectedRoleOptionIds.map((roleId) => (
                      <button
                        key={roleId}
                        type="button"
                        onClick={() => setSelectedRoleOptionIds((current) => current.filter((id) => id !== roleId))}
                        className="role-player-selected rounded-xl border border-transparent px-3 py-2 text-sm text-stone-50"
                      >
                        {filteredRoleOptions.find((role) => role.id === roleId)?.name ?? prettifyRoleName(roleId)}
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-stone-400">Роли пока не выбраны</p>
                  )}
                </div>
              </div>
            ) : null}

            {selectedRoleConfig.kind === "player_role_pairs" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: selectedRoleConfig.maxPairs }, (_, index) => {
                    const pair = selectedPlayerRolePairs[index] ?? { playerId: "", roleId: "" };
                    const playerName = pair.playerId ? playersById.get(pair.playerId)?.name ?? "Неизвестно" : "";
                    const roleName = pair.roleId
                      ? filteredRoleOptions.find((role) => role.id === pair.roleId)?.name ?? prettifyRoleName(pair.roleId)
                      : "";
                    const isActive = activePairIndex === index;
                    const label =
                      playerName || roleName
                        ? `${playerName || "Игрок"} — ${roleName || "роль"}`
                        : `Связка ${index + 1}`;

                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setActivePairIndex(index)}
                        className={compactPlayerChipClass(isActive)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  {players.map((player) => {
                    const currentPlayerId = selectedPlayerRolePairs[activePairIndex]?.playerId ?? "";
                    const selected = currentPlayerId === player.id;

                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() =>
                          setPlayerRolePairValue(activePairIndex, {
                            playerId: selected ? "" : player.id,
                          })
                        }
                        className={compactPlayerChipClass(selected)}
                      >
                        {player.name}
                      </button>
                    );
                  })}
                </div>

                <label className="block">
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                    {selectedRoleConfig.roleLabel}
                  </span>
                  <div className="space-y-2">
                    {renderCompactRolePicker({
                      rolesForPicker: filteredRoleOptions,
                      selectedId: selectedPlayerRolePairs[activePairIndex]?.roleId ?? "",
                      onSelect: (roleId) =>
                        setPlayerRolePairValue(activePairIndex, {
                          roleId:
                            selectedPlayerRolePairs[activePairIndex]?.roleId === roleId
                              ? ""
                              : roleId,
                        }),
                    })}
                    <p className="text-sm text-stone-400">
                      {selectedPlayerRolePairs[activePairIndex]?.playerId || selectedPlayerRolePairs[activePairIndex]?.roleId
                        ? `${playersById.get(selectedPlayerRolePairs[activePairIndex]?.playerId ?? "")?.name ?? "Игрок"} — ${
                            selectedPlayerRolePairs[activePairIndex]?.roleId
                              ? filteredRoleOptions.find((role) => role.id === selectedPlayerRolePairs[activePairIndex]?.roleId)?.name ??
                                prettifyRoleName(selectedPlayerRolePairs[activePairIndex]?.roleId ?? "")
                              : "роль пока не выбрана"
                          }`
                        : `Связка ${activePairIndex + 1} пока не заполнена`}
                    </p>
                  </div>
                </label>
              </div>
            ) : null}

            {selectedRoleConfig.kind === "players_exact_and_count" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => togglePlayer(player.id, selectedRoleConfig.count)}
                      className={compactPlayerChipClass(selectedPlayerIds.includes(player.id))}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                    {selectedRoleConfig.countLabel}
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
              </div>
            ) : null}

            {selectedRoleConfig.kind === "choice_only" ? (
              <label className="block">
                <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                  {selectedRoleConfig.choiceLabel}
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedRoleConfig.choices.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      onClick={() => setSelectedChoiceValue((current) => (current === choice.value ? "" : choice.value))}
                      className={compactPlayerChipClass(selectedChoiceValue === choice.value)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </label>
            ) : null}

            {selectedRoleConfig.kind === "single_player_and_choice" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setSelectedPlayerIds((current) => (current[0] === player.id ? [] : [player.id]))}
                      className={compactPlayerChipClass(selectedPlayerIds[0] === player.id)}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-stone-400">
                    {selectedRoleConfig.choiceLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedRoleConfig.choices.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => setSelectedChoiceValue((current) => (current === choice.value ? "" : choice.value))}
                        className={compactPlayerChipClass(selectedChoiceValue === choice.value)}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
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

      {!hideHistory ? (
        <div className="mt-5 space-y-3">
          {notes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
              {emptyHistoryText}
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
                      {renderRoleNoteText(note.text)}
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
      ) : null}
    </section>
  );
}
