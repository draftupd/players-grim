import type { ScriptRole } from "../types";
import { groupRolesByType, normalizeRoleId } from "../utils/scripts";
import type { ReferenceRole } from "../utils/referenceData";
import RoleTokenImage from "./RoleTokenImage";

type RoleReferencePanelProps = {
  roles: ScriptRole[];
  referenceMap: Map<string, ReferenceRole>;
  scriptName?: string;
  scriptVersion?: string;
  scriptAuthor?: string;
};

export default function RoleReferencePanel({ roles, referenceMap, scriptName, scriptVersion, scriptAuthor }: RoleReferencePanelProps) {
  const roleGroups = groupRolesByType(roles);
  const title = scriptName?.trim() || "Сценарий";
  const byline = [
    scriptVersion?.trim() ? `v${scriptVersion.trim()}` : "",
    scriptAuthor?.trim() ? `by ${scriptAuthor.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="space-y-2 px-0 py-0 sm:space-y-3">
      <div className="mb-1">
        <h2 className="text-[15px] font-semibold leading-tight text-stone-800 sm:text-lg">{title}</h2>
        {byline ? <p className="text-[10px] leading-tight text-stone-500 sm:text-xs">{byline}</p> : null}
      </div>

      {roleGroups.length === 0 ? (
        <div className="rounded-2xl bg-black/10 p-4 text-center text-sm text-stone-400">
          Загрузите JSON сценария, чтобы увидеть роли и их способности.
        </div>
      ) : (
        <div className="space-y-2">
          {roleGroups.map((group, groupIndex) => (
            <section
              key={group.type}
              className={groupIndex === 0 ? "space-y-1" : "space-y-1 border-t border-amber-900/18 pt-2"}
            >
              <h3 className="role-reference-group-label text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-700 sm:text-xs">
                {group.label}
              </h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {group.roles.map((role) => {
                  const reference = referenceMap.get(normalizeRoleId(role.id));

                  return (
                    <article key={role.id} className="min-w-0 px-0 py-0.5">
                      <div className="flex items-start gap-1.5">
                        <div className="flex w-11 shrink-0 flex-col items-center pt-0.5">
                          <RoleTokenImage
                            roleId={role.id}
                            roles={roles}
                            className="h-8 w-8 overflow-hidden rounded-full border-0 bg-transparent sm:h-9 sm:w-9"
                            imageClassName="h-full w-full object-cover"
                          />
                          <p className="mt-0.5 text-center text-[7px] font-medium leading-[0.56rem] text-stone-700 sm:text-[8px] sm:leading-[0.62rem]">
                            {reference?.name ?? role.name}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          {reference?.ability ? (
                            <p className="text-[9px] leading-[0.86rem] text-stone-700 sm:text-[10px] sm:leading-[0.95rem]">{reference.ability}</p>
                          ) : (
                            <p className="text-[9px] leading-[0.86rem] text-stone-500 sm:text-[10px] sm:leading-[0.95rem]">
                              Для этой роли пока нет загруженного текста способности.
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
