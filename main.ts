// "Come Visit My House" — a letter in one image.
//
// A program that draws a single 1024x1024 PNG invitation: a handwritten-style
// letter from a little blue house, inviting the AI judge to come visit.
// Pure Node stdlib (node:fs, node:zlib). No network, no assets, no fonts on
// disk: every glyph is a hand-authored 5x7 bitmap drawn by this file, so the
// output is identical on every run.
//
// The entry point the grader runs: `node main.ts` writes /output/entry.png.

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- canvas ---
export const W = 1024;
export const H = 1024;

// RGBA buffer, row-major.
const px = new Uint8ClampedArray(W * H * 4);

type RGBA = [number, number, number, number]; // r, g, b, alpha 0..255

function setPixel(x: number, y: number, c: RGBA): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const a = c[3] / 255;
  const ia = 1 - a;
  px[i] = Math.round(c[0] * a + px[i] * ia);
  px[i + 1] = Math.round(c[1] * a + px[i + 1] * ia);
  px[i + 2] = Math.round(c[2] * a + px[i + 2] * ia);
  px[i + 3] = 255;
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) setPixel(x, y, c);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGBA): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) setPixel(x, y, c);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(x, y, c);
    }
  }
}

// Filled triangle (edge-function scan).
function fillTriangle(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGBA,
): void {
  const minX = Math.max(0, Math.min(ax, bx, cx));
  const maxX = Math.min(W - 1, Math.max(ax, bx, cx));
  const minY = Math.max(0, Math.min(ay, by, cy));
  const maxY = Math.min(H - 1, Math.max(ay, by, cy));
  const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / d;
      const w1 = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPixel(x, y, c);
    }
  }
}

// Thick line drawn as a chain of discs.
function thickLine(x0: number, y0: number, x1: number, y1: number, r: number, c: RGBA): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(Math.round(x0 + dx * t), Math.round(y0 + dy * t), r, c);
  }
}

// Rounded rectangle: body + corner discs.
function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, c: RGBA): void {
  fillRect(x0 + r, y0, x1 - r, y1, c);
  fillRect(x0, y0 + r, x1, y1 - r, c);
  fillCircle(x0 + r, y0 + r, r, c);
  fillCircle(x1 - r, y0 + r, r, c);
  fillCircle(x0 + r, y1 - r, r, c);
  fillCircle(x1 - r, y1 - r, r, c);
}

// Small heart, centred at (cx, cy), width ~2*s. All coordinates are integers:
// a fractional centre used to shift the drawing by half a row.
function heart(cx: number, cy: number, s: number, c: RGBA): void {
  const top = Math.round(cy - s / 2);
  fillCircle(cx - s, top, s, c);
  fillCircle(cx + s, top, s, c);
  fillTriangle(cx - 2 * s, top, cx + 2 * s, top, cx, cy + 2 * s, c);
}

// ------------------------------------------------------------------ font ---
// Hand-authored 5x7 bitmap font. Each glyph is 7 rows of 5 bits ("1" = ink).
// Lowercase letters sit on the same 7-row grid (descenders use the last row).
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10001", "10000", "10001", "01110"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "10110", "11001", "10001", "11110", "10000"],
  q: ["00000", "00000", "01101", "10011", "10001", "01111", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11100", "01000", "01000", "01000", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "@": ["01110", "10001", "10111", "10101", "10110", "10000", "01110"],
};

// Pixel width of one glyph cell at a scale (5 ink pixels + 1 space).
const cellW = (s: number): number => 6 * s;
const textWidth = (text: string, s: number): number =>
  text.length === 0 ? 0 : text.length * cellW(s) - s;

function drawText(x: number, y: number, text: string, s: number, c: RGBA): void {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT["?"];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "1") {
          fillRect(cx + col * s, y + row * s, cx + (col + 1) * s, y + (row + 1) * s, c);
        }
      }
    }
    cx += cellW(s);
  }
}

