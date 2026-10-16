// Hostile and odd input everywhere the site takes input, played like a visitor (or a page) that means no good.
// The expectation is the README's Privacy / Running it / Publishing sections and the site's own promises: nothing a
// visitor, a file or a link supplies is ever run, shown as markup or sent anywhere; whatever cannot be used is said
// in the site's voice ("That file is not an image. Choose a JPG, PNG or WebP photo."), never as a stack, NaN or
// [object Object]; the page stays usable afterwards; and every page ends with no page error, no console error, no
// policy violation and no request off the site (clean()).
//   names      file names with HTML, script, quotes, bidi marks, emoji, 200 characters, prototype names: shown as text,
//              downloaded under a sane name, and the sample's own name not taken by a photo that happens to share it
//   formats    every picture a browser opens (PNG, JPEG, progressive and gray and CMYK JPEG, WebP, AVIF, GIF animated, BMP,
//              ICO, SVG with a script and an outside reference), those it cannot (TIFF), and the broken ones (zero bytes,
//              text called .jpg, a truncated PNG): each opened with its colours right, or refused in words
//   exif       a JPEG stored in each of the eight Exif orientations is shown upright, and hostile Exif is shown as it is
//   sizes      1 x 1, 15 x 15, 16 x 16, 10000 x 200, 200 x 10000, fully transparent, half transparent, 12000 x 9000
//   textdrops  pasted text, links and html, pasted and dropped files that are not pictures, dropped links and text
//   hashes     #study?x, #%00, #../, prototype names, a megabyte of hash, every way of writing a tab; pose.html's query
//   foreign    postMessage from another origin (a page framing the app) to the app, the Pose page and Figure study's
//              drawing frame; and the drawing frame sending the app hostile lists
//   storage    junk of types and shapes the other cases do not deal, under every key the site reads
//   database   a corrupt painting in IndexedDB of kinds the other cases do not write
//   fields     the paint search and the canvas length, typed hostile
// HOSTILE_ONLY=names,formats runs some segments only.
import zlib from 'node:zlib';
import { openPage, clean, tab, app, poseFrame, renderFrame, textFile, svgImage, sleep, click, hscroll, storageGet, violations, DESKTOP, PHONE } from '../lib.mjs';

const ONLY = (process.env.HOSTILE_ONLY || '').split(',').filter(Boolean);

