// PDF content-stream engine (Phase B, feature 3 — PDF editing).
//
// A minimal, honest content-stream reader/writer for the text
// operations a PDF editor needs. It tokenizes a page content
// stream, groups tokens into operations, tracks the text state
// (font, size, text matrix, CTM) so every text run can be located
// in user space, decodes the run to Unicode (WinAnsi for simple
// fonts, the font's ToUnicode CMap for CID fonts), and rewrites a
// stream with one run replaced.
//
// Scope is deliberately narrow and loud about it: only the
// operators the editor needs are understood (BT/ET, Tf, Td/TD/Tm,
// T*, Tj/TJ, Tc/Tw/Tz/TL/Ts, q/Q, cm, rg/g/k for the fill color,
// Do). Anything else in a stream is preserved verbatim when the
// stream is re-serialized, but a text run whose drawing cannot be
// attributed to understood operations is refused, never faked. A
// stream that fails to parse is refused with a clear error.
//
// The fill color is the NONSTROKING color (rg/g/k). Text is
// filled with it in the overwhelmingly common rendering mode
// (fill, Tr 0). A run drawn stroked (Tr 1/2, stroking color RG)
// is not colour-tracked — the replacement keeps the fill colour
// and the limitation is recorded in known-limitations.md.
//
// This module is pure (no Node, no Supabase, no server-only), so
// it is unit-testable in Vitest. The pdf-lib object-model wiring
// (reading/writing the stream, adding the replacement font) lives
// in pdf-edit.ts.

export class PdfContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfContentError";
  }
}

// ------------------------------------------------------------------
// Tokenizer
// ------------------------------------------------------------------

export type PdfToken =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "string"; value: Uint8Array }
  | { kind: "arrayStart" }
  | { kind: "arrayEnd" }
  | { kind: "dictStart" }
  | { kind: "dictEnd" }
  | { kind: "operator"; value: string }
  | { kind: "keyword"; value: string };

const WHITESPACE = new Set([" ", "\t", "\n", "\r", "\f", "\0"]);
const DELIMITERS = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);

