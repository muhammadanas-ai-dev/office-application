// Page label rendering (F37) — pure, no imports.
//
// The label a reader shows for a page, from the label
// ranges. Kept separate from pdf-labels.ts (which needs
// pdf-lib) so client components can render the preview
// without bundling pdf-lib.

export type PageLabelStyle =
  | "decimal"
  | "roman-upper"
  | "roman-lower"
  | "letters-upper"
  | "letters-lower"
  | "none";

export interface PageLabelRange {
  /** 1-based first page of the range. */
  fromPage: number;
  style: PageLabelStyle;
  /** Text shown before the number (e.g. "A-"). */
  prefix: string;
  /** First value of the range (1 = i / 1 / A). */
  start: number;
}

const ROMAN_TABLE: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function toRoman(value: number): string {
  let remaining = value;
  let out = "";
  for (const [amount, numeral] of ROMAN_TABLE) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out;
}

export function toLetters(value: number): string {
  // PDF letter numbering: 1=A … 26=Z, 27=AA, 28=BB (repeated
  // letters, not base-26).
  const letter = String.fromCharCode(65 + ((value - 1) % 26));
  return letter.repeat(Math.floor((value - 1) / 26) + 1);
}

/** The label a reader shows for a page (1-based), given
 *  the ranges. */
export function pageLabel(
  ranges: PageLabelRange[],
  page: number
): string {
  let active: PageLabelRange | null = null;
  for (const range of ranges) {
    if (range.fromPage <= page) active = range;
    else break;
  }
  if (!active) return String(page);
  const value = active.start + (page - active.fromPage);
  let rendered: string;
  switch (active.style) {
    case "decimal":
      rendered = String(value);
      break;
    case "roman-upper":
      rendered = toRoman(value);
      break;
    case "roman-lower":
      rendered = toRoman(value).toLowerCase();
      break;
    case "letters-upper":
      rendered = toLetters(value);
      break;
    case "letters-lower":
      rendered = toLetters(value).toLowerCase();
      break;
    case "none":
      rendered = "";
      break;
  }
  return active.prefix + rendered;
}
