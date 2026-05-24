import { Moon } from "lucide-react";
import type { Phase, ScriptRole } from "../types";
import RoleTokenImage from "./RoleTokenImage";
import type { NightOrderReference, ReferenceRole } from "../utils/referenceData";
import { normalizeRoleId } from "../utils/scripts";

type NightOrderPanelProps = {
  phase: Phase | undefined;
  roles: ScriptRole[];
  nightOrder: NightOrderReference | null;
  referenceMap: Map<string, ReferenceRole>;
};

const markerLabels: Record<string, string> = {
  DUSK: "Сумерки",
  DAWN: "Рассвет",
  MINION: "Миньоны",
  DEMON: "Демон",
};

export default function NightOrderPanel({
  phase,
  roles,
  nightOrder,
  referenceMap,
}: NightOrderPanelProps) {
  if (!phase) {
    return (
      <section className="panel p-4 sm:p-5">
        <p className="text-sm text-stone-400">Фаза пока не выбрана.</p>
      </section>
    );
  }

  if (!nightOrder) {
    return (
      <section className="panel p-4 sm:p-5">
        <p className="text-sm text-stone-400">Загрузка ночной очереди...</p>
      </section>
    );
  }

  const sourceOrder = phase.number === 1 ? nightOrder.firstNight : nightOrder.otherNight;
  const currentRoleIds = new Set(roles.map((role) => normalizeRoleId(role.id)));
  const visibleItems = sourceOrder.filter((item) => {
    if (markerLabels[item]) {
      return true;
    }

    return currentRoleIds.has(normalizeRoleId(item));
  });

  return (
    <section className="panel p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <Moon className="h-5 w-5 text-ember-100" />
        <div>
          <h2 className="text-base font-semibold text-stone-50 sm:text-lg">
            {phase.number === 1 ? "Порядок 1 ночи" : `Порядок ${phase.number} ночи`}
          </h2>
          <p className="text-xs text-stone-400 sm:text-sm">
            Ночной порядок для текущего сценария доступен из любой фазы.
          </p>
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ember-200/15 bg-black/10 p-5 text-center text-sm text-stone-400">
          Для этого сценария не удалось собрать ночную очередь.
        </div>
      ) : (
        <ol className="space-y-2">
          {visibleItems.map((item, index) => {
            if (markerLabels[item]) {
              return (
                <li
                  key={`${item}-${index}`}
                  className="rounded-2xl border border-ember-200/12 bg-black/15 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-ember-100 sm:text-sm"
                >
                  {markerLabels[item]}
                </li>
              );
            }

            const reference = referenceMap.get(normalizeRoleId(item));

            return (
              <li
                key={`${item}-${index}`}
                className="rounded-2xl border border-ember-200/10 bg-black/15 px-3 py-2"
              >
                <div className="flex items-start gap-3">
                  <div className="flex w-16 shrink-0 flex-col items-center pt-0.5">
                    <RoleTokenImage
                      roleId={item}
                      roles={roles}
                      className="h-10 w-10 overflow-hidden rounded-full border border-ember-200/20 bg-black/20 sm:h-10 sm:w-10"
                      imageClassName="h-full w-full object-cover"
                    />
                    <p className="mt-1 text-center text-[9px] font-medium leading-[0.7rem] text-stone-100 sm:text-[10px] sm:leading-3">
                      {reference?.name ?? item}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    {reference?.ability ? (
                      <p className="text-[11px] leading-4 text-stone-300 sm:text-xs sm:leading-5">{reference.ability}</p>
                    ) : null}
                    {phase.number === 1 && reference?.firstNightReminder ? (
                      <p className="mt-1.5 text-[11px] leading-4 text-stone-400 sm:mt-2 sm:text-xs sm:leading-5">
                        Ночь 1: {reference.firstNightReminder}
                      </p>
                    ) : null}
                    {phase.number !== 1 && reference?.otherNightReminder ? (
                      <p className="mt-1.5 text-[11px] leading-4 text-stone-400 sm:mt-2 sm:text-xs sm:leading-5">
                        Другие ночи: {reference.otherNightReminder}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
