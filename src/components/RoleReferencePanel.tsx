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
    <section className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen className="role-reference-icon h-5 w-5 text-ember-100" />
        <div>
          <h2 className="text-lg font-semibold text-stone-50">Роли и способности</h2>
          <p className="text-sm text-stone-400">Справочник по ролям текущего сценария.</p>
        </div>
      </div>

      {roleGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ember-200/15 bg-black/10 p-5 text-center text-sm text-stone-400">
          Загрузите JSON сценария, чтобы увидеть роли и их способности.
        </div>
      ) : (
        <div className="space-y-5">
          {roleGroups.map((group) => (
            <section key={group.type} className="space-y-3">
              <h3 className="role-reference-group-label text-sm font-semibold uppercase tracking-[0.18em] text-ember-100">
                {group.label}
              </h3>
              <div className="space-y-3">
                {group.roles.map((role) => {
                  const reference = referenceMap.get(normalizeRoleId(role.id));

                  return (
                    <article
                      key={role.id}
                      className="rounded-2xl border border-ember-200/10 bg-black/15 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <RoleTokenImage
                          roleId={role.id}
                          roles={roles}
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-ember-200/20 bg-black/20"
                          imageClassName="h-full w-full object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-stone-50">{reference?.name ?? role.name}</p>
                          {reference?.ability ? (
                            <p className="mt-1 text-sm leading-6 text-stone-300">{reference.ability}</p>
                          ) : (
                            <p className="mt-1 text-sm leading-6 text-stone-500">
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