// ---- what the site says, and what it must never say ------------------------------------------------------------------------------
const NOT_IMAGE = /^That file is not an image\. Choose a JPG, PNG or WebP photo\.$/;
const EMPTY = /^That is an empty file or a folder\. Choose a JPG, PNG or WebP photo\.$/;
const NOT_OPENED = /^This image could not be opened\. HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first\.$/;
const TOO_SMALL = /^That picture is too small to study \(\d+ × \d+ px\): it needs at least 16 px on each side\.$/;
const GAVE_UP = /undefined|NaN|\[object|\bnull\b|Error\b|Exception|TypeError|DOMException|\bat https?:|stack trace|Infinity/;

// ---- fixtures made once with PIL / ImageMagick (2 to 700 bytes each): red top left, green top right, blue bottom left, yellow bottom right --
const B64 = {
  cmyk: '/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/8AAFAgAMABABEMRAE0RAFkRAEsRAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAAPwD71r8+q/Pqv1Toooooooooooor8Ba/cWiiiiiiiiiiiiiiv36r8OqKKKKKKKKKKKKKK/AWv3Foooooooooooooor9+q/DqiiiiiiiiiiiiiivwFr9xaKKKKKKKKKKKKKKK/Dqv36ooooooooooooor+hWv36r8BaKKKKKKKKKKKKK/nqr8Ba/fqiiiiiiiiiiiiiv6Fa/fqvwFooooooooooooor+eqvwFr9+qKKKKKKKKKKKKK/oVr9+q/AWiiiiiiiiiiiiiv//Z',
  gif: 'R0lGODlhKAAyAIEAAObcHh7IHtweHh4e3CH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAKAAyAAAIyQAFCBxIsGDBAAgTKly40KBDhwwjRnxIcaDEiwkrVsSIUSNFjhc9PgQpUSREkgxNGkSZUiVBlg1dWoSZUaZAmjVt4kRo8+bOngJ2BgAqlOjPnkWRHtW5VGZSpjiNRlU6FSpNqTQHaN3KtWtXAGDDih071qtZs2TTpj3Ldqvat2HbtoULVy5bum/tnsWrVi9avmT9egUcWDBXwmUNu0UcV7FWxo0dQwbr+PHkygMmA8CsmfPlyp1Bf5Y8WnFo0pA9pxa9GjVj1YwDAgAh+QQBCgABACwAAAAAKAAyAIEKCgoAAAAAAAAAAAAISgABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPlwEBADs=',
  webp: 'UklGRpQAAABXRUJQVlA4IIgAAABwBwCdASpAAFAAPjEWiEKiISEXPjQAIAMEoIcAGQLd78A/ADZ++AfgB+un+j5GLsB+t2d9gyD2/DYZH6kPCcJk4TInAAD+YO1OfW3KOE4VIpJAslFPkXUPV8zS+8XyBLTbMnOq///yuPsKCgzL8gza1fj//+fLNQq9f3yJ1nLjmxDlOeBpkAAA',
  gray: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAwAEABAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/AOWooorq6KKK5SiiiurooorlKKKK6uiiivMaKKK+laKKK+aqKKK+laKKK+aqKKK+laKKK//Z',
  prog: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wgARCAAwAEADASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAYHCP/EABkBAQADAQEAAAAAAAAAAAAAAAAGBwgECf/aAAwDAQACEAMQAAABiBFL+AuRH8RAQyQXrpSvSA2hr7N9UZA18ccDcncB2OPP+XAf/8QAFBABAAAAAAAAAAAAAAAAAAAAUP/aAAgBAQABBQJD/8QAGxEAAQQDAAAAAAAAAAAAAAAAFgAgY6Jk4eL/2gAIAQMBAT8BYZY9uUZY9uULTV2haau2/wD/xAAcEQAABgMAAAAAAAAAAAAAAAAAFRYgYmShouL/2gAIAQIBAT8BYhrOvQQ1nXoGUMgyhlv/xAAUEAEAAAAAAAAAAAAAAAAAAABQ/9oACAEBAAY/AkP/xAAUEAEAAAAAAAAAAAAAAAAAAABQ/9oACAEBAAE/IUP/2gAMAwEAAgADAAAAEP8A/wD/APffPPvv/wD/xAAUEQEAAAAAAAAAAAAAAAAAAAAw/9oACAEDAQE/EEIlX//EABcRAAMBAAAAAAAAAAAAAAAAACDw8QD/2gAIAQIBAT8QK7aM0D//xAAUEAEAAAAAAAAAAAAAAAAAAABQ/9oACAEBAAE/EEP/2Q==',
  avif: 'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAPAAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAQAAAADAAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAARG1kYXQSAAoJGBV/vaICGg0IMi1FMeHhmUCCCCeUAAAAwhFp1rc0Mp74IT+kp/a5h7NgIO+1k9eEXGJTZcC3hK4=',
  ico: 'AAABAAEAMDAAAAAAIACfAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAwAAAAMAgCAAAA2GBu0AAAAGZJREFUeJzt0DERwDAQA8G3JxBSG8zDDYjUAREwhnCNChe3ADQ3Gv9aldBPZKZmZibHIGIQMYgYRAwiBhGDiEHEIGIQMYhcXW9k6Ls7snPcQwYRg4hBxCBiEDGIGEQMIgYRg4hBZANPDgSEpIBIwgAAAABJRU5ErkJggg==',
  tiff: 'SUkqADIBAACANwPB6BQSBwWEQeFQaGQmGwuCh5kQOJxKKReLRmKxuMRyNReHSGISOHyWRR2UR+VR6WSmJyeYSSYyaByuXTebTmXzKeTSfSedTiW0GPzOjT2Z0Sh0uhSCkU+fz2lU2p0WoUeoyWq0yt06s1iwTWuWOqS2w1+r2Ky2up2e3VKyV222m0XW5XGyW+60m8Wy83S9UC+3eb4HASTCYmOYa94jB4/C4fGz7FX6U5PGQhzQLNh7O5/OaHPaLQaPTaXO5LMwfUaTXafX63YTXV5jZbfY7nZ6nMaqIbjd7rgaXfb2G8Phcng7Ti4Hkcvn7Lm83o8rq8zjc7rdvoaLp9nr+Hdd/td3zeLsbWwej2d7s9Tue3Z+TVfL5fTbfH9cv8W77P23j1MA/7ztegIACgAAAQMAAQAAACAAAAABAQMAAQAAACAAAAACAQMAAwAAALABAAADAQMAAQAAAAUAAAAGAQMAAQAAAAIAAAARAQQAAQAAAAgAAAAVAQMAAQAAAAMAAAAWAQMAAQAAACAAAAAXAQQAAQAAACkBAAAcAQMAAQAAAAEAAAAAAAAACAAIAAgA',
};
const fixture = (key, name, mimeType) => ({ name, mimeType, buffer: Buffer.from(B64[key], 'base64') });

const COLORS = { red: [220, 30, 30], green: [30, 200, 30], blue: [30, 30, 220], yellow: [230, 220, 30] };
// the nearest of the four fixture colours to a pixel, or 'other' when none is within reach
const nameOf = (px) => { let best = 'other', bd = 130; for (const [n, c] of Object.entries(COLORS)) { const d = Math.hypot(px[0] - c[0], px[1] - c[1], px[2] - c[2]); if (d < bd) { bd = d; best = n; } } return best; };
const STORED = { TL: 'red', TR: 'green', BL: 'blue', BR: 'yellow' };

// a 4-quadrant picture drawn in the page and encoded by the browser
async function quad(page, w, h, type = 'image/png', name) {
  const url = await app(page).evaluate(([w, h, type, c]) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    const q = [[0, 0, c.red], [w / 2, 0, c.green], [0, h / 2, c.blue], [w / 2, h / 2, c.yellow]];
    for (const [x, y, rgb] of q) { g.fillStyle = `rgb(${rgb.join(',')})`; g.fillRect(x, y, w / 2, h / 2); }
    return cv.toDataURL(type, 0.95);
  }, [w, h, type, COLORS]);
  const m = /^data:([^;]+);base64,(.*)$/.exec(url);
  return { name: name || `quad-${w}x${h}.${{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[m[1]]}`, mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}
// a canvas of one flat tone, or of an alpha, as a PNG
async function flatPng(page, w, h, fill, name) {
  const url = await app(page).evaluate(([w, h, fill]) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); if (fill) { g.fillStyle = fill; g.fillRect(0, 0, w, h); } return cv.toDataURL('image/png'); }, [w, h, fill]);
  return { name, mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') };
}
// a 24-bit BMP
function bmp(w, h, name = 'quad.bmp') {
  const row = Math.ceil((w * 3) / 4) * 4, b = Buffer.alloc(54 + row * h);
  b.write('BM'); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = COLORS[STORED[(y < h / 2 ? 'T' : 'B') + (x < w / 2 ? 'L' : 'R')]], o = 54 + (h - 1 - y) * row + x * 3; b[o] = c[2]; b[o + 1] = c[1]; b[o + 2] = c[0]; }
  return { name, mimeType: 'image/bmp', buffer: b };
}
// a PNG of 1-bit stripes, built here: 12000 x 9000 costs 13 MB of rows and a few hundred kB once deflated
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function stripedPng(w, h, name) {
  const rb = Math.ceil(w / 8), raw = Buffer.alloc((rb + 1) * h);
  for (let y = 0; y < h; y++) raw.fill((y >> 6) & 1 ? 0xf0 : 0x0f, y * (rb + 1) + 1, (y + 1) * (rb + 1));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 1; ihdr[9] = 0;
  return { name, mimeType: 'image/png', buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]) };
}
// a JPEG with an Exif block after its first marker(s): Orientation `o`, in the byte order asked, with the declared length changed by `skew`
function withExif(jpg, o, { little = false, skew = 0, name } = {}) {
  const tiff = Buffer.alloc(26);
  if (little) { tiff.write('II'); tiff.writeUInt16LE(0x2a, 2); tiff.writeUInt32LE(8, 4); tiff.writeUInt16LE(1, 8); tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(o, 18); }
  else { tiff.write('MM'); tiff.writeUInt16BE(0x2a, 2); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(1, 8); tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(o, 18); }
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]); head.writeUInt16BE(body.length + 2 + skew, 2);
  let at = 2; if (jpg[2] === 0xff && jpg[3] === 0xe0) at = 4 + jpg.readUInt16BE(4); // after the JFIF block when there is one
  return { name, mimeType: 'image/jpeg', buffer: Buffer.concat([jpg.subarray(0, at), head, body, jpg.subarray(at)]) };
}

