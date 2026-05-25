import { useState } from "react";
import type { ScriptRole } from "../types";
import RoleTokenImage from "./RoleTokenImage";
import type { NightOrderReference, ReferenceRole } from "../utils/referenceData";
import { normalizeRoleId } from "../utils/scripts";

type NightOrderPanelProps = {
  roles: ScriptRole[];
  nightOrder: NightOrderReference | null;
  referenceMap: Map<string, ReferenceRole>;
};

const markerLabels: Record<string, string> = {
  DAWN: "Рассвет",
  MINION: "Миньоны",
  DEMON: "Демон",
};

const sectionTitles = {
  firstNight: "1 ночь",
  otherNight: "Остальные ночи",
} as const;

export default function NightOrderPanel({
  roles,
  nightOrder,
  referenceMap,
}: NightOrderPanelProps) {
  const [activeTab, setActiveTab] = useState<"firstNight" | "otherNight">("firstNight");

  if (!nightOrder) {
    return (
      <section className="p-4 sm:p-5">
        <p className="text-sm text-stone-400">Загрузка ночной очереди...</p>
      </section>
    );
  }

  const currentRoleIds = new Set(roles.map((role) => normalizeRoleId(role.id)));
  const getVisibleItems = (sourceOrder: string[]) =>
    sourceOrder.filter((item) => markerLabels[item] || currentRoleIds.has(normalizeRoleId(item)));

  const firstNightItems = getVisibleItems(nightOrder.firstNight);
  const otherNightItems = getVisibleItems(nightOrder.otherNight);
  const activeItems = activeTab === "firstNight" ? firstNightItems : otherNightItems;
  const activeReminderKey = activeTab === "firstNight" ? "firstNightReminder" : "otherNightReminder";

  return (
    <section className="space-y-2 px-0 py-0 sm:space-y-3">
      {firstNightItems.length === 0 && otherNightItems.length === 0 ? (
        <div className="rounded-2xl bg-black/10 p-5 text-center text-sm text-stone-400">
          Для этого сценария не удалось собрать ночную очередь.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("firstNight")}
              className={activeTab === "firstNight" ? "primary-button min-h-10 px-3 whitespace-nowrap" : "secondary-button min-h-10 px-3 whitespace-nowrap"}
            >
              {sectionTitles.firstNight}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("otherNight")}
              className={activeTab === "otherNight" ? "primary-button min-h-10 px-3 whitespace-nowrap" : "secondary-button min-h-10 px-3 whitespace-nowrap"}
            >
              {sectionTitles.otherNight}
            </button>
          </div>

          {activeItems.length === 0 ? (
            <div className="rounded-2xl bg-black/10 p-4 text-center text-sm text-stone-400">
              Для этой части ночного порядка нет элементов.
            </div>
          ) : (
            <div className="space-y-1">
              {activeItems.map((item, index) => {
                if (markerLabels[item]) {
                  return (
                    <div
                      key={`${activeTab}-${item}-${index}`}
                      className="py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700"
                    >
                      {markerLabels[item]}
                    </div>
                  );
                }

                const reference = referenceMap.get(normalizeRoleId(item));
                const reminder = activeReminderKey === "firstNightReminder" ? reference?.firstNightReminder : reference?.otherNightReminder;

                return (
                  <article key={`${activeTab}-${item}-${index}`} className="min-w-0 px-0 py-0.5">
                    <div className="flex items-start gap-1.5">
                      <div className="flex w-11 shrink-0 flex-col items-center pt-0.5">
                        <RoleTokenImage
                          roleId={item}
                          roles={roles}
                          className="h-8 w-8 overflow-hidden rounded-full border-0 bg-transparent sm:h-9 sm:w-9"
                          imageClassName="h-full w-full object-cover"
                        />
                        <p className="mt-0.5 text-center text-[7px] font-medium leading-[0.56rem] text-stone-700 sm:text-[8px] sm:leading-[0.62rem]">
                          {reference?.name ?? item}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        {reference?.ability ? (
                          <p className="text-[9px] leading-[0.86rem] text-stone-700 sm:text-[10px] sm:leading-[0.95rem]">{reference.ability}</p>
                        ) : null}
                        {reminder ? (
                          <p className="mt-1 text-[9px] leading-[0.86rem] text-stone-500 sm:text-[10px] sm:leading-[0.95rem]">
                            {reminder}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
