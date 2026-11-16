// The bar along the bottom of the screen
import type { ReactNode } from "react";

import { ChartIcon, ClockIcon, GridIcon, HeartIcon, ShuffleIcon } from "./icons";

export type TabId = "collection" | "play" | "plays" | "wants" | "stats";

export const tabs: { id: TabId; label: string; icon: () => ReactNode }[] = [
  { id: "collection", label: "Collection", icon: GridIcon },
  { id: "play", label: "Play", icon: ShuffleIcon },
  { id: "plays", label: "Plays", icon: ClockIcon },
  { id: "wants", label: "Wants", icon: HeartIcon },
  { id: "stats", label: "Stats", icon: ChartIcon },
];

export function TabBar({ current, onPick }: { current: TabId; onPick: (tab: TabId) => void }) {
  return (
    <nav className="tabBar" aria-label="Sections">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" className={tab.id === current ? "tab tabActive" : "tab"}
          aria-current={tab.id === current ? "page" : undefined} onClick={() => onPick(tab.id)}>
          {tab.icon()}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