// ---- the page, as the case needs it ----------------------------------------------------------------------------------------------
const toastOf = (page) => app(page).evaluate(() => document.getElementById('toast').textContent.trim());
const resetToast = (page) => app(page).evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.classList.remove('show'); });
const labelOf = (page) => app(page).evaluate(() => document.getElementById('source').textContent.trim());
const busyDown = (page, timeout = 30000) => app(page).waitForFunction(() => document.getElementById('busy').hidden, null, { timeout }).then(() => true).catch(() => false);
// the four quarter points of the Photo canvas, and its size
const corners = (page) => app(page).evaluate(() => { const c = document.getElementById('cv-orig'), g = c.getContext('2d'); const at = (fx, fy) => { const d = g.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data; return [d[0], d[1], d[2]]; }; return { w: c.width, h: c.height, TL: at(0.25, 0.25), TR: at(0.75, 0.25), BL: at(0.25, 0.75), BR: at(0.75, 0.75) }; });
// the page keeps working after whatever it was given: a tab opens, the Photo canvas holds a picture
const usable = (page) => app(page).evaluate(() => { const b = document.querySelector('[data-tab="help"]'); b.click(); const help = !document.getElementById('tab-help').hidden; document.querySelector('[data-tab="study"]').click(); return help && !document.getElementById('tab-study').hidden && document.getElementById('cv-orig').width > 0; });

// Gives the page a file through an input, and waits for what happens: the photo opened (the label changes and the
// study is drawn), a refusal said (a toast), or nothing within the limit. Returns what a visitor sees.
async function feed(page, file, { selector = '#file', limit = 20000, labelId = 'source' } = {}) {
  const fr = app(page);
  const before = await fr.evaluate((id) => document.getElementById(id).textContent, labelId);
  await resetToast(page);
  await fr.setInputFiles(selector, file);
  const how = await fr.waitForFunction(([lab, id]) => {
    const l = document.getElementById(id).textContent, t = document.getElementById('toast').textContent.trim();
    if (l !== lab && document.getElementById('busy').hidden) return 'opened';
    if (t) return 'said';
    return false;
  }, [before, labelId], { timeout: limit }).then((h) => h.jsonValue()).catch(() => 'nothing');
  if (how === 'said') await sleep(150); // (a note can come with a photo that opened: let the label follow)
  await busyDown(page);
  const label = await fr.evaluate((id) => document.getElementById(id).textContent.trim(), labelId);
  return { how: label !== before.trim() ? 'opened' : how, label, toast: await toastOf(page), before: before.trim() };
}
// a drop of items on the page: { file } or { type, data }, as another window's drag would carry them
async function dropItems(page, items, selector = 'body') {
  return app(page).evaluate(async ([sel, items]) => {
    const el = document.querySelector(sel), dt = new DataTransfer();
    for (const it of items) {
      if (it.file) { const bin = atob(it.file.b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); dt.items.add(new File([bytes], it.file.name, { type: it.file.mimeType })); }
      else dt.setData(it.type, it.data);
    }
    const claimed = {};
    for (const type of ['dragenter', 'dragover', 'drop']) { const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }); el.dispatchEvent(e); claimed[type] = e.defaultPrevented; }
    return claimed;
  }, [selector, items]);
}
const fileItem = (f) => ({ file: { name: f.name, mimeType: f.mimeType, b64: f.buffer.toString('base64') } });
// a paste with whatever is on the clipboard: items of { type, data } and { file }; returns whether the page claimed the event
async function pasteItems(page, items, selector = null) {
  return app(page).evaluate(async ([sel, items]) => {
    const dt = new DataTransfer();
    for (const it of items) {
      if (it.file) { const bin = atob(it.file.b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); dt.items.add(new File([bytes], it.file.name, { type: it.file.mimeType })); }
      else dt.setData(it.type, it.data);
    }
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    (sel ? document.querySelector(sel) : document).dispatchEvent(e);
    return e.defaultPrevented;
  }, [selector, items]);
}

