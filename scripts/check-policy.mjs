// Fails if any copy of the Content Security Policy differs from the others, if the
// @font-face rules live anywhere but fonts.css, or if a third-party origin creeps
// back into a served page. Run: node scripts/check-policy.mjs
import { readFileSync } from 'node:fs';
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

if (failed) process.exit(1);
console.log('PASS: all CSP copies identical, fonts only in fonts.css, no third-party origins');