/** Tokenize a content stream. Throws PdfContentError on bad input. */
export function tokenizeContent(content: string): PdfToken[] {
  const tokens: PdfToken[] = [];
  let i = 0;
  const n = content.length;
  while (i < n) {
    const ch = content[i];
    if (WHITESPACE.has(ch)) {
      i += 1;
      continue;
    }
    if (ch === "%") {
      // Comment — to end of line.
      while (i < n && content[i] !== "\n" && content[i] !== "\r") i += 1;
      continue;
    }
    if (ch === "(") {
      // Literal string — nested parens, backslash escapes.
      let depth = 1;
      const bytes: number[] = [];
      i += 1;
      while (i < n && depth > 0) {
        const c = content[i];
        if (c === "\\") {
          const next = content[i + 1];
          if (next === undefined) break;
          if (next === "n") bytes.push(0x0a);
          else if (next === "r") bytes.push(0x0d);
          else if (next === "t") bytes.push(0x09);
          else if (next === "b") bytes.push(0x08);
          else if (next === "f") bytes.push(0x0c);
          else if (next === "(") bytes.push(0x28);
          else if (next === ")") bytes.push(0x29);
          else if (next === "\\") bytes.push(0x5c);
          else if (next >= "0" && next <= "7") {
            // Octal escape, up to 3 digits.
            let oct = "";
            let j = i + 1;
            while (
              j < n &&
              oct.length < 3 &&
              content[j] >= "0" &&
              content[j] <= "7"
            ) {
              oct += content[j];
              j += 1;
            }
            bytes.push(parseInt(oct, 8) & 0xff);
            i = j - 1;
          } else if (next === "\n" || next === "\r") {
            // Line continuation — nothing emitted.
          } else {
            bytes.push(next.charCodeAt(0) & 0xff);
          }
          i += 2;
          continue;
        }
        if (c === "(") depth += 1;
        if (c === ")") {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
        }
        if (depth > 0) bytes.push(c.charCodeAt(0) & 0xff);
        i += 1;
      }
      if (depth !== 0)
        throw new PdfContentError(
          "Unterminated literal string in content stream."
        );
      tokens.push({ kind: "string", value: new Uint8Array(bytes) });
      continue;
    }
    if (ch === "<") {
      if (content[i + 1] === "<") {
        tokens.push({ kind: "dictStart" });
        i += 2;
        continue;
      }
      // Hex string — whitespace inside is ignored; an odd digit
      // is padded with a trailing 0.
      let hex = "";
      i += 1;
      while (i < n && content[i] !== ">") {
        if (!WHITESPACE.has(content[i])) hex += content[i];
        i += 1;
      }
      if (i >= n)
        throw new PdfContentError("Unterminated hex string in content stream.");
      i += 1;
      if (hex.length % 2 === 1) hex += "0";
      const bytes = new Uint8Array(hex.length / 2);
      for (let k = 0; k < bytes.length; k += 1) {
        const byte = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
        if (Number.isNaN(byte))
          throw new PdfContentError("Bad hex digit in content stream.");
        bytes[k] = byte;
      }
      tokens.push({ kind: "string", value: bytes });
      continue;
    }
    if (ch === ">") {
      if (content[i + 1] === ">") {
        tokens.push({ kind: "dictEnd" });
        i += 2;
        continue;
      }
      throw new PdfContentError("Unexpected '>' in content stream.");
    }
    if (ch === "[") {
      tokens.push({ kind: "arrayStart" });
      i += 1;
      continue;
    }
    if (ch === "]") {
      tokens.push({ kind: "arrayEnd" });
      i += 1;
      continue;
    }
    if (ch === "/") {
      let name = "";
      i += 1;
      while (
        i < n &&
        !WHITESPACE.has(content[i]) &&
        !DELIMITERS.has(content[i])
      ) {
        // A #xx escape inside a name.
        if (content[i] === "#" && i + 2 < n) {
          const code = parseInt(content.slice(i + 1, i + 3), 16);
          if (!Number.isNaN(code)) {
            name += String.fromCharCode(code);
            i += 3;
            continue;
          }
        }
        name += content[i];
        i += 1;
      }
      tokens.push({ kind: "name", value: name });
      continue;
    }
    // A bare word: a number, an operator, or a keyword (true/false/null).
    let word = "";
    while (
      i < n &&
      !WHITESPACE.has(content[i]) &&
      !DELIMITERS.has(content[i])
    ) {
      word += content[i];
      i += 1;
    }
    if (word === "") {
      i += 1;
      continue;
    }
    const num = Number(word);
    if (
      word !== "" &&
      !Number.isNaN(num) &&
      /^[-+]?(\d+\.?\d*|\.\d+)$/.test(word)
    ) {
      tokens.push({ kind: "number", value: num });
    } else if (word === "true" || word === "false" || word === "null") {
      tokens.push({ kind: "keyword", value: word });
    } else {
      tokens.push({ kind: "operator", value: word });
    }
  }
  return tokens;
}

// ------------------------------------------------------------------
// Operations
// ------------------------------------------------------------------

export interface PdfOperation {
  /** Operand tokens in order (strings, numbers, names, arrays). */
  operands: PdfToken[];
  /** The operator, e.g. "Tj", "Tm", "Tf". */
  operator: string;
  /** Index of this operation in the parsed list (stable). */
  index: number;
}

/** Group tokens into operations. Array/dict operands are kept as token runs. */
export function parseOperations(tokens: PdfToken[]): PdfOperation[] {
  const ops: PdfOperation[] = [];
  let operands: PdfToken[] = [];
  for (const token of tokens) {
    if (token.kind === "operator") {
      ops.push({ operands, operator: token.value, index: ops.length });
      operands = [];
    } else {
      operands.push(token);
    }
  }
  if (operands.length > 0) {
    throw new PdfContentError(
      "Content stream ends with operands and no operator."
    );
  }
  return ops;
}

// ------------------------------------------------------------------
// ToUnicode CMap
// ------------------------------------------------------------------

