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
  iconOnly?: boolean;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  iconGridClassName?: string;
  theme?: "light" | "dark";
};

export default function RolePicker({
  value,
  onChange,
  groups,
  roles = [],
  placeholder,
  iconOnly = false,
  className,
  buttonClassName,
  dropdownClassName,
  iconGridClassName,
  theme = "dark",
}: RolePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(
    () => groups.flatMap((group) => group.options).find((option) => option.id === value),
    [groups, value],
  );
  const selectedLabel = selectedOption?.id ? getRoleLabel(selectedOption.id, roles) || selectedOption.label : undefined;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const isLightTheme = theme === "light";

  return (
    <div ref={rootRef} className={clsx("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          "field flex min-h-11 items-center justify-between gap-3 text-left",
          iconOnly && "justify-center gap-2 px-3",
          isLightTheme && "border-amber-900/15 bg-white/90 text-stone-900",
          buttonClassName,
        )}
        title={selectedLabel ?? placeholder}
      >
        <span className={clsx("flex min-w-0 items-center gap-3", iconOnly && "justify-center")}>
          {selectedOption?.id ? (
            <RoleTokenImage
              roleId={selectedOption.id}
              roles={roles}
              className={clsx(
                "h-8 w-8 shrink-0 overflow-hidden rounded-full border bg-black/20",
                isLightTheme ? "border-amber-900/15 bg-stone-100" : "border-ember-200/20",
              )}
              imageClassName="h-full w-full object-cover"
              fallback={
                <span
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-bold",
                    isLightTheme
                      ? "border-amber-900/15 bg-stone-100 text-stone-700"
                      : "border-ember-200/20 bg-black/20 text-stone-300",
                  )}
                >
                  {getRoleLabel(selectedOption.id, roles).slice(0, 2)}
                </span>
              }
            />
          ) : (
            <span
              className={clsx(
                "h-8 w-8 shrink-0 rounded-full border border-dashed",
                isLightTheme ? "border-amber-900/15 bg-stone-100" : "border-ember-200/20 bg-black/10",
              )}
            />
          )}
          {!iconOnly ? (
            <span className={clsx("truncate", !selectedOption && (isLightTheme ? "text-stone-500" : "text-stone-400"))}>
              {selectedLabel ?? placeholder}
            </span>
          ) : null}
        </span>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          className={clsx(
            "absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border p-2 shadow-2xl",
            isLightTheme
              ? "border-amber-900/15 bg-[rgba(255,251,242,0.98)] text-stone-900 shadow-[0_18px_42px_rgba(120,86,58,0.2)]"
              : "border-ember-200/15 bg-ink-850 text-stone-100 shadow-black/40",
            dropdownClassName,
          )}
        >
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={clsx(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition",
              isLightTheme ? "text-stone-700 hover:bg-stone-900/5" : "text-stone-300 hover:bg-black/20",
              iconOnly && "justify-center",
            )}
            title={placeholder}
          >
            <span
              className={clsx(
                "h-8 w-8 shrink-0 rounded-full border border-dashed",
                isLightTheme ? "border-amber-900/15 bg-stone-100" : "border-ember-200/20 bg-black/10",
              )}
            />
            {!iconOnly ? <span className="truncate">{placeholder}</span> : null}
          </button>

          {groups.map((group) => (
            <div key={group.key} className="mt-2">
              {group.label ? (
                <div
                  className={clsx(
                    "px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]",
                    isLightTheme ? "text-amber-900/80" : "text-ember-100/80",
                  )}
                >
                  {group.label}
                </div>
              ) : null}
              <div className={clsx(iconOnly ? "grid grid-cols-4 gap-2" : "space-y-1", iconOnly && iconGridClassName)}>
                {group.options.map((option) => {
                  const optionLabel = getRoleLabel(option.id, roles) || option.label;

                  return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition",
                      isLightTheme ? "hover:bg-stone-900/5" : "hover:bg-black/20",
                      iconOnly && "justify-center px-2",
                      option.id === value &&
                        (isLightTheme ? "bg-amber-900/10 text-stone-900" : "bg-ember-200/10 text-ember-50"),
                    )}
                    title={optionLabel}
                  >
                    <RoleTokenImage
                      roleId={option.id}
                      roles={roles}
                      className={clsx(
                        "h-8 w-8 shrink-0 overflow-hidden rounded-full border bg-black/20",
                        isLightTheme ? "border-amber-900/15 bg-stone-100" : "border-ember-200/20",
                      )}
                      imageClassName="h-full w-full object-cover"
                      fallback={
                        <span
                          className={clsx(
                            "flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-bold",
                            isLightTheme
                              ? "border-amber-900/15 bg-stone-100 text-stone-700"
                              : "border-ember-200/20 bg-black/20 text-stone-300",
                          )}
                        >
                          {getRoleLabel(option.id, roles).slice(0, 2)}
                        </span>
                      }
                    />
                    {!iconOnly ? <span className="truncate">{optionLabel}</span> : null}
                  </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
