import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getAvgClass = (v: number) => v >= 75 ? "avg-high" : v >= 50 ? "avg-mid" : "avg-low";

export const getLetterGrade = (v: number) => {
  if (v >= 90) return "A+";
  if (v >= 80) return "A";
  if (v >= 70) return "B";
  if (v >= 60) return "C";
  if (v >= 50) return "D";
  return "F";
};