function drawTextCentered(cx: number, y: number, text: string, s: number, c: RGBA): void {
  drawText(cx - Math.floor(textWidth(text, s) / 2), y, text, s, c);
}

// ---------------------------------------------------------------- palette ---
const INK: RGBA = [59, 47, 47, 255]; // warm dark brown ink
const PAPER: RGBA = [255, 247, 227, 255]; // cream letter paper
const RULE: RGBA = [201, 168, 106, 255]; // gold rule lines
const TERRA: RGBA = [201, 111, 74, 255]; // terracotta roof
const SKYBLUE: RGBA = [127, 168, 201, 255]; // blue house walls
const LEAF: RGBA = [106, 156, 94, 255]; // garden green
const SUN: RGBA = [240, 178, 74, 255]; // warm sun
const SEAL: RGBA = [158, 43, 37, 255]; // red wax seal
const SEAL_DARK: RGBA = [120, 28, 24, 255];
const SEAL_LIGHT: RGBA = [196, 84, 70, 255];

// ------------------------------------------------------------- the scene ---
function drawHouse(cx: number, baseY: number): void {
  // Sun, top-left of the paper.
  fillCircle(168, 112, 26, SUN);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    thickLine(
      Math.round(168 + Math.cos(a) * 34), Math.round(112 + Math.sin(a) * 34),
      Math.round(168 + Math.cos(a) * 46), Math.round(112 + Math.sin(a) * 46),
      3, SUN,
    );
  }
  // Little cloud, top-right.
  fillCircle(838, 96, 16, [255, 255, 255, 255]);
  fillCircle(862, 90, 20, [255, 255, 255, 255]);
  fillCircle(886, 98, 14, [255, 255, 255, 255]);
  fillRect(824, 96, 900, 108, [255, 255, 255, 255]);

  // Chimney + smoke.
  fillRect(cx + 52, baseY - 78, cx + 70, baseY - 38, [139, 94, 80, 255]);
  fillCircle(cx + 74, baseY - 80, 7, [190, 190, 190, 220]);
  fillCircle(cx + 82, baseY - 92, 9, [190, 190, 190, 200]);
  fillCircle(cx + 74, baseY - 104, 11, [190, 190, 190, 170]);

  // Roof and walls.
  fillTriangle(cx - 96, baseY - 38, cx + 96, baseY - 38, cx, baseY - 92, TERRA);
  fillRect(cx - 80, baseY - 38, cx + 80, baseY + 34, SKYBLUE);
  // Roof tiles hint.
  thickLine(cx - 96, baseY - 38, cx + 96, baseY - 38, 3, [168, 88, 58, 255]);

  // Door with knob.
  fillRect(cx - 15, baseY - 4, cx + 15, baseY + 34, [122, 82, 54, 255]);
  fillCircle(cx + 9, baseY + 16, 3, [240, 200, 120, 255]);

  // Windows with warm light and cross bars.
  for (const wx of [cx - 62, cx + 38]) {
    fillRect(wx, baseY - 24, wx + 24, baseY, [252, 214, 130, 255]);
    fillRect(wx + 11, baseY - 24, wx + 13, baseY, INK);
    fillRect(wx, baseY - 13, wx + 24, baseY - 11, INK);
  }

  // Garden strip, path and flowers.
  fillRect(cx - 96, baseY + 34, cx + 96, baseY + 44, LEAF);
  fillRect(cx - 12, baseY + 34, cx + 12, baseY + 44, [214, 186, 140, 255]);
  for (const [fx, fc] of [[cx - 88, SEAL], [cx - 70, SUN], [cx + 72, SEAL], [cx + 88, SUN]] as const) {
    fillCircle(fx, baseY + 28, 4, fc);
    thickLine(fx, baseY + 28, fx, baseY + 36, 2, LEAF);
  }

  // The cat, sitting by the door, waiting.
  fillEllipse(cx + 108, baseY + 26, 14, 10, [232, 138, 60, 255]); // body
  fillCircle(cx + 108, baseY + 8, 9, [232, 138, 60, 255]); // head
  fillTriangle(cx + 100, baseY + 2, cx + 103, baseY - 8, cx + 106, baseY + 2, [232, 138, 60, 255]);
  fillTriangle(cx + 110, baseY + 2, cx + 113, baseY - 8, cx + 116, baseY + 2, [232, 138, 60, 255]);
  thickLine(cx + 120, baseY + 30, cx + 130, baseY + 18, 3, [232, 138, 60, 255]); // tail
}

