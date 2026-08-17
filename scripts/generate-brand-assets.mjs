import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const GOLD = [201, 162, 39, 255];
const BG = [11, 11, 13, 255];
const CREAM = [242, 242, 240, 255];

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
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
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("sRGB", Buffer.from([0])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodePngRgb(width, height, rgba) {
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

function fill(rgba, width, height, color) {
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = color[0];
    rgba[i * 4 + 1] = color[1];
    rgba[i * 4 + 2] = color[2];
    rgba[i * 4 + 3] = color[3];
  }
}

function setPixel(rgba, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) return;
  const i = (y * width + x) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function fillRect(rgba, width, x0, y0, x1, y1, color) {
  const xa = Math.round(Math.min(x0, x1));
  const xb = Math.round(Math.max(x0, x1));
  const ya = Math.round(Math.min(y0, y1));
  const yb = Math.round(Math.max(y0, y1));
  for (let y = ya; y < yb; y += 1) {
    for (let x = xa; x < xb; x += 1) setPixel(rgba, width, x, y, color);
  }
}

function drawR(rgba, size) {
  const s = size;
  const stem = s * 0.13;
  const left = s * 0.28;
  const top = s * 0.22;
  const bottom = s * 0.78;
  const right = s * 0.72;
  const mid = s * 0.48;
  fillRect(rgba, s, left, top, left + stem, bottom, GOLD);
  fillRect(rgba, s, left, top, right - stem * 0.4, top + stem, GOLD);
  fillRect(rgba, s, left, mid - stem * 0.45, right - stem * 0.55, mid + stem * 0.45, GOLD);
  fillRect(rgba, s, right - stem * 1.15, top, right - stem * 0.15, mid + stem * 0.2, GOLD);
  const legX0 = left + stem * 0.7;
  const legY0 = mid;
  const steps = Math.round(s * 0.42);
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const x = legX0 + t * (right - stem * 0.2 - legX0);
    const y = legY0 + t * (bottom - stem * 0.05 - legY0);
    fillRect(rgba, s, x, y, x + stem * 1.05, y + stem * 0.95, GOLD);
  }
}

function iconPng(size, { round = false, rgb = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = round ? size * 0.22 : 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let inside = true;
      if (r) {
        const cx = Math.min(x, size - 1 - x);
        const cy = Math.min(y, size - 1 - y);
        if (cx < r && cy < r) {
          const dx = r - cx;
          const dy = r - cy;
          inside = dx * dx + dy * dy <= r * r;
        }
      }
      const color = inside ? BG : [0, 0, 0, 0];
      setPixel(rgba, size, x, y, color);
    }
  }
  drawR(rgba, size);
  return rgb ? encodePngRgb(size, size, rgba) : encodePng(size, size, rgba);
}

function featureGraphic() {
  const w = 1024;
  const h = 500;
  const rgba = Buffer.alloc(w * h * 4);
  fill(rgba, w, h, BG);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = Math.hypot(x - w / 2, y + 40) / 700;
      const shade = Math.max(0, 18 - d * 22);
      setPixel(rgba, w, x, y, [11 + shade, 11 + shade, 13 + shade, 255]);
    }
  }
  const mark = 220;
  const ox = 90;
  const oy = Math.round((h - mark) / 2);
  const src = Buffer.alloc(mark * mark * 4);
  fill(src, mark, mark, BG);
  drawR(src, mark);
  for (let y = 0; y < mark; y += 1) {
    for (let x = 0; x < mark; x += 1) {
      const i = (y * mark + x) * 4;
      if (src[i + 3]) {
        setPixel(rgba, w, ox + x, oy + y, [src[i], src[i + 1], src[i + 2], 255]);
      }
    }
  }
  writeWord(rgba, w, 360, 188, "REMETUM", GOLD, 7);
  writeWord(rgba, w, 360, 280, "CONVERSAS COM ESTILO", CREAM, 3);
  return encodePngRgb(w, h, rgba);
}