/**
 * Parse a ToUnicode CMap stream into a code -> Unicode string map.
 * Handles beginbfchar and beginbfrange (single-target and
 * array-target forms). Source codes are 1 or 2 bytes; the map key
 * is the code as a big-endian integer. Unparseable lines are
 * ignored (a font without a usable CMap simply yields no entries).
 */
export function parseToUnicodeCMap(cmapText: string): Map<number, string> {
  const map = new Map<number, string>();
  const bfchar = /beginbfchar([\s\S]*?)endbfchar/g;
  const bfrange = /beginbfrange([\s\S]*?)endbfrange/g;
  const hex = (s: string) => {
    const bytes: number[] = [];
    for (let i = 0; i + 1 < s.length; i += 2)
      bytes.push(parseInt(s.slice(i, i + 2), 16));
    return bytes;
  };
  const codeOf = (bytes: number[]) =>
    bytes.reduce((acc, b) => (acc << 8) | b, 0);
  const unicodeOf = (bytes: number[]) => {
    // UTF-16BE, possibly with a surrogate pair; fall back to
    // latin1 for a single byte.
    if (bytes.length === 0) return "";
    if (bytes.length === 1) return String.fromCharCode(bytes[0]);
    let out = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const unit = (bytes[i] << 8) | bytes[i + 1];
      if (unit >= 0xd800 && unit <= 0xdbff && i + 3 < bytes.length) {
        const low = (bytes[i + 2] << 8) | bytes[i + 3];
        out += String.fromCodePoint(
          0x10000 + ((unit - 0xd800) << 10) + (low - 0xdc00)
        );
        i += 2;
      } else {
        out += String.fromCharCode(unit);
      }
    }
    return out;
  };
  let m: RegExpExecArray | null;
  while ((m = bfchar.exec(cmapText)) !== null) {
    const pairs = m[1].match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) ?? [];
    for (const pair of pairs) {
      const parts = pair.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/)!;
      map.set(codeOf(hex(parts[1])), unicodeOf(hex(parts[2])));
    }
  }
  while ((m = bfrange.exec(cmapText)) !== null) {
    const body = m[1];
    // Range with a single start target: <lo> <hi> <dst>
    const single =
      body.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) ??
      [];
    for (const entry of single) {
      const parts = entry.match(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/
      )!;
      const lo = codeOf(hex(parts[1]));
      const hi = codeOf(hex(parts[2]));
      const dst = hex(parts[3]);
      // A range target is a UTF-16BE code point that increments.
      const base =
        dst.length >= 2
          ? (dst[dst.length - 2] << 8) | dst[dst.length - 1]
          : (dst[0] ?? 0);
      for (let code = lo; code <= hi; code += 1) {
        map.set(code, String.fromCharCode(base + (code - lo)));
      }
    }
    // Range with an array target: <lo> <hi> [<a> <b> ...]
    const arrayed =
      body.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g) ?? [];
    for (const entry of arrayed) {
      const parts = entry.match(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/
      )!;
      const lo = codeOf(hex(parts[1]));
      const targets = (parts[3].match(/<([0-9A-Fa-f]+)>/g) ?? []).map((t) =>
        t.slice(1, -1)
      );
      targets.forEach((t, idx) => map.set(lo + idx, unicodeOf(hex(t))));
    }
  }
  return map;
}

// ------------------------------------------------------------------
// Text decoding
// ------------------------------------------------------------------

/** WinAnsi (CP1252) decoding for simple fonts. ASCII is identical. */
const WINANSI_EXTRA: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

export function decodeWinAnsi(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += WINANSI_EXTRA[b] ?? String.fromCharCode(b);
  }
  return out;
}

/** Encode text to WinAnsi bytes. Returns null when a char cannot be encoded. */
export function encodeWinAnsi(text: string): Uint8Array | null {
  const reverse = new Map<string, number>();
  for (const [code, ch] of Object.entries(WINANSI_EXTRA))
    reverse.set(ch, Number(code));
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x100) {
      bytes.push(code);
    } else if (reverse.has(ch)) {
      bytes.push(reverse.get(ch)!);
    } else {
      return null;
    }
  }
  return new Uint8Array(bytes);
}

