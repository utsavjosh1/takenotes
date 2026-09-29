import type { CSSProperties } from "react";

const paths = {
  arrow: "M4 12h16m-6-6 6 6-6 6",
  arrowUp: "M6 18 18 6M6 6h12v12",
  check: "m5 12 4 4L19 6",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5",
  folder: "M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  terminal: "m4 6 6 6-6 6m9 0h7",
  lock: "M6 10V7a6 6 0 0 1 12 0v3M5 10h14v11H5ZM12 14v3",
  keyboard: "M3 5h18v14H3ZM6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 16h10",
  split: "M3 4h18v16H3ZM10 4v16",
  moon: "M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  reset: "M3 10a9 9 0 1 1 1 7M3 4v6h6",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  windows: "M3 4h8v7H3ZM14 4h7v7h-7ZM3 14h8v7H3ZM14 14h7v7h-7Z",
  github: "M9 19c-4 1-4-2-6-2m12 5v-4a3.5 3.5 0 0 0-1-2.7c3.3-.4 6.8-1.6 6.8-7.3A5.7 5.7 0 0 0 19.3 4 5.2 5.2 0 0 0 19.2 0S18 0 15 1.6a13.5 13.5 0 0 0-6 0C6 0 4.8 0 4.8 0A5.2 5.2 0 0 0 4.7 4 5.7 5.7 0 0 0 3.2 8c0 5.7 3.5 6.9 6.8 7.3A3.5 3.5 0 0 0 9 18v4",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
