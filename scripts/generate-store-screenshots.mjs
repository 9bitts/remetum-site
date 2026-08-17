import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const W = 1080;
const H = 1920;
const GOLD = [201, 162, 39, 255];
const BG = [11, 11, 13, 255];
const SURFACE = [24, 24, 27, 255];
const SENT = [15, 61, 46, 255];
const TEXT = [242, 242, 240, 255];
const MUTED = [154, 154, 158, 255];
const ONLINE = [46, 204, 113, 255];

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const o = rowStart + 1 + x * 3;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("sRGB", Buffer.from([0])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(rgba, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) return;
  const i = (y * width + x) * 4;
  if (i < 0 || i + 3 >= rgba.length) return;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function fillRect(rgba, width, x0, y0, x1, y1, color) {
  const xa = Math.max(0, Math.round(Math.min(x0, x1)));
  const xb = Math.min(width, Math.round(Math.max(x0, x1)));
  const ya = Math.max(0, Math.round(Math.min(y0, y1)));
  const yb = Math.round(Math.max(y0, y1));
  for (let y = ya; y < yb; y += 1) {
    for (let x = xa; x < xb; x += 1) setPixel(rgba, width, x, y, color);
  }
}

function fill(rgba, width, height, color) {
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = color[0];
    rgba[i * 4 + 1] = color[1];
    rgba[i * 4 + 2] = color[2];
    rgba[i * 4 + 3] = color[3];
  }
}

function fillCircle(rgba, width, cx, cy, r, color) {
  const r2 = r * r;
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x * x + y * y <= r2) setPixel(rgba, width, cx + x, cy + y, color);
    }
  }
}

const G = {
  A: ["01110", "10001", "11111", "10001", "10001"],
  B: ["11110", "10001", "11110", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "11110", "10000", "11111"],
  F: ["11111", "10000", "11110", "10000", "10000"],
  G: ["01111", "10000", "10111", "10001", "01110"],
  H: ["10001", "10001", "11111", "10001", "10001"],
  I: ["111", "010", "010", "010", "111"],
  K: ["10001", "10010", "11100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "11110", "10000", "10000"],
  R: ["11110", "10001", "11110", "10100", "10010"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "01010", "00100"],
  Y: ["10001", "01010", "00100", "00100", "00100"],
  " ": ["00", "00", "00", "00", "00"],
  ".": ["0", "0", "0", "0", "1"],
};

function writeWord(rgba, width, x, y, text, color, scale) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = G[ch] ?? G[" "];
    const gw = glyph[0].length;
    for (let gy = 0; gy < glyph.length; gy += 1) {
      for (let gx = 0; gx < gw; gx += 1) {
        if (glyph[gy][gx] === "1") {
          fillRect(
            rgba,
            width,
            cx + gx * scale,
            y + gy * scale,
            cx + gx * scale + scale,
            y + gy * scale + scale,
            color,
          );
        }
      }
    }
    cx += (gw + 1) * scale;
  }
}

function chrome(rgba) {
  fill(rgba, W, H, BG);
  fillRect(rgba, W, 0, 0, W, 72, BG);
  fillCircle(rgba, W, 80, 36, 8, TEXT);
  fillCircle(rgba, W, 110, 36, 8, TEXT);
  fillCircle(rgba, W, 140, 36, 8, TEXT);
  writeWord(rgba, W, 900, 22, "4:21", TEXT, 4);
}

function listScreen() {
  const rgba = Buffer.alloc(W * H * 4);
  chrome(rgba);
  writeWord(rgba, W, 48, 110, "REMETUM", GOLD, 8);
  writeWord(rgba, W, 48, 200, "DIEGO ALBS", TEXT, 5);
  fillRect(rgba, W, 48, 270, 320, 330, GOLD);
  writeWord(rgba, W, 70, 286, "NOVA", BG, 4);
  fillRect(rgba, W, 48, 360, W - 48, 430, SURFACE);
  writeWord(rgba, W, 72, 382, "BUSCAR", MUTED, 4);

  const rows = [
    ["TESTE", "OLA. TUDO BEM", true],
    ["COMUNIDADE", "BEM VINDOS", false],
    ["ANA", "ENVIANDO AUDIO", true],
    ["GRUPO RS", "REUNIAO AS 19H", false],
  ];
  rows.forEach((row, i) => {
    const y = 480 + i * 170;
    fillCircle(rgba, W, 110, y + 50, 48, SURFACE);
    fillCircle(rgba, W, 110, y + 50, 44, i % 2 ? [40, 40, 48, 255] : [50, 42, 20, 255]);
    if (row[2]) fillCircle(rgba, W, 148, y + 86, 10, ONLINE);
    writeWord(rgba, W, 190, y + 28, row[0], TEXT, 5);
    writeWord(rgba, W, 190, y + 78, row[1], MUTED, 3);
  });

  fillRect(rgba, W, 0, H - 110, W, H, SURFACE);
  writeWord(rgba, W, 80, H - 72, "CHATS", GOLD, 4);
  writeWord(rgba, W, 430, H - 72, "STATUS", MUTED, 4);
  writeWord(rgba, W, 780, H - 72, "PERFIL", MUTED, 4);
  return encodePng(W, H, rgba);
}

