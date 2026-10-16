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
//   foreign    postMessage from another origin (a page framing the app, and the app's frames) to the app, the Pose page
//              and Figure study's drawing frame; and a frame that sends the app hostile lists
//   storage    junk of types and shapes the other cases do not deal, under every key the site reads
//   database   a corrupt painting in IndexedDB of kinds the other cases do not write
//   fields     the paint search and the canvas length, typed hostile
// HOSTILE_ONLY=names,formats runs some segments only.
import zlib from 'node:zlib';
import { openPage, clean, tab, app, poseFrame, renderFrame, makeImage, textFile, brokenImage, svgImage, sleep, click, hscroll, storageGet, violations, DESKTOP, PHONE } from '../lib.mjs';

const ONLY = (process.env.HOSTILE_ONLY || '').split(',').filter(Boolean);

// ---- what the site says, and what it must never say -----------------------------------------------------------------------------
const NOT_IMAGE = /^That file is not an image\. Choose a JPG, PNG or WebP photo\.$/;
const EMPTY = /^That is an empty file or a folder\. Choose a JPG, PNG or WebP photo\.$/;
const NOT_OPENED = /^This image could not be opened\. HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first\.$/;
const TOO_SMALL = /^That picture is too small to study \(\d+ × \d+ px\): it needs at least 16 px on each side\.$/;
const GAVE_UP = /undefined|NaN|\[object|\bnull\b|Error\b|Exception|TypeError|DOMException|\bat https?:|stack|Infinity/;

// ---- fixtures ----------------------------------------------------------------------------------------------------------------------
// small files made once with PIL / ImageMagick, 2 to 8 kB at most: red top left, green top right, blue bottom left, yellow bottom right
const B64 = {
  cmyk: '/9j/7gAOQWRvYmUAZAAAAAAA/9sAhAAIBQUFBgUIBgYIDQcHBw0QCwsLCxAUDw8PDw8UEQwMDAwMDBERDAwMDAwMEQwMDAwMDAwMDAwMDAwMDAwMDAwMDAwBCQcHCQoJCwkJCw0LCwsNDQ0NDQ0NEQwMDAwMEREMDAwMDAwRDAwMDAwMDAwMDAwMDAwMDAwMDAwMDP/AABEIADAAQAMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+hEAAgEDAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDARECEQA/APkqg0AKAP/Z',
  gif: 'R0lGODlhKAAyAPEAANwe' + 'HgDIAB4eHt7e3QAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJZAAAACwAAAAAKAAyAAACbowDmcfNDGJqDLE2NNU7sTBy3yeGpQk+aKSq1QpyEOvG6Nu2cUXOcKnTLb1SKjoD4XVXZ2mAWEcqxEmqQFeuKWvF5H2PJ0FSH6+4S7eI4QfCfoSskdFm0M0eZxXH3cPWsHVLPlZX5TLXZoXdIYh4qNhoUQAAIfkECWQAAAAsAAAAACgAMgAAAhKMj6nL7Q+jnLTai7PevPsPLgUAOw==',
  webp: 'UklGRpAAAABXRUJQVlA4IIQAAADQBACdASpAAFAAPm00mUckIyIhKAgAgA2JaW7hdgBMAf4w4ULKNJBZGrw7UqE6sBbhmvgAx0mGzvLCH+AZrnxe/w0MSeBbBmrMxj/7VNkXnsB9Fb3kmUSZFf+l+iiqt6l/UQoDPL3CAXZb7NdI+Y33AZoW99EBYDBDXjBYiyA6iIb6Ogg4YIhpxf4KEAAA',
  gray: '/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAwAEADASIAAhEBAxEB/8QBogAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoLEAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+foBAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKCxEAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDz2iiigD//2Q==',
  prog: '/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAwAEADASIAAhEBAxEB/8QBogAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoLEAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+foBAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKCxEAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDz2iiigD//2Q==',
};