/** A font as the editor understands it for decoding. */
export interface PdfFontInfo {
  name: string;
  /** True when the font is CID-keyed (2-byte codes, needs a CMap). */
  isCid: boolean;
  /** ToUnicode CMap entries, when the font carries one. */
  toUnicode: Map<number, string> | null;
  /** Base font name from the font dict (e.g. "Arial-BoldMT"), or null. */
  baseFont: string | null;
}

/** Decode one string operand's bytes with a font. */
export function decodeTextBytes(
  bytes: Uint8Array,
  font: PdfFontInfo | null
): string {
  if (font && font.isCid && font.toUnicode) {
    // 2-byte codes (the common CID case); a trailing odd byte is
    // decoded as a 1-byte code.
    let out = "";
    for (let i = 0; i < bytes.length;) {
      if (i + 1 < bytes.length) {
        const code = (bytes[i] << 8) | bytes[i + 1];
        out += font.toUnicode.get(code) ?? "";
        i += 2;
      } else {
        out += font.toUnicode.get(bytes[i]) ?? "";
        i += 1;
      }
    }
    return out;
  }
  return decodeWinAnsi(bytes);
}

// ------------------------------------------------------------------
// Text-run extraction
// ------------------------------------------------------------------

export interface PdfTextRun {
  text: string;
  /** 0-based page index (the caller supplies it). */
  page: number;
  /** Baseline origin in user space (points). */
  x: number;
  y: number;
  /** Font size in points. */
  fontSize: number;
  /** Font name as used in the content stream (e.g. "F1"). */
  fontName: string;
  /** Base font name (e.g. "Arial-BoldMT"), when the font dict names one. */
  baseFont: string | null;
  /** Fill (nonstroking) colour at the time the run was drawn, as
   * RGB 0..1, or null when the stream never set one (the run then
   * inherits the page's colour — black by default). */
  fillColor: { r: number; g: number; b: number } | null;
  /** Operation indices that drew this run (for removal). */
  opIndices: number[];
  /** The text matrix at the run's start ([a b c d e f]). */
  textMatrix: [number, number, number, number, number, number];
}

interface TextState {
  fontName: string | null;
  fontSize: number;
  /** Text matrix [a b c d e f]. */
  tm: [number, number, number, number, number, number];
  /** Text line matrix (same shape). */
  tlm: [number, number, number, number, number, number];
  leading: number;
  charSpace: number;
  wordSpace: number;
  horizScale: number;
  rise: number;
}

function identityMatrix(): [number, number, number, number, number, number] {
  return [1, 0, 0, 1, 0, 0];
}
function multiplyMatrix(
  m1: [number, number, number, number, number, number],
  m2: [number, number, number, number, number, number]
): [number, number, number, number, number, number] {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}
function translateMatrix(
  tx: number,
  ty: number
): [number, number, number, number, number, number] {
  return [1, 0, 0, 1, tx, ty];
}

/** Extract the string operands of a Tj/TJ operation as byte arrays. */
function stringOperands(op: PdfOperation): Uint8Array[] {
  const out: Uint8Array[] = [];
  const walk = (tokens: PdfToken[]) => {
    for (const t of tokens) {
      if (t.kind === "string") out.push(t.value);
    }
  };
  walk(op.operands);
  return out;
}

/** Number operands of an operation, in order. */
function numberOperands(op: PdfOperation): number[] {
  return op.operands
    .filter((t): t is { kind: "number"; value: number } => t.kind === "number")
    .map((t) => t.value);
}

/**
 * Extract text runs from a page's operations.
 * `fonts` maps the font name used in the stream (e.g. "F1") to
 * its decoding info. `ctm` is the page's current transformation
 * matrix at the start of the stream (identity for most pages).
 * Returns runs in document order.
 */
/** The graphics state the extractor tracks: the CTM, the fill
 * (nonstroking) colour, and the text state. All three are saved
 * and restored by q/Q (they are all graphics-state parameters).
 * BT resets ONLY the text matrix and text line matrix — the font,
 * size, leading, spacing and colour all persist across BT...ET
 * blocks, exactly as the PDF spec defines them. */