function chatScreen() {
  const rgba = Buffer.alloc(W * H * 4);
  chrome(rgba);
  fillRect(rgba, W, 0, 80, W, 200, SURFACE);
  fillCircle(rgba, W, 110, 140, 40, [50, 42, 20, 255]);
  writeWord(rgba, W, 180, 110, "TESTE", TEXT, 5);
  writeWord(rgba, W, 180, 155, "ONLINE", ONLINE, 3);

  fillRect(rgba, W, 80, 280, 620, 400, SURFACE);
  writeWord(rgba, W, 110, 322, "OLA DIEGO", TEXT, 4);

  fillRect(rgba, W, 420, 440, 1000, 560, SENT);
  writeWord(rgba, W, 460, 482, "TUDO BEM", TEXT, 4);

  fillRect(rgba, W, 80, 600, 720, 720, SURFACE);
  writeWord(rgba, W, 110, 642, "VAMOS CONVERSAR", TEXT, 4);

  fillRect(rgba, W, 300, 760, 1000, 880, SENT);
  writeWord(rgba, W, 340, 802, "PODE SER", TEXT, 4);

  fillRect(rgba, W, 40, H - 160, W - 160, H - 50, SURFACE);
  writeWord(rgba, W, 70, H - 118, "MENSAGEM", MUTED, 4);
  fillCircle(rgba, W, W - 90, H - 105, 42, GOLD);
  return encodePng(W, H, rgba);
}

function loginScreen() {
  const rgba = Buffer.alloc(W * H * 4);
  chrome(rgba);
  writeWord(rgba, W, 80, 420, "REMETUM", GOLD, 10);
  writeWord(rgba, W, 80, 560, "CONVERSAS COM ESTILO", TEXT, 4);
  fillRect(rgba, W, 80, 720, W - 80, 840, GOLD);
  writeWord(rgba, W, 360, 758, "ENTRAR", BG, 6);
  fillRect(rgba, W, 80, 880, W - 80, 1000, SURFACE);
  writeWord(rgba, W, 280, 918, "CRIAR CONTA", TEXT, 5);
  return encodePng(W, H, rgba);
}

function communityScreen() {
  const rgba = Buffer.alloc(W * H * 4);
  chrome(rgba);
  writeWord(rgba, W, 48, 110, "COMUNIDADE", GOLD, 7);
  writeWord(rgba, W, 48, 200, "TODOS PODEM FALAR", MUTED, 4);
  const posts = [
    ["ANA", "BEM VINDOS AO REMETUM"],
    ["TESTE", "ALGUEM ONLINE"],
    ["DIEGO", "VAMOS CONVERSAR"],
  ];
  posts.forEach((row, i) => {
    const y = 300 + i * 280;
    fillRect(rgba, W, 48, y, W - 48, y + 240, SURFACE);
    fillCircle(rgba, W, 120, y + 70, 36, [50, 42, 20, 255]);
    writeWord(rgba, W, 180, y + 52, row[0], GOLD, 4);
    writeWord(rgba, W, 80, y + 140, row[1], TEXT, 4);
  });
  fillRect(rgba, W, 0, H - 110, W, H, SURFACE);
  writeWord(rgba, W, 80, H - 72, "CHATS", MUTED, 4);
  writeWord(rgba, W, 400, H - 72, "STATUS", MUTED, 4);
  writeWord(rgba, W, 720, H - 72, "PERFIL", MUTED, 4);
  return encodePng(W, H, rgba);
}

const dir = path.join(ROOT, "store", "screenshots");
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, "play-1-lista.png"), listScreen());
await writeFile(path.join(dir, "play-2-chat.png"), chatScreen());
await writeFile(path.join(dir, "play-3-entrar.png"), loginScreen());
await writeFile(path.join(dir, "play-4-comunidade.png"), communityScreen());
console.log("ok", dir);
