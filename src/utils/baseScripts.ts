import type { ScriptRole } from "../types";
import { getRoleType, prettifyRoleName } from "./scripts";

export type BaseScriptPreset = {
  id: "trouble_brewing" | "bad_moon_rising" | "sects_and_violets";
  name: string;
  author: string;
  roles: ScriptRole[];
};

const buildRoles = (roleIds: string[]): ScriptRole[] =>
  roleIds.map((id) => ({
    id,
    name: prettifyRoleName(id),
    type: getRoleType(id),
  }));

export const baseScriptPresets: BaseScriptPreset[] = [
  {
    id: "trouble_brewing",
    name: "Trouble Brewing",
    author: "The Pandemonium Institute",
    roles: buildRoles([
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
      "drunk",
      "recluse",
      "saint",
      "butler",
      "poisoner",
      "spy",
      "scarletwoman",
      "baron",
      "imp",
    ]),
  },
  {
    id: "bad_moon_rising",
    name: "Bad Moon Rising",
    author: "The Pandemonium Institute",
    roles: buildRoles([
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
      "lunatic",
      "tinker",
      "moonchild",
      "goon",
      "godfather",
      "devilsadvocate",
      "assassin",
      "mastermind",
      "zombuul",
      "pukka",
      "shabaloth",
      "po",
    ]),
  },
  {
    id: "sects_and_violets",
    name: "Sects & Violets",
    author: "The Pandemonium Institute",
    roles: buildRoles([
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
      "mutant",
      "sweetheart",
      "barber",
      "klutz",
      "eviltwin",
      "witch",
      "cerenovus",
      "pithag",
      "fanggu",
      "vigormortis",
      "nodashii",
      "vortox",
    ]),
  },
];

export const getBaseScriptPreset = (presetId: BaseScriptPreset["id"]) =>
  baseScriptPresets.find((preset) => preset.id === presetId);
