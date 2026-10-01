#!/usr/bin/env node
// Adds songs to the car radio: node tools/audio/radio.mjs <file> [<file> ...]
// Each file (mp3 / m4a / wav) is levelled to -14 LUFS, encoded as 160 kbps stereo mp3 into public/assets/radio/, and
// appended to tracks.json (a second take of the same title becomes "<title> (v2)"). The title is the file's own title
// tag, else its file name;
// the artist is always "ANATHEM (with Suno)". The game fetches none of it until the player turns the radio on.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public/assets/radio');
const ARTIST = 'ANATHEM (with Suno)';
const listFile = join(OUT, 'tracks.json');
const tracks = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf8')) : [];
const slug = (t) => t.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'track';

for (const src of process.argv.slice(2)) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=title', '-of', 'csv=p=0', src], { encoding: 'utf8' });
  const name = probe.stdout.trim() || basename(src, extname(src)).replace(/[_-]+/g, ' ').replace(/\s*\(\d+\)$/, '').trim(); // "Song (1)": a browser's second download
  let title = name;
  for (let k = 2; tracks.some((t) => t.title === title); k++) title = `${name} (v${k})`;
  const file = `${slug(title)}.mp3`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vn', '-map_metadata', '-1', '-af', 'loudnorm=I=-14:TP=-1.5',
    '-ar', '44100', '-ac', '2', '-b:a', '160k', '-metadata', `title=${title}`, '-metadata', `artist=${ARTIST}`, join(OUT, file)]);
  tracks.push({ file, title, artist: ARTIST });
  console.log(`${file}  ${title}`);
}
writeFileSync(listFile, JSON.stringify(tracks, null, 1) + '\n');
console.log(`tracks.json: ${tracks.length} tracks`);