interface GraphicsState {
  ctm: [number, number, number, number, number, number];
  fillColor: { r: number; g: number; b: number } | null;
  ts: TextState;
}

function freshTextState(): TextState {
  return {
    fontName: null,
    fontSize: 0,
    tm: identityMatrix(),
    tlm: identityMatrix(),
    leading: 0,
    charSpace: 0,
    wordSpace: 0,
    horizScale: 100,
    rise: 0,
  };
}

function copyGraphicsState(s: GraphicsState): GraphicsState {
  return {
    ctm: [...s.ctm] as [number, number, number, number, number, number],
    fillColor: s.fillColor ? { ...s.fillColor } : null,
    ts: {
      ...s.ts,
      tm: [...s.ts.tm] as [number, number, number, number, number, number],
      tlm: [...s.ts.tlm] as [number, number, number, number, number, number],
    },
  };
}

export function extractTextRuns(
  ops: PdfOperation[],
  fonts: Map<string, PdfFontInfo>,
  page: number
): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  // Graphics state stack for q/Q.
  let gstate: GraphicsState = {
    ctm: identityMatrix(),
    fillColor: null,
    ts: freshTextState(),
  };
  const gstateStack: GraphicsState[] = [];
  let inText = false;
  // The run currently being built (consecutive Tj/TJ ops on the
  // same line, with no intervening positioning op, are one run).
  let current: PdfTextRun | null = null;
  const flush = () => {
    if (current && current.text.length > 0) runs.push(current);
    current = null;
  };

  for (const op of ops) {
    switch (op.operator) {
      case "q":
        gstateStack.push(copyGraphicsState(gstate));
        break;
      case "Q":
        if (gstateStack.length > 0) gstate = gstateStack.pop()!;
        flush();
        break;
      case "cm": {
        const nums = numberOperands(op);
        if (nums.length === 6) {
          gstate.ctm = multiplyMatrix(
            [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]],
            gstate.ctm
          );
        }
        flush();
        break;
      }
      // Fill (nonstroking) colour. A colour change ends the
      // current run — a run never spans two colours.
      case "rg": {
        const nums = numberOperands(op);
        if (nums.length >= 3) {
          gstate.fillColor = { r: nums[0], g: nums[1], b: nums[2] };
        }
        flush();
        break;
      }
      case "g": {
        const v = numberOperands(op)[0];
        if (typeof v === "number") {
          gstate.fillColor = { r: v, g: v, b: v };
        }
        flush();
        break;
      }
      case "k": {
        const nums = numberOperands(op);
        if (nums.length >= 4) {
          const [c, m, y, k] = nums;
          gstate.fillColor = {
            r: (1 - c) * (1 - k),
            g: (1 - m) * (1 - k),
            b: (1 - y) * (1 - k),
          };
        }
        flush();
        break;
      }
      case "BT":
        inText = true;
        // BT resets ONLY the text matrix and text line matrix.
        // The font, size, leading, spacing and colour persist.
        gstate.ts.tm = identityMatrix();
        gstate.ts.tlm = identityMatrix();
        break;
      case "ET":
        inText = false;
        flush();
        break;
      case "Tf": {
        if (!inText) break;
        const name = op.operands.find((t) => t.kind === "name") as
          { kind: "name"; value: string } | undefined;
        const size = numberOperands(op)[0];
        if (name) gstate.ts.fontName = name.value;
        if (typeof size === "number") gstate.ts.fontSize = size;
        flush();
        break;
      }
      case "Td":
      case "TD": {
        if (!inText) break;
        const nums = numberOperands(op);
        if (nums.length >= 2) {
          const m = multiplyMatrix(
            translateMatrix(nums[0], nums[1]),
            gstate.ts.tlm
          );
          gstate.ts.tm = m;
          gstate.ts.tlm = m;
          if (op.operator === "TD") gstate.ts.leading = -nums[1];
        }
        flush();
        break;
      }
      case "Tm": {
        if (!inText) break;
        const nums = numberOperands(op);
        if (nums.length === 6) {
          gstate.ts.tm = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
          gstate.ts.tlm = gstate.ts.tm;
        }
        flush();
        break;
      }
      case "T*": {
        if (!inText) break;
        const m = multiplyMatrix(
          translateMatrix(0, -gstate.ts.leading),
          gstate.ts.tlm
        );
        gstate.ts.tm = m;
        gstate.ts.tlm = m;
        flush();
        break;
      }
      case "TL": {
        const v = numberOperands(op)[0];
        if (typeof v === "number") gstate.ts.leading = v;
        break;
      }
      case "Tc": {
        const v = numberOperands(op)[0];
        if (typeof v === "number") gstate.ts.charSpace = v;
        break;
      }
      case "Tw": {
        const v = numberOperands(op)[0];
        if (typeof v === "number") gstate.ts.wordSpace = v;
        break;
      }
      case "Tz": {
        const v = numberOperands(op)[0];
        if (typeof v === "number") gstate.ts.horizScale = v;
        break;
      }
      case "Ts": {
        const v = numberOperands(op)[0];
        if (typeof v === "number") gstate.ts.rise = v;
        break;
      }
      case "Tj":
      case "TJ": {
        if (!inText || !gstate.ts.fontName) break;
        const font = fonts.get(gstate.ts.fontName) ?? null;
        let text = "";
        for (const bytes of stringOperands(op)) {
          text += decodeTextBytes(bytes, font);
        }
        // Advance the text matrix by the drawn width so a
        // following Tj on the same line continues the run.
        // Width is estimated from the decoded text length and
        // the font size (a real width needs the font metrics;
        // for run grouping, the position of the NEXT run is
        // recomputed from its own Tm/Td anyway).
        if (text.length === 0) break;
        const user = multiplyMatrix(gstate.ts.tm, gstate.ctm);
        if (!current) {
          current = {
            text,
            page,
            x: user[4],
            y: user[5],
            fontSize: gstate.ts.fontSize,
            fontName: gstate.ts.fontName,
            baseFont: font?.baseFont ?? null,
            fillColor: gstate.fillColor ? { ...gstate.fillColor } : null,
            opIndices: [op.index],
            textMatrix: gstate.ts.tm,
          };
        } else {
          current.text += text;
          current.opIndices.push(op.index);
        }
        // Advance: approximate the width as 0.5 * fontSize per
        // char (Helvetica average) so a following Tj appends
        // after it. The exact position is not used for the
        // replacement — the replacement reuses the run's own
        // text matrix.
        const advance =
          text.length * gstate.ts.fontSize * 0.5 * (gstate.ts.horizScale / 100);
        gstate.ts.tm = multiplyMatrix(
          translateMatrix(advance, 0),
          gstate.ts.tm
        );
        break;
      }
      default:
        // Any other operator ends the current run grouping.
        if (
          op.operator === "Do" ||
          op.operator === "re" ||
          op.operator === "f" ||
          op.operator === "S"
        ) {
          flush();
        }
        break;
    }
  }
  flush();
  return runs;
}

