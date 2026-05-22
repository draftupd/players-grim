import clsx from "clsx";
import type { ScriptRole } from "../types";
import RoleTokenImage from "./RoleTokenImage";
import { getRoleLabel } from "../utils/scripts";

export type RoleIconGridGroup = {
  key: string;
  label?: string;
  roleIds: string[];
};

type RoleIconGridProps = {
  groups: RoleIconGridGroup[];
  roles: ScriptRole[];
  selectedRoleId?: string;
  onSelect: (roleId: string) => void;
  className?: string;
  buttonClassName?: string;
  groupLabelClassName?: string;
  columnsClassName?: string;
};

export default function RoleIconGrid({
  groups,
  roles,
  selectedRoleId,
  onSelect,
  className,
  buttonClassName,
  groupLabelClassName,
  columnsClassName,
}: RoleIconGridProps) {
  return (
    <div className={clsx("space-y-3", className)}>
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          {group.label ? (
            <p className={clsx("text-[11px] font-semibold uppercase tracking-[0.22em] text-ember-100/80", groupLabelClassName)}>
              {group.label}
            </p>
          ) : null}
          <div className={clsx("grid grid-cols-4 gap-2 sm:grid-cols-5", columnsClassName)}>
            {group.roleIds.map((roleId) => {
              const selected = selectedRoleId === roleId;

              return (
                <button
                  key={roleId}
                  type="button"
                  onClick={() => onSelect(roleId)}
                  title={getRoleLabel(roleId, roles)}
                  className={clsx(
                    "flex aspect-square items-center justify-center rounded-2xl border transition",
                    selected
                      ? "border-amber-200/70 bg-ember-200/16 shadow-[0_0_0_2px_rgba(242,204,116,0.16),0_10px_18px_rgba(0,0,0,0.18)]"
                      : "border-ember-200/10 bg-black/15 hover:border-ember-200/28 hover:bg-black/25",
                    buttonClassName,
                  )}
                >
                  <RoleTokenImage
                    roleId={roleId}
                    roles={roles}
                    className="h-10 w-10 overflow-hidden rounded-full border border-ember-200/20 bg-white/90 sm:h-11 sm:w-11"
                    imageClassName="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
