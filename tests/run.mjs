// Runs the cases in tests/cases/ (each exports `default async (t, site) => {}`), every case against its
// own server and browser, and prints what failed and what was found. Exit code 1 when a check failed.
//   node tests/run.mjs                       every case
//   node tests/run.mjs --only smoke,pose     some
//   node tests/run.mjs --root /path/to/export   the site from another folder (a git archive export)
//   node tests/run.mjs --timeout 600000      per case, in ms (default 15 min)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withSite, checker, ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const only = (opt('--only', '') || '').split(',').filter(Boolean);
const root = path.resolve(opt('--root', process.env.PVS_ROOT || ROOT));
const timeout = +opt('--timeout', 15 * 60 * 1000);
const dir = path.join(ROOT, 'tests', 'cases');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort().filter((f) => !only.length || only.includes(f.replace(/\.mjs$/, '')));
if (!files.length) { console.error('no cases match'); process.exit(2); }

const report = { root, started: new Date().toISOString(), cases: [] };
let failed = 0;
for (const f of files) {
  const name = f.replace(/\.mjs$/, '');
  const t = checker(name);
  const t0 = Date.now();
  process.stdout.write(`\n== ${name} ==\n`);
  let error = null;
  try {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    await Promise.race([
      withSite({ root }, (site) => mod.default(t, site)),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`case timed out after ${timeout} ms`)), timeout)),
    ]);
  } catch (e) {
    error = String(e && e.stack || e).slice(0, 1200);
    t.check(false, 'the case ran to its end', error.split('\n')[0]);
  }
  const bad = t.checks.filter((c) => !c.ok);
  failed += bad.length;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`   ${t.checks.length - bad.length}/${t.checks.length} checks passed, ${t.findings.length} finding${t.findings.length === 1 ? '' : 's'}, ${secs} s\n`);
  report.cases.push({ name, seconds: +secs, checks: t.checks, findings: t.findings, notes: t.notes, error });
}
report.finished = new Date().toISOString();
fs.mkdirSync(path.join(ROOT, 'tests', 'screens'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests', 'report.json'), JSON.stringify(report, null, 1));

const all = report.cases.flatMap((c) => c.checks);
const findings = report.cases.flatMap((c) => c.findings.map((f) => ({ case: c.name, ...f })));
process.stdout.write(`\n${all.length - failed}/${all.length} checks passed across ${report.cases.length} case${report.cases.length === 1 ? '' : 's'}; ${findings.length} finding${findings.length === 1 ? '' : 's'}. Report: tests/report.json\n`);
if (failed) {
  process.stdout.write('\nFailed checks:\n');
  for (const c of report.cases) for (const k of c.checks) if (!k.ok) process.stdout.write(`  ${c.name}: ${k.title}${k.detail ? ' — ' + k.detail.slice(0, 200) : ''}\n`);
}
if (findings.length) {
  process.stdout.write('\nFindings:\n');
  for (const f of findings) process.stdout.write(`  [${f.severity}] ${f.case}: ${f.title}\n`);
}
process.exit(failed ? 1 : 0);
