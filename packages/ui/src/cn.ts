import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Shared shadcn-style class merge: `cn("px-4", condition && "bg-tn-selected")`.
 * Platform-neutral — safe to import from `@takenotes/ui` anywhere. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
