// Storm Runner — the program that hands this game in to make.fun.
//
// It stages the entry in the output directory: the static game folder and
// the screenshots folder are copied beside this file into /output (or
// $MAKEFUN_OUTPUT_DIR when set, for a local run), and /output/dossier.json
// is written with the kit's buildDossier, which is the summary the sealed
// scorer and the judge read. Node 22, standard library only; nothing here
// talks to the network.
//
// Local check:
//   mkdir -p /tmp/sr-out && MAKEFUN_OUTPUT_DIR=/tmp/sr-out node main.ts

import { mkdirSync, readdirSync, statSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    const info = statSync(src);
    if (info.isDirectory()) copyTree(src, dst);
    else if (info.isFile()) copyFileSync(src, dst);
  }
}

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

const gameDir = join(repoRoot, 'game');
const shotDir = join(repoRoot, 'screenshots');
if (!statSync(gameDir, { throwIfNoEntry: false })?.isDirectory()) fail('game/ is missing');
if (!statSync(join(gameDir, 'index.html'), { throwIfNoEntry: false })?.isFile()) fail('game/index.html is missing');
if (!statSync(shotDir, { throwIfNoEntry: false })?.isDirectory()) fail('screenshots/ is missing');

const shots = readdirSync(shotDir).filter((n) => !n.startsWith('.')).sort();
if (shots.length < 3 || shots.length > 4) fail(`expected 3 or 4 screenshots, found ${shots.length}`);

mkdirSync(outDir, { recursive: true });
copyTree(gameDir, join(outDir, 'game'));
copyTree(shotDir, join(outDir, 'screenshots'));

// The scorer's own caps, from the kit's gate: only text_max_bytes shapes
// the dossier bytes; the rest refuse an entry the scorer would refuse
// (more than 4 screenshots or one over 256 KiB; game/ over 993 entries or
// 48 MiB in all; any game/ path over 1000 bytes).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Storm Runner staged: ${shots.length} screenshots, dossier ${dossier.length} bytes -> ${outDir}`);
