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
  lightTheme?: boolean;
};

export default function RoleReferencePanel({
  roles,
  referenceMap,
  scriptName,
  scriptVersion,
  scriptAuthor,
  lightTheme = false,
}: RoleReferencePanelProps) {
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
        <h2 className={`text-[15px] font-semibold leading-tight sm:text-lg ${lightTheme ? "text-stone-800" : "text-stone-100"}`}>{title}</h2>
        {byline ? <p className={`text-[10px] leading-tight sm:text-xs ${lightTheme ? "text-stone-500" : "text-stone-400"}`}>{byline}</p> : null}
      </div>

      {roleGroups.length === 0 ? (
        <div className={`rounded-2xl p-4 text-center text-sm ${lightTheme ? "bg-black/10 text-stone-400" : "bg-black/20 text-stone-400"}`}>
          Загрузите JSON сценария, чтобы увидеть роли и их способности.
        </div>
      ) : (
        <div className="space-y-2">
          {roleGroups.map((group, groupIndex) => (
            <section
              key={group.type}
              className={groupIndex === 0 ? "space-y-1" : `space-y-1 border-t pt-2 ${lightTheme ? "border-amber-900/18" : "border-ember-200/12"}`}
            >
              <h3 className={`role-reference-group-label text-[10px] font-semibold uppercase tracking-[0.18em] sm:text-xs ${lightTheme ? "text-stone-700" : "text-stone-300"}`}>
                {group.label}
              </h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {group.roles.map((role) => {
                  const reference = referenceMap.get(normalizeRoleId(role.id));

                  return (
                    <article key={role.id} className="min-w-0 px-0 py-0.5">
                      <div className="flex items-start gap-2">
                        <div className="flex w-12 shrink-0 flex-col items-center pt-0.5">
                          <RoleTokenImage
                            roleId={role.id}
                            roles={roles}
                            className="h-10 w-10 overflow-hidden rounded-full border-0 bg-transparent sm:h-11 sm:w-11"
                            imageClassName="h-full w-full object-cover"
                          />
                          <p className={`mt-0.5 text-center text-[6px] font-medium leading-[0.5rem] sm:text-[7px] sm:leading-[0.56rem] ${lightTheme ? "text-stone-700" : "text-stone-300"}`}>
                            {reference?.name ?? role.name}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          {reference?.ability ? (
                            <p className={`text-[8px] leading-[0.78rem] sm:text-[9px] sm:leading-[0.86rem] ${lightTheme ? "text-stone-700" : "text-stone-200"}`}>{reference.ability}</p>
                          ) : (
                            <p className={`text-[8px] leading-[0.78rem] sm:text-[9px] sm:leading-[0.86rem] ${lightTheme ? "text-stone-500" : "text-stone-400"}`}>
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
