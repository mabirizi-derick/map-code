import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = createCRC32Table();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function generatePng(width, height, isMaskable = false) {
  // Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Scanlines
  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  const cx = width / 2;
  const cy = height / 2;
  const radius = isMaskable ? width * 0.48 : width * 0.46;
  const innerRadius = width * 0.38;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawScanlines[offset++] = 0; // Filter byte 0: None
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = 11, g = 206, b = 59, a = 255; // #0bce3b Kyambogo vibrant green

      if (!isMaskable) {
        if (dist > radius) {
          a = 0; // transparent outside circle
        } else if (dist > radius - 2) {
          a = Math.max(0, Math.min(255, Math.floor((radius - dist) * 128)));
        }
      }

      if (a > 0) {
        // Subtle gradient background
        const grad = (y / height) * 35;
        r = Math.max(0, 11 - Math.floor(grad * 0.2));
        g = Math.min(235, Math.max(140, 206 - Math.floor(grad)));
        b = Math.max(20, 59 - Math.floor(grad * 0.5));

        // Draw compass / map diamond in center
        const cdx = Math.abs(dx);
        const cdy = Math.abs(dy);
        const diamondSize = width * 0.24;

        if (cdx + cdy < diamondSize) {
          // Inner diamond (White)
          r = 255;
          g = 255;
          b = 255;
          // Compass needle shading
          if (dx > 0 && dy < 0) {
            r = 234; g = 67; b = 53; // Google Red accent
          } else if (dx < 0 && dy > 0) {
            r = 26; g = 115; b = 232; // Blue accent
          }
        } else if (dist < innerRadius && dist > innerRadius - (width * 0.025)) {
          // White border ring
          r = 255;
          g = 255;
          b = 255;
        }
      }

      rawScanlines[offset++] = r;
      rawScanlines[offset++] = g;
      rawScanlines[offset++] = b;
      rawScanlines[offset++] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawScanlines, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate 192x192 PNG
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePng(192, 192, false));
console.log('Generated pwa-192x192.png');

// 2. Generate 512x512 PNG
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePng(512, 512, false));
console.log('Generated pwa-512x512.png');

// 3. Generate 512x512 Maskable PNG
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePng(512, 512, true));
console.log('Generated pwa-maskable-512x512.png');

// 4. Generate 180x180 Apple Touch Icon PNG
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePng(180, 180, false));
console.log('Generated apple-touch-icon.png');