// ------------------------------------------------------------------
// Image placements
// ------------------------------------------------------------------

export interface PdfImagePlacement {
  /** XObject name as used in the stream (e.g. "Im1"). */
  name: string;
  /** Placement rect in user space (points). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Operation index of the Do that draws it. */
  opIndex: number;
}

/**
 * Find every image drawn on a page: a `Do` operator whose operand
 * names an XObject, placed by the CTM in effect at that point.
 * The rect is the unit square [0,0,1,1] transformed by the CTM
 * (the standard way an image XObject is placed). Only `Do`
 * operators are reported; the caller decides which names are
 * images (via the page's Resources XObject dict).
 */
export function extractImagePlacements(
  ops: PdfOperation[]
): PdfImagePlacement[] {
  const out: PdfImagePlacement[] = [];
  let ctm: [number, number, number, number, number, number] = identityMatrix();
  const stack: Array<[number, number, number, number, number, number]> = [];
  for (const op of ops) {
    if (op.operator === "q") {
      stack.push(ctm);
    } else if (op.operator === "Q") {
      if (stack.length > 0) ctm = stack.pop()!;
    } else if (op.operator === "cm") {
      const nums = numberOperands(op);
      if (nums.length === 6) {
        ctm = multiplyMatrix(
          [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]],
          ctm
        );
      }
    } else if (op.operator === "Do") {
      const name = op.operands.find((t) => t.kind === "name") as
        { kind: "name"; value: string } | undefined;
      if (!name) continue;
      // The image fills the unit square transformed by the CTM.
      const [a, b, c, d, e, f] = ctm;
      const x = e;
      const y = f;
      const width = Math.sqrt(a * a + b * b);
      const height = Math.sqrt(c * c + d * d);
      out.push({ name: name.value, x, y, width, height, opIndex: op.index });
    }
  }
  return out;
}

