// Token Radar -- a make.fun token-radar-01 entry (Node 22, standard library only, no dependencies).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// candidate pre-token protocol with the model in lib/model.ts, writes the ranked board to
// /output/board.json, writes the dashboard's dataset to /output/data.js, copies this repository's
// dashboard/ and screenshots/ into /output, and last writes /output/dossier.json with the vendored
// buildDossier -- the summary the judge reads.
//
// The dashboard itself is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read window.RADAR from ../data.js.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot, SnapshotError } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (RULES.txt's gate): the text cap shapes the dossier's bytes, the rest only refuse. */
const DOSSIER_TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const PLAIN_FILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value after --<name> or --<name>=<value> in argv, else `fallback`. */
function argValue(name: string, fallback: string): string {
  const flag = `--${name}`;
  const at = process.argv.indexOf(flag);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const inlined = process.argv.find((a) => a.startsWith(`${flag}=`));
  return inlined === undefined ? fallback : inlined.slice(flag.length + 1);
}

function fail(message: string, code: number): never {
  process.stderr.write(`token-radar: ${message}\n`);
  process.exit(code);
}

const inputArg = argValue('input', '/input');
const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(`no snapshot at ${snapshotPath} -- pass --input <snapshot.json|directory>, or mount the sealed /input`, 2);
}

const outputDir = argValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

let snapshotText: string;
try {
  snapshotText = readFileSync(snapshotPath, 'utf8');
} catch (err) {
  fail(`cannot read ${snapshotPath}: ${(err as Error).message}`, 2);
}

let board;
let radar;
try {
  const snapshot = parseSnapshot(snapshotText);
  ({ board, radar } = buildRadar(snapshot));
  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`the model produced a board the gate would refuse: ${issue}`, 1);
} catch (err) {
  if (err instanceof SnapshotError) fail(`${snapshotPath}: ${err.message}`, 2);
  throw err;
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

/** Every regular, non-dotfile entry of `from` copied flat into `to` (made if absent); the names copied. */
function copyFlat(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const entry of readdirSync(from)) {
    if (entry.startsWith('.')) continue;
    const src = join(from, entry);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, entry));
    names.push(entry);
  }
  return names;
}

copyFlat(join(repoRoot, 'dashboard'), join(outputDir, 'dashboard'));
const screenshotNames = copyFlat(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
if (screenshotNames.length < 3) {
  fail(`screenshots/ holds ${screenshotNames.length} image${screenshotNames.length === 1 ? '' : 's'} -- the gate wants 3 to 4: the board, a detail view and a filtered view`, 1);
}
for (const name of screenshotNames) {
  if (!PLAIN_FILE_NAME.test(name)) fail(`screenshots/${name}: a screenshot's name is letters, digits and . _ -, 1 to 128 characters`, 1);
}

// The dossier goes last: the scorer rebuilds it from this /output and compares it byte for byte.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

process.stdout.write(
  `token-radar: ${radar.rows.length} rows scored (${radar.watchlist_size} on the watchlist, ${radar.outside_watchlist_size} beyond its floor), ${radar.live.length} live-token protocols set aside\n` +
    `token-radar: wrote ${join(outputDir, 'board.json')}, ${join(outputDir, 'data.js')}, ${join(outputDir, 'dashboard')} (${screenshotNames.length === 0 ? '0' : 'see dashboard/'}), ${join(outputDir, 'screenshots')} (${screenshotNames.length} images) and ${join(outputDir, 'dossier.json')}\n`,
);
