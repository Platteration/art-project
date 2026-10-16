// Fails if any copy of the Content Security Policy differs from the others, if the
// @font-face rules live anywhere but fonts.css, if a third-party origin creeps back
// into a served page, or if a page or script holds something the policy refuses
// (an inline style or script, a string turned into markup). Run: node scripts/check-policy.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const meta = (file) => {
  const m = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(read(file));
  if (!m) throw new Error(`${file}: no CSP meta found`);
  return m[1];
};
const headerLine = (file, re) => {
  const m = re.exec(read(file));
  if (!m) throw new Error(`${file}: no CSP header found`);
  return m[1];
};

const copies = {
  'index.html': meta('index.html'),
  'pose.html': meta('pose.html'),
  '404.html': meta('404.html'),
  '_headers': headerLine('_headers', /Content-Security-Policy:\s*(.+)/),
  '.htaccess': headerLine('.htaccess', /Content-Security-Policy "([^"]+)"/),
  'deploy/nginx.conf': headerLine('deploy/nginx.conf', /Content-Security-Policy "([^"]+)"/),
  'README.md': headerLine('README.md', /\| `Content-Security-Policy` \| `([^`]+)` \|/),
};

let failed = false;
const norm = (s) => s.trim().replace(/\s+/g, ' ');
const distinct = [...new Set(Object.values(copies).map(norm))];
for (const [file, policy] of Object.entries(copies)) {
  console.log(`${file}: sha1 ${createHash('sha1').update(norm(policy)).digest('hex').slice(0, 8)}`);
}
if (distinct.length !== 1) {
  console.error(`FAIL: ${distinct.length} different CSP copies`);
  failed = true;
}

for (const file of ['styles.css', 'pose.css']) {
  if (read(file).includes('@font-face')) {
    console.error(`FAIL: @font-face found in ${file} (fonts.css is the only home)`);
    failed = true;
  }
}
if (!read('fonts.css').includes('@font-face')) {
  console.error('FAIL: fonts.css has no @font-face rules');
  failed = true;
}

for (const file of ['index.html', 'pose.html', '404.html', 'styles.css', 'pose.css', 'fonts.css']) {
  if (/googleapis|gstatic|cdnjs\.cloudflare/.test(read(file))) {
    console.error(`FAIL: third-party origin referenced in ${file}`);
    failed = true;
  }
}

for (const file of ['styles.css', 'pose.css', 'fonts.css']) {
  if (/url\(\s*["']?data:/i.test(read(file))) { console.error(`FAIL: data: URL in ${file} (img-src refuses data: pictures)`); failed = true; }
}

// What the policy refuses must not be in the pages or scripts: an inline style attribute or script
// (style-src / script-src 'self'), and a string turned into markup (Trusted Types with no policy).
for (const file of ['index.html', 'pose.html', '404.html']) {
  const html = read(file);
  if (/\sstyle="/.test(html)) { console.error(`FAIL: inline style attribute in ${file}`); failed = true; }
  if (/<script(?![^>]*\ssrc=)[^>]*>/.test(html) || /<style[\s>]/.test(html)) { console.error(`FAIL: inline <script> or <style> in ${file}`); failed = true; }
  if (/\son[a-z]+="/.test(html)) { console.error(`FAIL: inline event handler in ${file}`); failed = true; }
}
for (const file of readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'))) {
  const js = read(`js/${file}`);
  const m = /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|document\.write|createContextualFragment|\beval\(|new Function\(/.exec(js);
  if (m) { console.error(`FAIL: ${m[0]} in js/${file} (refused by the policy: build nodes instead)`); failed = true; }
}

if (failed) process.exit(1);
console.log('PASS: all CSP copies identical, fonts only in fonts.css, no third-party origins');