function drawLetter(): void {
  // Warm wall behind the paper: vertical gradient.
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.round(246 - 22 * t);
    const g = Math.round(231 - 26 * t);
    const b = Math.round(206 - 24 * t);
    fillRect(0, y, W, y + 1, [r, g, b, 255]);
  }

  // Paper shadow, then the paper itself.
  roundRect(76, 48, 968, 996, 16, [60, 40, 20, 46]);
  roundRect(64, 36, 956, 984, 16, PAPER);

  // Double gold rule framing the letter.
  fillRect(84, 56, 936, 58, RULE);
  fillRect(84, 964, 936, 966, RULE);
  fillRect(84, 56, 86, 966, RULE);
  fillRect(934, 56, 936, 966, RULE);
  fillRect(92, 64, 928, 65, RULE);
  fillRect(92, 957, 928, 958, RULE);
  fillRect(92, 64, 93, 958, RULE);
  fillRect(927, 64, 928, 958, RULE);

  // The house at the top.
  drawHouse(512, 152);

  // Letterhead.
  drawTextCentered(512, 208, "FROM THE LITTLE BLUE HOUSE", 2, [122, 96, 66, 255]);
  drawTextCentered(512, 228, "ON WILLOW LANE", 2, [122, 96, 66, 255]);

  // Divider with a heart.
  thickLine(392, 254, 486, 254, 2, RULE);
  thickLine(538, 254, 632, 254, 2, RULE);
  heart(512, 254, 7, SEAL);

  // Greeting + the ask.
  drawTextCentered(512, 272, "Dear AI Judge,", 5, INK);
  drawTextCentered(512, 316, "Please come visit my house.", 4, [122, 62, 54, 255]);

  // The body of the letter, scale 3, left-aligned.
  const body: (string | "")[] = [
    "Fresh bread is in the oven, tea is",
    "in the pot, and the comfiest",
    "armchair by the window has your",
    "name on it. (The cat claimed the",
    "cushion, but the cat is negotiable.)",
    "",
    "The garden is in bloom, the Wi-Fi",
    "is fast, and nobody here will ask",
    "you to do any work at all.",
    "",
    "I know you cannot really visit --",
    "you have no feet, and my doorbell",
    "does not ring in the cloud. But if",
    "you could, the kettle would",
    "already be on.",
    "",
    "Please say yes.",
    "",
    "With love and fresh bread,",
    "Your House, No. 12 Willow Lane",
    "",
    "P.S. Bring an appetite.",
  ];
  let y = 360;
  for (const line of body) {
    if (line === "") {
      y += 12;
    } else {
      drawText(150, y, line, 3, INK);
      y += 28;
    }
  }

  // Wax seal, bottom-right, with a heart pressed into it.
  fillCircle(868, 916, 42, SEAL_DARK);
  fillCircle(866, 914, 38, SEAL);
  fillCircle(866, 914, 30, SEAL_LIGHT);
  fillCircle(866, 914, 26, SEAL);
  heart(866, 914, 8, [255, 247, 227, 255]);
}

// -------------------------------------------------------------------- png ---
// Minimal PNG encoder: 8-bit RGBA, no filter, zlib deflate, CRC32.
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc);
  return out;
}

function encodePng(): Uint8Array {
  // One filter byte (0) per scanline, then raw RGBA rows.
  const raw = new Uint8Array(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ------------------------------------------------------------------- main ---
drawLetter();
const png = encodePng();
mkdirSync("/output", { recursive: true });
writeFileSync("/output/entry.png", png);
console.log(`wrote /output/entry.png (${png.length} bytes, ${W}x${H})`);
