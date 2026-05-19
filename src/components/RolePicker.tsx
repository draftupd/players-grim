import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ScriptRole } from "../types";
import { getRoleLabel } from "../utils/scripts";
import RoleTokenImage from "./RoleTokenImage";

export type RolePickerOption = {
  id: string;
  label: string;
};

export type RolePickerGroup = {
  key: string;
  label?: string;
  options: RolePickerOption[];
};

type RolePickerProps = {
  value: string;
  onChange: (value: string) => void;
  groups: RolePickerGroup[];
  roles?: ScriptRole[];
  placeholder: string;
  className?: string;
  buttonClassName?: string;
};

export default function RolePicker({
  value,
  onChange,
  groups,
  roles = [],
  placeholder,
  className,
  buttonClassName,
}: RolePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(
    () => groups.flatMap((group) => group.options).find((option) => option.id === value),
    [groups, value],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className={clsx("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          "field flex min-h-11 items-center justify-between gap-3 text-left",
          buttonClassName,
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          {selectedOption?.id ? (
            <RoleTokenImage
              roleId={selectedOption.id}
              roles={roles}
              className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-ember-200/20 bg-black/20"
              imageClassName="h-full w-full object-cover"
            />
          ) : null}
          <span className={clsx("truncate", !selectedOption && "text-stone-400")}>
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-ember-200/15 bg-ink-850 p-2 shadow-2xl shadow-black/40">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-stone-300 transition hover:bg-black/20"
          >
            <span className="h-8 w-8 shrink-0 rounded-full border border-dashed border-ember-200/20 bg-black/10" />
            <span className="truncate">{placeholder}</span>
          </button>

          {groups.map((group) => (
            <div key={group.key} className="mt-2">
              {group.label ? (
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ember-100/80">
                  {group.label}
                </div>
              ) : null}
              <div className="space-y-1">
                {group.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-black/20",
                      option.id === value && "bg-ember-200/10 text-ember-50",
                    )}
                  >
                    <RoleTokenImage
                      roleId={option.id}
                      roles={roles}
                      className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-ember-200/20 bg-black/20"
                      imageClassName="h-full w-full object-cover"
                      fallback={
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-ember-200/20 bg-black/20 text-[10px] font-bold text-stone-300">
                          {getRoleLabel(option.id, roles).slice(0, 2)}
                        </span>
                      }
                    />
                    <span className="truncate">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