// ------------------------------------------------------------------
// Re-serialization
// ------------------------------------------------------------------

function hexOf(bytes: Uint8Array): string {
  return (
    "<" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("") +
    ">"
  );
}

function serializeToken(token: PdfToken): string {
  switch (token.kind) {
    case "number":
      return String(token.value);
    case "name":
      return "/" + token.value;
    case "string":
      return hexOf(token.value);
    case "arrayStart":
      return "[";
    case "arrayEnd":
      return "]";
    case "dictStart":
      return "<<";
    case "dictEnd":
      return ">>";
    case "keyword":
      return token.value;
    case "operator":
      return token.value;
  }
}

function serializeOperation(op: PdfOperation): string {
  const parts = op.operands.map(serializeToken);
  parts.push(op.operator);
  return parts.join(" ");
}

/**
 * Re-serialize operations to a content stream, optionally
 * dropping the operations at `removeIndices` and inserting
 * `insertAt` (an operation-index position) the given replacement
 * operations (already serialized strings).
 */
export function serializeOperations(
  ops: PdfOperation[],
  removeIndices: Set<number> = new Set(),
  insertAt: number | null = null,
  insertOps: string[] = []
): string {
  const lines: string[] = [];
  for (const op of ops) {
    if (op.index === insertAt) {
      for (const line of insertOps) lines.push(line);
    }
    if (removeIndices.has(op.index)) continue;
    lines.push(serializeOperation(op));
  }
  if (insertAt !== null && insertAt >= ops.length) {
    for (const line of insertOps) lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Build the operations that draw replacement text at a run's
 * position, in the replacement font. `fontName` is the font name
 * in the page resources (e.g. "FormaEditFont"). The text matrix
 * is the run's own matrix, so rotation and baseline are kept.
 *
 * The block is wrapped in q...Q so the colour and font it sets
 * never leak into the rest of the page: without the wrapper, a
 * replacement colour would recolour every later run that relies
 * on the colour the stream set before it. When `fillColor` is
 * given, the replacement is drawn in exactly that colour; when
 * it is null, no colour is set and the replacement inherits the
 * colour in effect at that point in the stream (the same colour
 * the original run had).
 */
export function buildReplacementOps(
  run: PdfTextRun,
  replacement: string,
  fontName: string,
  fillColor: { r: number; g: number; b: number } | null = null
): string[] {
  const encoded = encodeWinAnsi(replacement);
  if (!encoded) {
    throw new PdfContentError(
      "The replacement text contains characters this font cannot render."
    );
  }
  const [a, b, c, d, e, f] = run.textMatrix;
  const fmt = (v: number) => {
    const r = Math.round(v * 10000) / 10000;
    return String(r);
  };
  const lines: string[] = ["q"];
  if (fillColor) {
    lines.push(
      `${fmt(fillColor.r)} ${fmt(fillColor.g)} ${fmt(fillColor.b)} rg`
    );
  }
  lines.push(
    "BT",
    `/${fontName} ${fmt(run.fontSize)} Tf`,
    `${fmt(a)} ${fmt(b)} ${fmt(c)} ${fmt(d)} ${fmt(e)} ${fmt(f)} Tm`,
    `${hexOf(encoded)} Tj`,
    "ET",
    "Q"
  );
  return lines;
}
