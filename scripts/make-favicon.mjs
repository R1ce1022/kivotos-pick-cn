/**
 * 生成 public/favicon.ico —— 与 favicon.svg 视觉一致（青蓝圆环 + 中心点）。
 * 不依赖任何图像库：手写 PNG 编码（zlib + CRC32），再包一层 ICO 容器。
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIZE = 64;

// ---------- 画图 ----------
const px = Buffer.alloc(SIZE * SIZE * 4);
const set = (x, y, [r, g, b], a = 255) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
};

/** 圆角矩形背景 + 圆环 + 中心点 + 四向刻度 */
const bg = [0x0b, 0x12, 0x20];
const c1 = [0x4f, 0xc3, 0xf7];
const c2 = [0x7c, 0x9c, 0xff];
const mix = (t) => c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
const cx = 31.5;
const cy = 31.5;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // 圆角矩形遮罩（圆角 14）
    const r = 14;
    const dx = Math.max(r - x, x - (SIZE - 1 - r), 0);
    const dy = Math.max(r - y, y - (SIZE - 1 - r), 0);
    const inside = Math.hypot(dx, dy) <= r + 0.5;
    if (!inside) {
      set(x, y, bg, 0);
      continue;
    }
    set(x, y, bg);

    const dist = Math.hypot(x - cx, y - cy);
    const t = (x + y) / (2 * SIZE); // 渐变参数

    // 圆环 r≈17 粗 4
    if (Math.abs(dist - 17) <= 2.1) set(x, y, mix(t));
    // 中心点 r≈6
    else if (dist <= 6) set(x, y, mix(t));
    // 四向刻度
    else {
      const near = (a) => Math.abs(a) <= 2.1;
      const onSpoke =
        (near(x - cx) && dist > 21 && dist <= 27) || (near(y - cy) && dist > 21 && dist <= 27);
      if (onSpoke) set(x, y, mix(t));
    }
  }
}

// ---------- PNG 编码 ----------
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// 每行前置 filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

// ---------- ICO 容器（PNG 内嵌） ----------
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(1, 4); // count

const entry = Buffer.alloc(16);
entry[0] = SIZE === 256 ? 0 : SIZE; // width
entry[1] = SIZE === 256 ? 0 : SIZE; // height
entry[2] = 0; // palette
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // color planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12); // offset

const ico = Buffer.concat([header, entry, png]);
fs.writeFileSync('public/favicon.ico', ico);
console.log(`✓ public/favicon.ico 已生成 (${SIZE}x${SIZE}, ${ico.length} 字节)`);
