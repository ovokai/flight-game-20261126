// Ring Runner Air Race — the program that hands the game in (Node 22, standard library only).
//
// The game itself is the game/ folder beside this file: plain static files a desktop browser
// loads offline, no build step and no network. This program copies game/ and screenshots/
// into the output directory and writes dossier.json there with buildDossier from the vendored
// make.fun library, so the sealed scorer can check the hand-in and the judge can read it.
//
// In the grader the output directory is /output; anywhere else, MAKEFUN_OUTPUT_DIR names it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps the scorer itself enforces, passed to the dossier builder so a hand-in this program
// writes is one the scorer accepts: at most 4 screenshots of 256 KiB each, at most 993 files
// and 48 MiB under game/, no game path over 1,000 bytes, and the dossier's source text held to
// the same 160 KiB the judge's outline is drawn from.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
