import { useState } from "react";
import type { ScriptRole } from "../types";
import RoleTokenImage from "./RoleTokenImage";
import type { NightOrderReference, ReferenceRole } from "../utils/referenceData";
import { normalizeRoleId } from "../utils/scripts";

type NightOrderPanelProps = {
  roles: ScriptRole[];
  nightOrder: NightOrderReference | null;
  referenceMap: Map<string, ReferenceRole>;
  lightTheme?: boolean;
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
  lightTheme = false,
}: NightOrderPanelProps) {
  const [activeTab, setActiveTab] = useState<"firstNight" | "otherNight">("firstNight");

  if (!nightOrder) {
    return (
      <section className="p-4 sm:p-5">
        <p className={`text-sm ${lightTheme ? "text-stone-400" : "text-stone-400"}`}>Загрузка ночной очереди...</p>
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
        <div className={`rounded-2xl p-5 text-center text-sm ${lightTheme ? "bg-black/10 text-stone-400" : "bg-black/20 text-stone-400"}`}>
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
            <div className={`rounded-2xl p-4 text-center text-sm ${lightTheme ? "bg-black/10 text-stone-400" : "bg-black/20 text-stone-400"}`}>
              Для этой части ночного порядка нет элементов.
            </div>
          ) : (
            <div className="space-y-1">
              {activeItems.map((item, index) => {
                if (markerLabels[item]) {
                  return (
                    <div
                      key={`${activeTab}-${item}-${index}`}
                      className={`py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.16em] ${lightTheme ? "text-stone-700" : "text-stone-300"}`}
                    >
                      {markerLabels[item]}
                    </div>
                  );
                }

                const reference = referenceMap.get(normalizeRoleId(item));
                const reminder = activeReminderKey === "firstNightReminder" ? reference?.firstNightReminder : reference?.otherNightReminder;

                return (
                  <article key={`${activeTab}-${item}-${index}`} className="min-w-0 px-0 py-0.5">
                    <div className="flex items-start gap-2">
                      <div className="flex w-12 shrink-0 flex-col items-center pt-0.5">
                        <RoleTokenImage
                          roleId={item}
                          roles={roles}
                          className="h-10 w-10 overflow-hidden rounded-full border-0 bg-transparent sm:h-11 sm:w-11"
                          imageClassName="h-full w-full object-cover"
                        />
                        <p className={`mt-0.5 text-center text-[6px] font-medium leading-[0.5rem] sm:text-[7px] sm:leading-[0.56rem] ${lightTheme ? "text-stone-700" : "text-stone-300"}`}>
                          {reference?.name ?? item}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        {reference?.ability ? (
                          <p className={`text-[8px] leading-[0.78rem] sm:text-[9px] sm:leading-[0.86rem] ${lightTheme ? "text-stone-700" : "text-stone-200"}`}>{reference.ability}</p>
                        ) : null}
                        {reminder ? (
                          <p className={`mt-1 text-[8px] leading-[0.78rem] sm:text-[9px] sm:leading-[0.86rem] ${lightTheme ? "text-stone-500" : "text-stone-400"}`}>
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
