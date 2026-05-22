import type { RoleType, ScriptRole } from "../types";

type ScriptItem = {
  id?: unknown;
  name?: unknown;
  author?: unknown;
};

export type ParsedScript = {
  name?: string;
  author?: string;
  roles: ScriptRole[];
};

const roleTypes: Record<RoleType, string[]> = {
  townsfolk: [
    "washerwoman",
    "librarian",
    "investigator",
    "chef",
    "empath",
    "fortuneteller",
    "undertaker",
    "monk",
    "ravenkeeper",
    "virgin",
    "slayer",
    "soldier",
    "mayor",
    "clockmaker",
    "dreamer",
    "snakecharmer",
    "mathematician",
    "flowergirl",
    "towncrier",
    "oracle",
    "savant",
    "seamstress",
    "philosopher",
    "artist",
    "juggler",
    "sage",
    "grandmother",
    "sailor",
    "chambermaid",
    "exorcist",
    "innkeeper",
    "gambler",
    "gossip",
    "courtier",
    "professor",
    "minstrel",
    "tealady",
    "pacifist",
    "fool",
    "cannibal",
    "balloonist",
    "amnesiac",
    "acrobat",
    "alchemist",
    "banshee",
    "bountyhunter",
    "choirboy",
    "cultleader",
    "engineer",
    "farmer",
    "fisherman",
    "general",
    "highpriestess",
    "huntsman",
    "king",
    "knight",
    "lycanthrope",
    "magician",
    "noble",
    "pixie",
    "preacher",
    "shugenja",
    "steward",
    "villageidiot",
  ],
  outsider: [
    "drunk",
    "recluse",
    "saint",
    "butler",
    "mutant",
    "sweetheart",
    "barber",
    "klutz",
    "goon",
    "lunatic",
    "tinker",
    "moonchild",
    "puzzlemaster",
    "politician",
    "snitch",
    "damsel",
    "golem",
    "heretic",
    "plaguedoctor",
    "zealot",
  ],
  minion: [
    "poisoner",
    "spy",
    "scarletwoman",
    "baron",
    "cerenovus",
    "pit-hag",
    "pithag",
    "evil_twin",
    "eviltwin",
    "witch",
    "devilsadvocate",
    "devils_advocate",
    "godfather",
    "assassin",
    "mastermind",
    "widow",
    "marionette",
    "boomdandy",
    "fearmonger",
    "goblin",
    "harpy",
    "mezepheles",
    "organ_grinder",
    "organgrinder",
    "psychopath",
    "summoner",
    "vizier",
    "wizard",
    "xaan",
  ],
  demon: [
    "imp",
    "fanggu",
    "vigormortis",
    "nodashii",
    "vortox",
    "pukka",
    "shabaloth",
    "po",
    "zombuul",
    "lleech",
    "legion",
    "lilmonsta",
    "kazali",
    "alhadikhia",
    "lordoftyphon",
    "lord_of_typhon",
    "ojo",
    "riot",
    "yaggababble",
  ],
  traveller: [
    "apprentice",
    "barista",
    "beggar",
    "bishop",
    "bonecollector",
    "bureaucrat",
    "butcher",
    "deviant",
    "gunslinger",
    "harlot",
    "judge",
    "matron",
    "scapegoat",
    "thief",
    "voudon",
  ],
  fabled: ["sentinel", "spiritofivory", "fibbin", "duchess", "angel", "buddhist", "djinn", "toymaker"],
  loric: [
    "bigwig",
    "bootlegger",
    "gardener",
    "godofug",
    "hindu",
    "knaves",
    "pope",
    "stormcatcher",
    "tor",
    "ventriloquist",
    "zenomancer",
  ],
  unknown: [],
};

const roleNameOverrides: Record<string, string> = {
  bonecollector: "Bone Collector",
  bountyhunter: "Bounty Hunter",
  cultleader: "Cult Leader",
  highpriestess: "High Priestess",
  villageidiot: "Village Idiot",
  plaguedoctor: "Plague Doctor",
  pithag: "Pit-Hag",
  eviltwin: "Evil Twin",
  devilsadvocate: "Devil's Advocate",
  lilmonsta: "Lil' Monsta",
  alhadikhia: "Al-Hadikhia",
  spiritofivory: "Spirit of Ivory",
  bigwig: "Big Wig",
  godofug: "God of Ug",
  organgrinder: "Organ Grinder",
  lordoftyphon: "Lord of Typhon",
  yaggababble: "Yaggababble",
  stormcatcher: "Storm Catcher",
};

