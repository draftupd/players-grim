import { useEffect, useState } from "react";
import type { RoleType, ScriptRole } from "../types";
import { getRoleType, normalizeRoleId, prettifyRoleName } from "./scripts";

type BaseReferenceRole = {
  id: string;
  name?: string;
  team?: string;
  ability?: string;
  firstNight?: number;
  firstNightReminder?: string;
  otherNight?: number;
  otherNightReminder?: string;
  image?: string;
};

type LocalizedReferenceRole = {
  id: string;
  name?: string;
  ability?: string;
  firstNightReminder?: string;
  otherNightReminder?: string;
};

export type NightOrderReference = {
  firstNight: string[];
  otherNight: string[];
};

export type ReferenceRole = {
  id: string;
  name: string;
  type: RoleType;
  ability: string;
  firstNight: number;
  firstNightReminder: string;
  otherNight: number;
  otherNightReminder: string;
  image?: string;
};

export type ReferenceData = {
  roles: ReferenceRole[];
  roleMap: Map<string, ReferenceRole>;
  nightOrder: NightOrderReference;
};

let referenceDataPromise: Promise<ReferenceData> | null = null;

const normalizeTeamToRoleType = (team?: string): RoleType => {
  if (!team) {
    return "unknown";
  }

  const normalized = normalizeRoleId(team);

  if (normalized === "traveler") {
    return "traveller";
  }

  if (
    normalized === "townsfolk" ||
    normalized === "outsider" ||
    normalized === "minion" ||
    normalized === "demon" ||
    normalized === "traveller" ||
    normalized === "fabled" ||
    normalized === "loric"
  ) {
    return normalized;
  }

  return "unknown";
};

const fetchJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}`);
  }

  return response.json() as Promise<T>;
};

export const loadReferenceData = async (): Promise<ReferenceData> => {
  if (!referenceDataPromise) {
    referenceDataPromise = Promise.all([
      fetchJson<BaseReferenceRole[]>("/reference-data/characters.json"),
      fetchJson<LocalizedReferenceRole[]>("/reference-data/characters-ru_RU.json"),
      fetchJson<NightOrderReference>("/reference-data/night-order.json"),
    ]).then(([baseRoles, localizedRoles, nightOrder]) => {
      const localizedById = new Map(
        localizedRoles.map((role) => [normalizeRoleId(role.id), role]),
      );

      const roles = baseRoles.map((role) => {
        const normalizedId = normalizeRoleId(role.id);
        const localized = localizedById.get(normalizedId);

        return {
          id: role.id,
          name: role.name || prettifyRoleName(role.id),
          type: normalizeTeamToRoleType(role.team) === "unknown" ? getRoleType(role.id) : normalizeTeamToRoleType(role.team),
          ability: localized?.ability || role.ability || "",
          firstNight: role.firstNight ?? 0,
          firstNightReminder: localized?.firstNightReminder || role.firstNightReminder || "",
          otherNight: role.otherNight ?? 0,
          otherNightReminder: localized?.otherNightReminder || role.otherNightReminder || "",
          image: role.image,
        } satisfies ReferenceRole;
      });

      return {
        roles,
        roleMap: new Map(roles.map((role) => [normalizeRoleId(role.id), role])),
        nightOrder,
      };
    });
  }

  return referenceDataPromise;
};

export const useReferenceData = () => {
  const [data, setData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void loadReferenceData()
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
          setError("");
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Не удалось загрузить справочник.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
};

export const mergeReferenceRoles = (
  scriptRoles: ScriptRole[],
  referenceMap: Map<string, ReferenceRole>,
  extraRoleIds: string[] = [],
) => {
  const mergedById = new Map<string, ScriptRole>();

  scriptRoles.forEach((role) => {
    const normalizedId = normalizeRoleId(role.id);
    const reference = referenceMap.get(normalizedId);

    mergedById.set(normalizedId, {
      id: reference?.id ?? role.id,
      name: role.name || reference?.name || role.id,
      type: role.type === "unknown" && reference ? reference.type : role.type,
      image: role.image || reference?.image,
    });
  });

  extraRoleIds.forEach((roleId) => {
    const normalizedId = normalizeRoleId(roleId);
    const reference = referenceMap.get(normalizedId);

    if (reference && !mergedById.has(normalizedId)) {
      mergedById.set(normalizedId, {
        id: reference.id,
        name: reference.name,
        type: reference.type,
        image: reference.image,
      });
    }
  });

  return Array.from(mergedById.values());
};
