import clsx from "clsx";
import { Moon, Plus, Sun } from "lucide-react";
import type { Phase } from "../types";

type PhaseTabsProps = {
  phases: Phase[];
  selectedPhaseId?: string;
  onSelect: (phaseId: string) => void;
  onAddNextPhase: () => void;
};

export default function PhaseTabs({
  phases,
  selectedPhaseId,
  onSelect,
  onAddNextPhase,
}: PhaseTabsProps) {
  const compactTitle = (title: string) =>
    title
      .replace(" ночь", "н")
      .replace(" день", "д")
      .replace(/^Следующая фаза$/, "След.");

  return (
    <section className="panel p-2 sm:p-4">
      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
        {phases.map((phase) => {
          const selected = phase.id === selectedPhaseId;
          const Icon = phase.type === "night" ? Moon : Sun;

          return (
            <button
              key={phase.id}
              type="button"
              onClick={() => onSelect(phase.id)}
              className={clsx(
                "inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-semibold transition sm:min-h-11 sm:gap-2 sm:px-3",
                selected
                  ? "border-ember-100/60 bg-ember-200 text-ink-900"
                  : "border-ember-200/15 bg-black/20 text-stone-200 hover:border-ember-200/40",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="sm:hidden">{compactTitle(phase.title)}</span>
              <span className="hidden sm:inline">{phase.title}</span>
            </button>
          );
        })}

        <button type="button" onClick={onAddNextPhase} className="secondary-button min-h-10 shrink-0 snap-start px-2.5 sm:min-h-11 sm:px-3">
          <Plus className="h-4 w-4" />
          <span className="sm:hidden">След.</span>
          <span className="hidden sm:inline">Следующая фаза</span>
        </button>
      </div>
    </section>
  );
}