const GLYPHS = {
  R: ["1110", "1001", "1110", "1100", "1001"],
  E: ["1111", "1000", "1110", "1000", "1111"],
  M: ["10001", "11011", "10101", "10001", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "01110"],
  C: ["01110", "10001", "10000", "10001", "01110"],
  O: ["01110", "10001", "10001", "10001", "01110"],
  N: ["10001", "11001", "10101", "10011", "10001"],
  V: ["10001", "10001", "01010", "01010", "00100"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  A: ["01110", "10001", "11111", "10001", "10001"],
  I: ["111", "010", "010", "010", "111"],
  L: ["1000", "1000", "1000", "1000", "1111"],
  " ": ["00", "00", "00", "00", "00"],
};

function writeWord(rgba, width, x, y, text, color, scale) {
  let cx = x;
  for (const ch of text) {
    const glyph = GLYPHS[ch] ?? GLYPHS[" "];
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

function foregroundPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const inner = Math.round(size * 0.62);
  const ox = Math.round((size - inner) / 2);
  const src = Buffer.alloc(inner * inner * 4);
  drawR(src, inner);
  for (let y = 0; y < inner; y += 1) {
    for (let x = 0; x < inner; x += 1) {
      const i = (y * inner + x) * 4;
      if (src[i + 3]) {
        setPixel(rgba, size, ox + x, ox + y, [src[i], src[i + 1], src[i + 2], 255]);
      }
    }
  }
  return encodePng(size, size, rgba);
}

function splashPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  fill(rgba, size, size, BG);
  const inner = Math.round(size * 0.28);
  const ox = Math.round((size - inner) / 2);
  const src = Buffer.alloc(inner * inner * 4);
  drawR(src, inner);
  for (let y = 0; y < inner; y += 1) {
    for (let x = 0; x < inner; x += 1) {
      const i = (y * inner + x) * 4;
      if (src[i + 3]) {
        setPixel(rgba, size, ox + x, ox + y, [src[i], src[i + 1], src[i + 2], 255]);
      }
    }
  }
  return encodePng(size, size, rgba);
}

async function write(file, buf) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
}

async function main() {
  const icon1024 = iconPng(1024);
  const icon512 = iconPng(512, { round: true });
  const icon192 = iconPng(192, { round: true });
  await write(path.join(ROOT, "assets", "icon.png"), icon1024);
  await write(path.join(ROOT, "assets", "splash.png"), splashPng(1280));
  await write(path.join(ROOT, "store", "icon-512.png"), iconPng(512));
  await write(path.join(ROOT, "store", "play-icon-512.png"), iconPng(512));
  await write(path.join(ROOT, "store", "feature-graphic.png"), featureGraphic());
  await write(path.join(ROOT, "store", "play-feature-graphic.png"), featureGraphic());
  await write(path.join(ROOT, "apps", "web", "public", "icons", "icon-512.png"), icon512);
  await write(path.join(ROOT, "apps", "web", "public", "icons", "icon-192.png"), icon192);
  await write(
    path.join(ROOT, "apps", "web", "public", "icons", "apple-touch-icon.png"),
    iconPng(180, { round: true }),
  );
  await write(path.join(ROOT, "apps", "web", "public", "favicon.png"), iconPng(32, { round: true }));

  const densities = [
    ["mipmap-mdpi", 48, 108],
    ["mipmap-hdpi", 72, 162],
    ["mipmap-xhdpi", 96, 216],
    ["mipmap-xxhdpi", 144, 324],
    ["mipmap-xxxhdpi", 192, 432],
  ];
  const res = path.join(ROOT, "android", "app", "src", "main", "res");
  for (const [folder, launcher, fg] of densities) {
    const dir = path.join(res, folder);
    await write(path.join(dir, "ic_launcher.png"), iconPng(launcher));
    await write(path.join(dir, "ic_launcher_round.png"), iconPng(launcher, { round: true }));
    await write(path.join(dir, "ic_launcher_foreground.png"), foregroundPng(fg));
  }
  const splash = splashPng(960);
  await write(path.join(res, "drawable", "splash.png"), splash);
  for (const folder of [
    "drawable-port-mdpi",
    "drawable-port-hdpi",
    "drawable-port-xhdpi",
    "drawable-port-xxhdpi",
    "drawable-port-xxxhdpi",
    "drawable-land-mdpi",
    "drawable-land-hdpi",
    "drawable-land-xhdpi",
    "drawable-land-xxhdpi",
    "drawable-land-xxxhdpi",
  ]) {
    await write(path.join(res, folder, "splash.png"), splash);
  }
  console.log("assets gerados");
}

await main();
