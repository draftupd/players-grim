import type { ScriptRole } from "../types";
import { getRoleLabel, normalizeRoleId } from "./scripts";

const tokenImageExtensions = ["png", "webp", "jpg", "jpeg", "svg"];

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const slugify = (value: string) =>
  value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-zа-яё0-9-]+/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLocaleLowerCase("en-US");

const compact = (value: string) =>
  value
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, "")
    .toLocaleLowerCase("en-US");

export const getTokenImageUrls = (roleId: string | undefined, roles: ScriptRole[] = []) => {
  if (!roleId) {
    return [];
  }

  const label = getRoleLabel(roleId, roles);
  const matchingRole = roles.find((role) => normalizeRoleId(role.id) === normalizeRoleId(roleId));
  const roleType = matchingRole?.type;
  const customImage = matchingRole?.image;
  const bases = unique([
    roleId,
    label,
    roleId.toLocaleLowerCase("en-US"),
    label.toLocaleLowerCase("en-US"),
    slugify(roleId),
    slugify(label),
    compact(roleId),
    compact(label),
  ]);
  const fallbackBases = unique([
    roleType ?? "",
    roleType === "loric" ? "Loric" : "",
    roleType === "traveller" ? "traveller" : "",
  ]);

  return [
    ...(customImage ? [customImage] : []),
    ...[...bases, ...fallbackBases].flatMap((base) =>
      tokenImageExtensions.map((extension) => `/token-images/${encodeURIComponent(base)}.${extension}`),
    ),
  ];
};
