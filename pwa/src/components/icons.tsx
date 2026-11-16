// Line icons used across the app. They take the text colour, so a tab turns amber by changing its colour.
import type { ReactNode } from "react";

function lineIcon(size: number, strokeWidth: number, children: ReactNode) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const GridIcon = () => lineIcon(24, 1.8, <>
  <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" />
  <rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
</>);
export const ShuffleIcon = () => lineIcon(24, 1.8,
  <path d="M3 7h3c4 0 6 10 10 10h5M3 17h3c1.6 0 2.8-1.6 4-3.5M14 9.5c.9-1.4 1.9-2.5 3-2.5h4M18 4l3 3-3 3M18 14l3 3-3 3" />);
export const ClockIcon = () => lineIcon(24, 1.8, <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const HeartIcon = () => lineIcon(24, 1.8,
  <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />);
export const ChartIcon = () => lineIcon(24, 1.8, <path d="M5 20V11M12 20V5M19 20v-6" />);
export const SearchIcon = () => lineIcon(18, 2, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const CloseIcon = () => lineIcon(22, 2, <path d="M6 6l12 12M18 6 6 18" />);
export const UserIcon = () => lineIcon(20, 1.8, <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2" /></>);
export const ExternalIcon = () => lineIcon(16, 2, <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />);
export const SortIcon = () => lineIcon(16, 2, <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />);

// The record drawn when a cover is missing
export function DiscArt() {
  return (
    <svg className="discArt" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#0f0d0a" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#2a241c" strokeWidth="1" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="#2a241c" strokeWidth="1" />
      <circle cx="50" cy="50" r="15" fill="#f2a93b" opacity="0.85" />
      <circle cx="50" cy="50" r="2.5" fill="#0f0d0a" />
    </svg>
  );
}

export function GithubMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
    </svg>
  );
}

export const TrashIcon = () => lineIcon(20, 2, <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />);
export const PlusIcon = () => lineIcon(22, 2.2, <path d="M12 5v14M5 12h14" />);
