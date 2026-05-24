import { BookOpen } from "lucide-react";
import type { ScriptRole } from "../types";
import { groupRolesByType, normalizeRoleId } from "../utils/scripts";
import type { ReferenceRole } from "../utils/referenceData";
import RoleTokenImage from "./RoleTokenImage";

type RoleReferencePanelProps = {
  roles: ScriptRole[];
  referenceMap: Map<string, ReferenceRole>;
};

export default function RoleReferencePanel({ roles, referenceMap }: RoleReferencePanelProps) {
  const roleGroups = groupRolesByType(roles);

  return (
    <section className="panel p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen className="role-reference-icon h-5 w-5 text-ember-100" />
        <div>
          <h2 className="text-base font-semibold text-stone-50 sm:text-lg">Роли и способности</h2>
          <p className="text-xs text-stone-400 sm:text-sm">Справочник по ролям текущего сценария.</p>
        </div>
      </div>

      {roleGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ember-200/15 bg-black/10 p-5 text-center text-sm text-stone-400">
          Загрузите JSON сценария, чтобы увидеть роли и их способности.
        </div>
      ) : (
        <div className="space-y-4">
          {roleGroups.map((group) => (
            <section key={group.type} className="space-y-2.5">
              <h3 className="role-reference-group-label text-xs font-semibold uppercase tracking-[0.18em] text-ember-100 sm:text-sm">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.roles.map((role) => {
                  const reference = referenceMap.get(normalizeRoleId(role.id));

                  return (
                    <article
                      key={role.id}
                      className="rounded-2xl border border-ember-200/10 bg-black/15 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-12 shrink-0">
                          <RoleTokenImage
                            roleId={role.id}
                            roles={roles}
                            className="mx-auto h-10 w-10 overflow-hidden rounded-full border border-ember-200/20 bg-black/20 sm:h-11 sm:w-11"
                            imageClassName="h-full w-full object-cover"
                          />
                          <p className="mt-0.5 text-center text-[9px] font-medium leading-[0.7rem] text-stone-100 sm:text-[10px] sm:leading-3">
                            {reference?.name ?? role.name}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          {reference?.ability ? (
                            <p className="text-[11px] leading-4 text-stone-300 sm:text-xs sm:leading-5">{reference.ability}</p>
                          ) : (
                            <p className="text-[11px] leading-4 text-stone-500 sm:text-xs sm:leading-5">
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