// ---- a segment: one block's failure is one failed check, and the pages it opened are closed ------------------------------------------
function segments(t, site) {
  const timings = [];
  return {
    async run(name, fn) {
      if (ONLY.length && !ONLY.includes(name)) return;
      const t0 = Date.now(), pages = [];
      const open = async (opts) => { const p = await openPage(site, opts); pages.push(p); return p; };
      try { await fn(open); } catch (e) { t.check(false, `${name}: the segment ran to its end`, String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
      for (const p of pages) await p.context().close().catch(() => null);
      timings.push(`${name} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      process.stdout.write(`  [${name}] ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
    },
    timings,
  };
}

export default async function hostile(t, site) {
  const seg = segments(t, site);

  // ====================================================================================================================
  // names: what a file is called is text, wherever the site shows it, and a download made from it has a name a disk takes
  // ====================================================================================================================
  await seg.run('names', async (open) => {
    const NAMES = [
      ['an img tag with onerror', '<img src=x onerror=window.__pwn=1>.png'],
      ['a script element', '"><script>window.__pwn=1</script>.png'],
      ['an svg with onload', '<svg onload=window.__pwn=1>.png'],
      ['quotes and an SQL line', 'it\'s "a" photo\'; DROP TABLE portraits;--.jpg'],
      ['a right-to-left override', 'photo‮gpj.exe.png'],
      ['bidi isolates and marks', '‏⁧שלום⁩ ‎ portrait.png'],
      ['emoji and a joiner sequence', '🎨 👩‍🎨 portrait 🖼️.png'],
      ['200 unbroken characters', 'a'.repeat(200) + '.png'],
      ['a prototype name', '__proto__.png'],
      ['constructor with no extension', 'constructor'],
      ['nothing before the dot', '.png'],
      ['percent escapes', 'a%00b%2e%2e%2fc%0d%0a.png'],
      ['a name that looks like a size', 'portrait:600x750.png'],
      ['a newline', 'line one\nline two.png'],
      ['a Windows device name', 'CON.png'],
      ['spaces only', '   .png'],
    ];
    const page = await open();
    const fr = app(page);
    await fr.evaluate(() => { document.addEventListener('change', (e) => { if (e.target && e.target.id === 'file') window.__fname = e.target.files[0] ? e.target.files[0].name : null; }, true); });
    const png = await quad(page, 160, 200);
    const bad = { text: [], children: [], ran: [], dims: [], redrawn: [] };
    const seenNames = [];
    for (const [what, name] of NAMES) {
      const r = await feed(page, { ...png, name });
      const s = await fr.evaluate(() => { const el = document.getElementById('source'); return { held: window.__fname, shown: el.firstElementChild ? el.firstElementChild.textContent : null, kids: [...el.children].map((c) => c.tagName), pwn: window.__pwn, handlers: document.querySelectorAll('[onerror],[onload],[onclick][data-x],img[src="x"]').length, scripts: document.querySelectorAll('script:not([src])').length }; });
      seenNames.push(s.held);
      if (r.how !== 'opened') bad.redrawn.push(`${what}: ${r.how} ${r.toast}`);
      if (s.shown !== s.held) bad.text.push(`${what}: shows ${JSON.stringify(s.shown)} for ${JSON.stringify(s.held)}`);
      if (s.kids.join() !== 'STRONG') bad.children.push(`${what}: ${s.kids.join()}`);
      if (s.pwn !== undefined || s.handlers || s.scripts) bad.ran.push(`${what}: ${JSON.stringify(s)}`);
      if (!/ · 160 × 200 px$/.test(r.label)) bad.dims.push(`${what}: ${r.label.slice(-30)}`);
    }
    t.check(!bad.redrawn.length, 'names: each of sixteen hostile file names opens the photo (the study is drawn)', bad.redrawn);
    t.check(!bad.text.length, 'names: each name is shown in the label exactly as the file is called, as text', bad.text);
    t.check(!bad.children.length, 'names: the label holds its name in one bold element and nothing else (no element made from the name)', bad.children);
    t.check(!bad.ran.length, 'names: nothing in a name ran or was turned into an element (no window.__pwn, no handler attribute, no inline script)', bad.ran);
    t.check(!bad.dims.length, 'names: the label ends with the photo\'s size whatever the name holds', bad.dims);
    t.check((await usable(page)), 'names: the page is still usable after sixteen names');
    await clean(t, page, 'names: through the file input');

    // the download: Save PNG under each name
    const saves = {};
    for (const [what, name] of NAMES.filter(([w]) => /img tag|override|200|prototype|nothing before|percent|newline|device|spaces/.test(w))) {
      await feed(page, { ...png, name });
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), click(page, '[data-save="orig"]')]);
      saves[what] = dl ? dl.suggestedFilename() : null;
    }
    const wrong = Object.entries(saves).filter(([, f]) => !f || !/-original\.png$/.test(f) || /[\\/]/.test(f) || Buffer.byteLength(f) > 255 || /[\u0000-\u001f]/.test(f));
    t.check(!wrong.length, 'names: Save PNG downloads under a name that ends -original.png, with no path separator or control character, within 255 bytes', wrong);
    t.check(saves['nothing before the dot'] === 'portrait-original.png', 'names: a file called ".png" downloads as portrait-original.png', saves['nothing before the dot']);
    t.note(`names: Save PNG file names as the browser gave them: ${JSON.stringify(saves).slice(0, 700)}`);
    await clean(t, page, 'names: Save PNG');

    // the same through a drop and a paste, and into Check my painting
    const dropName = '<b onmouseover=window.__pwn=1>dropped</b>.png', pasteName = '<i onfocus=window.__pwn=1>pasted</i>.png';
    await resetToast(page);
    await dropItems(page, [fileItem({ ...png, name: dropName })]);
    await fr.waitForFunction((n) => document.getElementById('source').textContent.includes(n) && document.getElementById('busy').hidden, dropName, { timeout: 15000 }).catch(() => null);
    t.check((await labelOf(page)).startsWith(dropName), 'names: a dropped file with HTML in its name is labelled by that name as text', await labelOf(page));
    await pasteItems(page, [fileItem({ ...png, name: pasteName })]);
    await fr.waitForFunction((n) => document.getElementById('source').textContent.includes(n) && document.getElementById('busy').hidden, pasteName, { timeout: 15000 }).catch(() => null);
    t.check((await labelOf(page)).startsWith(pasteName), 'names: a pasted file with HTML in its name is labelled by that name as text', await labelOf(page));
    t.check(await fr.evaluate(() => window.__pwn === undefined && !document.querySelector('b[onmouseover], i[onfocus]')), 'names: neither the drop nor the paste made an element or ran anything');

    // Paint by numbers' setup says what it paints from; the sample's own name is not taken by a photo called the same
    await feed(page, { ...png, name: '<img src=x onerror=window.__pwn=1>.png' });
    await tab(page, 'game');
    const g1 = await fr.evaluate(() => { const e = document.getElementById('gamePhotoName'); return { text: e.textContent, kids: e.children.length, pwn: window.__pwn }; });
    t.check(g1.text === 'Painting from <img src=x onerror=window.__pwn=1>.' && !g1.kids && g1.pwn === undefined, 'names: Paint by numbers says "Painting from" the name as text', g1);
    await tab(page, 'study');
    await feed(page, { ...png, name: 'sample-study.png' });
    await tab(page, 'game');
    const g2 = await fr.evaluate(() => document.getElementById('gamePhotoName').textContent);
    const sampleish = /sample portrait/i.test(g2);
    t.check(!sampleish, 'names: a photo of the visitor\'s own called sample-study.png is not described as the sample portrait', g2);
    if (sampleish) t.finding({
      title: 'A photo called sample-study.png (or sample-study.jpg) is described as "the sample portrait" in Paint by numbers, and shares the sample\'s best scores',
      severity: 'low',
      steps: 'Study the photo: Load photo, choose any picture saved as sample-study.png (a visitor who saved the sample, or any file by that name). Open Games, then Paint by numbers, and read the line under "My photo".',
      expected: 'The line names the visitor\'s photo ("Painting from sample-study."), as it does for any other file; the README says best scores for your own photos are keyed by the photo\'s file name and size, so a photo is not mistaken for the sample.',
      actual: `The setup reads "${g2}". The best score for that photo is also kept under the sample's key ("sample-study:WxH") when it has the sample's 600 x 750 size.`,
      cause: 'js/game.js:361 tells the sample by key.startsWith(\'sample-study:\'), and js/app.js:118/568 make that key from the file name (state.baseName = the name without its extension) as well as for the built-in sample, so a file called sample-study takes the sample\'s words (and, at 600 x 750, its best score key, app.js:2782). The sample is told apart by state.isSample elsewhere (app.js:600), which game.js does not use.',
    });
    await clean(t, page, 'names: drop, paste and Paint by numbers');

    // Check my painting: the name in the drawer, on a phone, 200 characters with no break
    const ph = await open({ viewport: PHONE, url: '#check' });
    const longName = 'b'.repeat(200) + '.png';
    const r = await feed(ph, { ...png, name: '<u onclick=window.__pwn=1>x</u>' + longName }, { selector: '#artFile', labelId: 'artSource' });
    const a = await app(ph).evaluate(() => { const e = document.getElementById('artSource'); return { kids: [...e.children].map((c) => c.tagName).join(), pwn: window.__pwn, text: e.textContent.slice(0, 40) }; });
    t.check(r.how === 'opened' && a.kids === 'STRONG' && a.pwn === undefined && a.text.startsWith('<u onclick'), 'names: Check my painting labels a painting with HTML and 200 characters in its name as text', { how: r.how, ...a });
    const wide = await hscroll(ph);
    t.check(wide <= 0, 'names: a 200-character name in Check my painting does not widen the page on a phone', wide);
    if (wide > 0) t.finding({ title: 'A long unbroken file name makes Check my painting scroll sideways on a phone', severity: 'low', steps: 'On a 390 px wide window open the address #check, load a painting called "b" x 200 + ".png" through "Load a photo of your painting".', expected: 'The name wraps or is cut short with an ellipsis; the page does not scroll sideways.', actual: `the page is ${wide}px wider than the window`, cause: 'js/app.js:2305 puts the name in a <strong> inside #artSource with no overflow-wrap; styles.css gives that line no break rule' });
    await clean(t, ph, 'names: Check my painting on a phone');
  });

  // ====================================================================================================================
  // formats: every picture a browser opens, those it cannot, and the broken ones
  // ====================================================================================================================
  await seg.run('formats', async (open) => {
    const page = await open();
    const fr = app(page);
    const png64 = await quad(page, 64, 48, 'image/png', 'quad.png');
    const jpg64 = await quad(page, 64, 48, 'image/jpeg', 'quad.jpg');
    const SVG_EVIL = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="120"><style>@import url("http://evil.example/x.css");</style><script>window.__pwn=1</script><image href="http://evil.example/x.png" width="10" height="10"/><image xlink:href="https://evil.example/y.png" width="10" height="10"/><rect width="100" height="120" fill="rgb(220,30,30)" onload="window.__pwn=2"/></svg>';
    // (kept apart below: an SVG with a foreignObject marks the canvas it is drawn on as tainted)
    const SVG_FO = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="120"><rect width="100" height="120" fill="rgb(220,30,30)"/><foreignObject x="10" y="10" width="80" height="40"><div xmlns="http://www.w3.org/1999/xhtml" style="color:white">A caption laid out by the browser</div></foreignObject></svg>';
    const OPENS = [
      ['a PNG', png64, [64, 48], true],
      ['a JPEG', jpg64, [64, 48], true],
      ['a progressive JPEG', fixture('prog', 'progressive.jpg', 'image/jpeg'), [64, 48], true],
      ['a gray JPEG', fixture('gray', 'gray.jpg', 'image/jpeg'), [64, 48], false],
      ['a CMYK JPEG', fixture('cmyk', 'cmyk.jpg', 'image/jpeg'), [64, 48], true],
      ['a WebP', fixture('webp', 'quad.webp', 'image/webp'), [64, 80], true],
      ['an AVIF', fixture('avif', 'quad.avif', 'image/avif'), [64, 48], true],
      ['an animated GIF (its first frame)', fixture('gif', 'animated.gif', 'image/gif'), [40, 50], true],
      ['a BMP', bmp(64, 48), [64, 48], true],
      ['an ICO', fixture('ico', 'icon.ico', 'image/x-icon'), [48, 48], true],
      ['an SVG with a script, an outside style and outside images', svgImage(SVG_EVIL, 'evil.svg'), [100, 120], 'red'],
      ['a PNG with a script after its last chunk', { name: 'polyglot.png', mimeType: 'image/png', buffer: Buffer.concat([png64.buffer, Buffer.from('<script>window.__pwn=3</script>')]) }, [64, 48], true],
      ['a JPEG with 4 kB of garbage after it', { name: 'tail.jpg', mimeType: 'image/jpeg', buffer: Buffer.concat([jpg64.buffer, Buffer.alloc(4096, 0x41)]) }, [64, 48], true],
      ['a PNG with no extension and no type', { name: 'portrait', mimeType: '', buffer: png64.buffer }, [64, 48], true],
      ['a PNG called .txt, typed octet-stream', { name: 'photo.txt', mimeType: 'application/octet-stream', buffer: png64.buffer }, [64, 48], true],
    ];
    const bad = { not: [], size: [], color: [], said: [], kept: [] };
    for (const [what, file, [w, h], colors] of OPENS) {
      const r = await feed(page, file);
      if (r.how !== 'opened') { bad.not.push(`${what}: ${r.how} "${r.toast}"`); continue; }
      if (!r.label.endsWith(`${w} × ${h} px`)) bad.size.push(`${what}: ${r.label.slice(-24)} (wanted ${w} × ${h})`);
      const c = await corners(page);
      if (colors === true) { const got = ['TL', 'TR', 'BL', 'BR'].filter((k) => nameOf(c[k]) !== STORED[k]); if (got.length) bad.color.push(`${what}: ${got.map((k) => `${k}=${nameOf(c[k])}${JSON.stringify(c[k])}`).join(' ')}`); }
      else if (colors === 'red') { if (!['TL', 'TR', 'BL', 'BR'].every((k) => nameOf(c[k]) === 'red')) bad.color.push(`${what}: ${JSON.stringify([c.TL, c.BR])}`); }
      else if (!(c.TL[0] === c.TL[1] && c.TL[1] === c.TL[2] && c.BR[0] === c.BR[1])) bad.color.push(`${what}: not gray ${JSON.stringify(c.TL)}`);
      if (r.toast && GAVE_UP.test(r.toast)) bad.said.push(`${what}: ${r.toast}`);
    }
    t.check(!bad.not.length, 'formats: each of fifteen kinds of picture a browser opens is opened (the study is drawn)', bad.not);
    t.check(!bad.size.length, 'formats: each is shown at its own size in the label', bad.size);
    t.check(!bad.color.length, 'formats: each shows its four quarters in the right colours on the Photo canvas (CMYK, GIF, BMP, ICO, SVG and the rest decoded, not inverted or blank)', bad.color);
    t.check(!bad.said.length, 'formats: opening any of them says nothing odd', bad.said);
    t.check(await fr.evaluate(() => window.__pwn === undefined), 'formats: the script in the SVG and in the polyglot did not run');
    await clean(t, page, 'formats: pictures that open');

    // the ones that do not open: said in the site's voice, and the photo on show stays
    const pngBytes = (await quad(page, 300, 400, 'image/png', 'big.png')).buffer;
    const REFUSED = [
      ['a zero-byte .jpg', { name: 'empty.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) }, EMPTY],
      ['a zero-byte file with no type', { name: 'folder', mimeType: '', buffer: Buffer.alloc(0) }, EMPTY],
      ['a text file called .jpg', { name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a picture, whatever the name says') }, NOT_OPENED],
      ['a text file with no type', { name: 'notes', mimeType: '', buffer: Buffer.from('this is not a picture, whatever the name says') }, NOT_OPENED],
      ['a text file typed text/plain', textFile('notes.txt', 'plain words'), NOT_IMAGE],
      ['an HTML file with a script', { name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<script>window.__pwn=4</script><h1>hello</h1>') }, NOT_IMAGE],
      ['a PDF', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\n', 'binary') }, NOT_IMAGE],
      ['a video', { name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('\0\0\0\x18ftypmp42\0\0\0\0mp42isom', 'binary') }, NOT_IMAGE],
      ['a PNG signature and nothing else', { name: 'stub.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }, NOT_OPENED],
      ['a PNG with its first row of data damaged', { name: 'damaged.png', mimeType: 'image/png', buffer: Buffer.concat([pngBytes.subarray(0, 40), Buffer.alloc(30, 0xff), pngBytes.subarray(70)]) }, NOT_OPENED],
      ['a TIFF (no browser opens it)', fixture('tiff', 'scan.tiff', 'image/tiff'), NOT_OPENED],
    ];
    const keep = await feed(page, jpg64);
    const refused = [];
    for (const [what, file, say] of REFUSED) {
      await feed(page, { ...jpg64, name: 'before-' + file.name + '.jpg' }).catch(() => null);
      const lab0 = await labelOf(page);
      const r = await feed(page, file, { limit: 8000 });
      if (r.how === 'opened' && what === 'a TIFF (no browser opens it)') continue; // a browser that opens it is not wrong
      const ok = r.how === 'said' && say.test(r.toast) && r.label === lab0;
      if (!ok) refused.push(`${what}: ${r.how} "${r.toast}" label ${r.label === lab0 ? 'kept' : 'changed to ' + r.label.slice(0, 30)}`);
    }
    t.check(!refused.length, 'formats: each file that is not a picture, or is broken, is refused in the site\'s own words and the photo on show stays', refused);
    t.check(await fr.evaluate(() => window.__pwn === undefined) && (await usable(page)), 'formats: after eleven refusals nothing ran and the page is usable');
    await clean(t, page, 'formats: pictures that do not open');

    // a picture cut off half way, and one with its tail damaged: opened (partly) or refused, never a stuck page
    const cutAt = Math.floor(pngBytes.length * 0.6);
    for (const [what, file] of [['a PNG cut off 60% in', { name: 'cut.png', mimeType: 'image/png', buffer: pngBytes.subarray(0, cutAt) }], ['a JPEG cut off 60% in', { name: 'cut.jpg', mimeType: 'image/jpeg', buffer: (await quad(page, 300, 400, 'image/jpeg', 'x.jpg')).buffer.subarray(0, 700) }]]) {
      const r = await feed(page, file, { limit: 8000 });
      const fine = r.how === 'opened' || (r.how === 'said' && NOT_OPENED.test(r.toast));
      t.check(fine && (await busyDown(page, 5000)) && (await usable(page)), `formats: ${what} is opened or refused in words, and the page is not left busy`, r);
    }
    await clean(t, page, 'formats: cut-off pictures');

    // a drop of a WebP and a paste of a GIF, and the same two on Check my painting
    await resetToast(page);
    await dropItems(page, [fileItem(fixture('webp', 'dropped.webp', 'image/webp'))]);
    await fr.waitForFunction(() => document.getElementById('source').textContent.startsWith('dropped.webp') && document.getElementById('busy').hidden, null, { timeout: 15000 }).catch(() => null);
    t.check((await labelOf(page)).endsWith('64 × 80 px'), 'formats: a dropped WebP opens', await labelOf(page));
    await pasteItems(page, [fileItem(fixture('gif', 'pasted.gif', 'image/gif'))]);
    await fr.waitForFunction(() => document.getElementById('source').textContent.startsWith('pasted.gif') && document.getElementById('busy').hidden, null, { timeout: 15000 }).catch(() => null);
    t.check((await labelOf(page)).endsWith('40 × 50 px'), 'formats: a pasted GIF opens', await labelOf(page));
    await tab(page, 'study'); await app(page).evaluate(() => { location.hash = '#check'; });
    await sleep(400);
    const art = [];
    for (const [what, file, ok] of [['a CMYK JPEG', fixture('cmyk', 'my-painting.jpg', 'image/jpeg'), 'opened'], ['an SVG with a script', svgImage(SVG_EVIL, 'my-painting.svg'), 'opened'], ['a text file called .jpg', { name: 'mine.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('words') }, 'said'], ['a zero-byte file', { name: 'nothing.png', mimeType: 'image/png', buffer: Buffer.alloc(0) }, 'said']]) {
      const r = await feed(page, file, { selector: '#artFile', labelId: 'artSource', limit: 10000 });
      if (r.how !== ok || (ok === 'said' && !(NOT_OPENED.test(r.toast) || EMPTY.test(r.toast)))) art.push(`${what}: ${r.how} "${r.toast}"`);
    }
    t.check(!art.length, 'formats: Check my painting opens a CMYK JPEG and an SVG, and refuses a text file and a zero-byte file in words', art);
    t.check(await fr.evaluate(() => window.__pwn === undefined), 'formats: nothing ran from the painting slot either');
    await clean(t, page, 'formats: drop, paste and Check my painting');

    // An SVG with a foreignObject (text laid out by the browser, as drawing tools export it): Chromium marks the canvas
    // it is drawn on as tainted, and reading the pixels back throws. The photo slot and the painting slot are each tried on
    // a page of their own. Either the picture opens (its study drawn) or it is refused in words, and the page is left whole.
    for (const [slot, where, selector, labelId, canvasId, mark] of [['the photo', '', '#file', 'source', 'cv-orig', 'with-text.svg'], ['Check my painting', '#check', '#artFile', 'artSource', 'cv-art', 'with-caption.svg']]) {
      const fo = await open({ url: where });
      const ff = app(fo);
      const lab0 = await ff.evaluate((id) => document.getElementById(id).textContent.trim(), labelId);
      const r = await feed(fo, svgImage(SVG_FO, mark), { selector, labelId, limit: 8000 });
      await sleep(700);
      const st = await ff.evaluate(([id, cv]) => ({ spinner: !document.getElementById('busy').hidden, toast: document.getElementById('toast').textContent.trim(), label: document.getElementById(id).textContent.trim(), canvasW: (document.getElementById(cv) || {}).width }), [labelId, canvasId]);
      const errs = fo.log.pageerrors.splice(0);
      fo.log.console.length = 0;
      const opened = st.label.startsWith(mark), refusedInWords = st.label === lab0 && (NOT_OPENED.test(st.toast) || /SVG|picture|image/i.test(st.toast)) && !/Something went wrong/.test(st.toast);
      const whole = errs.length === 0 && !st.spinner && !/Something went wrong/.test(st.toast) && (opened || refusedInWords);
      t.check(whole, `formats: an SVG with a foreignObject given to ${slot} opens, or is refused in words, with no page error, no stuck "Updating…" and no "Something went wrong"`, { how: r.how, ...st, errors: errs.map((e) => e.split('\n')[0]) });
      if (!whole) t.finding({
        title: `An SVG with a foreignObject (text or HTML laid out by the browser, as Figma, draw.io and Inkscape export) breaks loading in ${slot}: a page error, "Something went wrong in the app", a spinner that never stops and a label that names a picture the studies do not show`,
        severity: 'medium',
        steps: `${slot === 'the photo' ? 'Study the photo: Load photo' : 'Open #check, Load a photo of your finished painting'} and choose an .svg file whose drawing holds a <foreignObject> (for example <svg xmlns="http://www.w3.org/2000/svg" width="100" height="120"><rect width="100" height="120" fill="red"/><foreignObject width="80" height="40"><div xmlns="http://www.w3.org/1999/xhtml">caption</div></foreignObject></svg>). Chromium; watch the page.`,
        expected: 'README, "To load a photo, use Load photo, drag it onto the page, or paste it": the picture opens, or the site says in words that it cannot use it ("This image could not be opened. ..."), and the previous photo and its label stay.',
        actual: `uncaught ${(errs[0] || '').split('\n')[0].slice(0, 130)}; toast "${st.toast.slice(0, 90)}"; the "Updating…" spinner ${st.spinner ? 'stays up for good' : 'is gone'}; the label reads "${st.label.slice(0, 40)}" while the ${canvasId} canvas is ${st.canvasW} px wide (the previous picture, not this one's 100). Loading any other photo recovers it.`,
        cause: slot === 'the photo'
          ? 'js/app.js:477 readImage accepts any image/* the browser decodes, SVG included, and hands the <img> on. js/app.js:566 useSource sets the label first; js/app.js:392-401 prepareAndRun calls Study.prepare inside requestAnimationFrame with no try/catch; js/processing.js:87-88 draws the SVG on a canvas and calls getImageData, which throws SecurityError because a foreignObject taints the canvas in Chromium. The throw leaves owed.prep set and els.busy shown (settleBusy is never reached), the label already changed and state.prep/the canvases still the old photo\'s.'
          : 'js/app.js:588 loadArtFile takes the same image; js/app.js:2371 alignArt draws it on a canvas and reads it back with getImageData, which throws SecurityError for a tainted canvas; the run never finishes, so the spinner stays and the score never comes.',
      });
      await clean(t, fo, `formats: an SVG with a foreignObject given to ${slot} (after what the check above took)`);
    }
  });

  // ====================================================================================================================
  // exif: a phone's JPEG is stored sideways and says so; every one of the eight turns is shown upright
  // ====================================================================================================================
  await seg.run('exif', async (open) => {
    const page = await open();
    const base = await quad(page, 96, 64, 'image/jpeg', 'base.jpg');
    // what each Orientation says about the stored picture's first row and first column (the Exif 2.3 table)
    const SIDES = { 1: ['top', 'left'], 2: ['top', 'right'], 3: ['bottom', 'right'], 4: ['bottom', 'left'], 5: ['left', 'top'], 6: ['right', 'top'], 7: ['right', 'bottom'], 8: ['left', 'bottom'] };
    const where = (o, r, c) => { const [rs, cs] = SIDES[o]; return o <= 4 ? (((rs === 'top') === (r === 0)) ? 'T' : 'B') + (((cs === 'left') === (c === 0)) ? 'L' : 'R') : (((cs === 'top') === (c === 0)) ? 'T' : 'B') + (((rs === 'left') === (r === 0)) ? 'L' : 'R'); };
    const upright = (o) => { const e = {}; for (const [r, c, color] of [[0, 0, 'red'], [0, 1, 'green'], [1, 0, 'blue'], [1, 1, 'yellow']]) e[where(o, r, c)] = color; return e; };
    const wrongOf = (c, want) => ['TL', 'TR', 'BL', 'BR'].filter((k) => nameOf(c[k]) !== want[k]).map((k) => `${k}=${nameOf(c[k])} (want ${want[k]})`);

    const bad = [];
    for (const little of [false, true]) {
      for (let o = 1; o <= 8; o++) {
        const name = `exif-${o}${little ? 'le' : 'be'}.jpg`;
        const r = await feed(page, withExif(base.buffer, o, { little, name }));
        const c = await corners(page), [W, H] = o >= 5 ? [64, 96] : [96, 64], wrong = wrongOf(c, upright(o));
        if (r.how !== 'opened' || !r.label.endsWith(`${W} × ${H} px`) || wrong.length) bad.push(`${name}: ${r.how} ${r.label.slice(-13)} ${wrong.join(' ')}`);
      }
    }
    t.check(!bad.length, 'exif: a JPEG stored in each of the eight Exif orientations, in both byte orders, is shown upright at its turned size', bad);
    await clean(t, page, 'exif: the eight orientations');

    // an Orientation no table has is no turn at all; a block whose length is wrong is opened (whatever it makes of it) or refused in words
    const odd = [];
    for (const [what, o, opts] of [['Orientation 0', 0, {}], ['Orientation 9', 9, {}], ['Orientation 255', 255, {}], ['Orientation 65535, little-endian', 65535, { little: true }]]) {
      const r = await feed(page, withExif(base.buffer, o, { ...opts, name: `exif-odd-${o}.jpg` }));
      const wrong = wrongOf(await corners(page), upright(1));
      if (r.how !== 'opened' || !r.label.endsWith('96 × 64 px') || wrong.length) odd.push(`${what}: ${r.how} ${r.label.slice(-13)} ${wrong.join(' ')}`);
    }
    t.check(!odd.length, 'exif: an Orientation outside 1 to 8 leaves the picture as it was stored', odd);
    const lies = [];
    for (const [what, skew] of [['a block that claims 6 bytes fewer than it holds', -6], ['a block that claims 50 bytes more', 50]]) {
      const r = await feed(page, withExif(base.buffer, 6, { skew, name: `exif-length${skew}.jpg` }), { limit: 8000 });
      if (!(r.how === 'opened' || (r.how === 'said' && NOT_OPENED.test(r.toast)))) lies.push(`${what}: ${r.how} "${r.toast}"`);
    }
    t.check(!lies.length && (await busyDown(page, 5000)) && (await usable(page)), 'exif: a JPEG whose Exif block lies about its length is opened or refused in words, and the page is left usable', lies);
    await clean(t, page, 'exif: odd orientations and lying blocks');

    // a 25-megapixel photo stored sideways: reduced to 2800 on its long side (README: nothing about the turn is lost), still upright
    const bigJpg = await quad(page, 6000, 4200, 'image/jpeg', 'big.jpg');
    const rb = await feed(page, withExif(bigJpg.buffer, 6, { name: 'big-exif6.jpg' }), { limit: 60000 });
    const wrongBig = wrongOf(await corners(page), upright(6));
    t.check(rb.how === 'opened' && rb.label.endsWith('1960 × 2800 px') && /^A very large photo \(4200 × 6000\) was reduced to 1960 × 2800 for speed\.$/.test(rb.toast) && !wrongBig.length, 'exif: a 25-megapixel JPEG stored sideways (Exif 6) is reduced to 1960 × 2800 and is upright', { how: rb.how, label: rb.label.slice(-16), toast: rb.toast, wrong: wrongBig });
    await clean(t, page, 'exif: a very large photo stored sideways');
  });

  // ====================================================================================================================
  // sizes: the smallest and the strangest shapes, and a picture with nothing in it
  // ====================================================================================================================
  await seg.run('sizes', async (open) => {
    const page = await open();
    const fr = app(page);
    const junk = () => fr.evaluate(() => { const hits = [], w = document.createTreeWalker(document.getElementById('tab-study'), NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { const p = n.parentElement; if (p && !p.closest('script,style,template') && p.getClientRects().length && /NaN|undefined|\[object|Infinity/.test(n.textContent)) hits.push(n.textContent.trim().slice(0, 50)); } return hits.slice(0, 5); });

    const small = [];
    for (const [w, h] of [[1, 1], [15, 15], [10000, 10], [10, 10000], [15, 400]]) {
      const lab0 = await labelOf(page);
      const r = await feed(page, await flatPng(page, w, h, '#a06040', `tiny-${w}x${h}.png`), { limit: 8000 });
      if (!(r.how === 'said' && TOO_SMALL.test(r.toast) && r.toast.includes(`(${w} × ${h} px)`) && r.label === lab0)) small.push(`${w} × ${h}: ${r.how} "${r.toast}"`);
    }
    t.check(!small.length, 'sizes: a picture under 16 px on a side (1 × 1, 15 × 15, a strip of 10 px) is refused in words, with its size, and the photo on show stays', small);

    const shapes = [];
    for (const [w, h] of [[16, 16], [10000, 200], [200, 10000], [4000, 16]]) {
      const r = await feed(page, await flatPng(page, w, h, '#a06040', `shape-${w}x${h}.png`), { limit: 30000 });
      const c = await corners(page), s = Math.min(1, 900 / Math.max(w, h)), want = [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
      const j = await junk();
      if (r.how !== 'opened' || !r.label.endsWith(`${w} × ${h} px`) || c.w !== want[0] || c.h !== want[1] || j.length) shapes.push(`${w} × ${h}: ${r.how} ${r.label.slice(-16)} canvas ${c.w} × ${c.h} (want ${want.join(' × ')}) ${j.join('|')}`);
    }
    t.check(!shapes.length, 'sizes: 16 × 16, a 10000 × 200 strip, a 200 × 10000 strip and 4000 × 16 open, are studied at the working size, and show no NaN or undefined', shapes);
    t.check((await busyDown(page, 5000)) && (await usable(page)), 'sizes: the page is usable after the strips');
    await clean(t, page, 'sizes: tiny and strips');

    // a picture with nothing in it: README "Transparent parts of a PNG ... are placed on mid gray"
    const clear = await flatPng(page, 100, 100, null, 'clear.png');
    const rc = await feed(page, clear);
    const cc = await corners(page);
    const grayish = (px) => Math.abs(px[0] - 127) <= 3 && Math.abs(px[1] - 127) <= 3 && Math.abs(px[2] - 127) <= 3;
    t.check(rc.how === 'opened' && ['TL', 'TR', 'BL', 'BR'].every((k) => grayish(cc[k])), 'sizes: a fully transparent PNG opens as mid gray (#7f7f7f) on the Photo canvas', { how: rc.how, cc });
    t.check((await junk()).length === 0 && !/NaN|undefined/.test(await fr.evaluate(() => document.getElementById('tab-study').innerText)), 'sizes: the studies of a flat gray picture show no NaN or undefined', await junk());
    const half = await fr.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 120; cv.height = 120; const g = cv.getContext('2d'); g.fillStyle = 'rgb(220,30,30)'; g.fillRect(0, 0, 60, 60); g.fillStyle = 'rgba(220,30,30,0.5)'; g.fillRect(60, 0, 60, 60); return cv.toDataURL('image/png'); });
    const rh = await feed(page, { name: 'half.png', mimeType: 'image/png', buffer: Buffer.from(half.split(',')[1], 'base64') });
    const ch = await corners(page);
    const near = (px, rgb, tol = 6) => px.every((v, i) => Math.abs(v - rgb[i]) <= tol);
    t.check(rh.how === 'opened' && near(ch.TL, [220, 30, 30]) && near(ch.TR, [174, 78, 78]) && grayish(ch.BL) && grayish(ch.BR), 'sizes: an opaque red, a half-transparent red and two transparent quarters read as red, red over gray, gray, gray', { how: rh.how, TL: ch.TL, TR: ch.TR, BL: ch.BL, BR: ch.BR });
    await clean(t, page, 'sizes: transparent pictures');

    // 12000 x 9000: 108 million pixels, a PNG of 1-bit stripes built here; reduced to 2800 on the long side
    const big = await open();
    let crashed = false;
    big.on('crash', () => { crashed = true; });
    const rb = await feed(big, stripedPng(12000, 9000, 'huge.png'), { limit: 120000 });
    t.check(!crashed && rb.how === 'opened' && rb.label.endsWith('2800 × 2100 px') && /^A very large photo \(12000 × 9000\) was reduced to 2800 × 2100 for speed\.$/.test(rb.toast), 'sizes: a 12000 × 9000 photo is reduced to 2800 × 2100 and said so, and the tab does not crash', { crashed, how: rb.how, label: rb.label.slice(-16), toast: rb.toast });
    t.check(!crashed && (await busyDown(big, 20000)) && (await usable(big)), 'sizes: the page is usable after the 108-megapixel photo');
    await clean(t, big, 'sizes: 12000 × 9000');
  });

  t.note(`segments: ${seg.timings.join('; ')}`);
}