export const normalizeRoleId = (id: string) => id.trim().toLowerCase().replaceAll(" ", "").replaceAll("-", "");

export const prettifyRoleName = (id: string) => {
  const normalized = normalizeRoleId(id);

  if (roleNameOverrides[normalized]) {
    return roleNameOverrides[normalized];
  }

  return id
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const defaultTravellerRoles: ScriptRole[] = roleTypes.traveller.map((id) => ({
  id,
  name: prettifyRoleName(id),
  type: "traveller",
}));

export const defaultFabledRoles: ScriptRole[] = roleTypes.fabled.map((id) => ({
  id,
  name: prettifyRoleName(id),
  type: "fabled",
}));

export const defaultLoricRoles: ScriptRole[] = roleTypes.loric.map((id) => ({
  id,
  name: prettifyRoleName(id),
  type: "loric",
}));

export const getRoleType = (id: string): RoleType => {
  const normalized = normalizeRoleId(id);
  const match = (Object.entries(roleTypes) as Array<[RoleType, string[]]>).find(([, ids]) =>
    ids.some((roleId) => normalizeRoleId(roleId) === normalized),
  );

  return match?.[0] ?? "unknown";
};

const resolveStoredRoleType = (role: Pick<ScriptRole, "id" | "type">): RoleType =>
  role.type === "unknown" ? getRoleType(role.id) : role.type;

export const parseScriptJson = (json: unknown): ParsedScript => {
  if (!Array.isArray(json)) {
    throw new Error("Сценарий должен быть массивом объектов.");
  }

  const items = json as ScriptItem[];
  const meta = items.find((item) => item.id === "_meta");
  const roles = items
    .filter((item) => typeof item.id === "string" && item.id !== "_meta")
    .map((item) => {
      const id = String(item.id);

      return {
        id,
        name: prettifyRoleName(id),
        type: getRoleType(id),
      };
    });

  if (roles.length === 0) {
    throw new Error("В сценарии не найдено ролей.");
  }

  return {
    name: typeof meta?.name === "string" ? meta.name : undefined,
    author: typeof meta?.author === "string" ? meta.author : undefined,
    roles,
  };
};

export const getRoleLabel = (roleId: string | undefined, roles: ScriptRole[] = []) => {
  if (!roleId) {
    return "";
  }

  return prettifyRoleName(roleId);
};

export const getRoleTypeFromRoles = (roleId: string | undefined, roles: ScriptRole[] = []) => {
  if (!roleId) {
    return "unknown";
  }

  const matchingRole = roles.find((role) => role.id === roleId);

  return matchingRole ? resolveStoredRoleType(matchingRole) : getRoleType(roleId);
};

export const roleTypeLabels: Record<RoleType, string> = {
  townsfolk: "Townsfolk",
  outsider: "Outsider",
  minion: "Minion",
  demon: "Demon",
  traveller: "Traveller",
  fabled: "Fabled",
  loric: "Loric",
  unknown: "Other",
};

const roleTypeOrder: RoleType[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
  "fabled",
  "loric",
  "unknown",
];

export const groupRolesByType = (roles: ScriptRole[]) =>
  roleTypeOrder
    .map((type) => ({
      type,
      label: roleTypeLabels[type],
      roles: roles
        .filter((role) => resolveStoredRoleType(role) === type)
        .sort((a, b) => prettifyRoleName(a.id).localeCompare(prettifyRoleName(b.id), "en")),
    }))
    .filter((group) => group.roles.length > 0);

export const mergeScriptRoles = (currentRoles: ScriptRole[], nextRoles: ScriptRole[]) => {
  const rolesById = new Map<string, ScriptRole>();

  [...currentRoles, ...nextRoles].forEach((role) => {
    rolesById.set(normalizeRoleId(role.id), {
      ...role,
      type: resolveStoredRoleType(role),
    });
  });

  return Array.from(rolesById.values());
};
