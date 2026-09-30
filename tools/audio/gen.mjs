#!/usr/bin/env node
// Generates the game's sounds with ElevenLabs from tools/audio/sounds.json into public/assets/audio/, then writes
// public/assets/audio/index.json (what src/audio/engine.js loads). Existing files are kept, so a re-run only fills gaps.
//
//   node tools/audio/gen.mjs                 generate what is missing
//   node tools/audio/gen.mjs --only a,b      (re)generate these ids only (overwrites)
//   node tools/audio/gen.mjs --index         rebuild index.json from the files on disk, no API calls
//
// Key: $ELEVENLABS_API_KEY, else the macOS keychain item ELEVENLABS_MACOS_LOCAL. Needs ffmpeg (trim + loudness).
// sounds.json: { voices: { name: voiceId }, groups: { <group>: [ entry ] } } where an entry is either
//   sfx   { id, prompt | prompts: [..], dur?, loop?, stereo?, n?, influence?, gain? }   (sound-generation API; n takes of one prompt)
//   voice { id, voice, lines: [text, ...], gain?, settings? }                     (text-to-speech, one file per line)
// Files land at <group>/<id>_<k>.mp3; `gain` is copied into the index for the mixer.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public/assets/audio');
const spec = JSON.parse(readFileSync(join(ROOT, 'tools/audio/sounds.json'), 'utf8'));
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? new Set(argv[argv.indexOf('--only') + 1].split(',')) : null;
const indexOnly = argv.includes('--index');

const key = () => process.env.ELEVENLABS_API_KEY
  || execFileSync('security', ['find-generic-password', '-s', 'ELEVENLABS_MACOS_LOCAL', '-w'], { encoding: 'utf8' }).trim();
let apiKey = null;

async function api(path, body) {
  apiKey ??= key();
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io${path}`, {
      method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const msg = await r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1))); continue; }
    throw new Error(`${path} ${r.status}: ${msg.slice(0, 300)}`);
  }
}

// Levelling, so the mixer's gains mean the same thing for every file: loops and speech by loudness (EBU R128); short
// one-shots by peak (loudnorm needs ~3 s of material and pumps anything shorter). One-shots and speech start on the
// sound (the lead-in silence is cut after levelling); loops keep their exact length so the seam stays clean.
function peakOf(f) {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr; // the stats go to stderr
  return +(/max_volume: (-?[\d.]+) dB/.exec(out)?.[1] ?? 0);
}
function finish(raw, dst, { loop, mono, speech }) {
  const tmp = dst + '.raw.mp3';
  writeFileSync(tmp, raw);
  let af;
  if (loop) af = 'loudnorm=I=-24:TP=-3';
  else if (speech) af = 'loudnorm=I=-18:TP=-1.5,silenceremove=start_periods=1:start_threshold=-50dB';
  else af = `volume=${(-3 - peakOf(tmp)).toFixed(1)}dB,silenceremove=start_periods=1:start_threshold=-40dB`;
  const enc = (filters) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-af', filters, '-ar', '44100', '-ac', mono ? '1' : '2',
    '-b:a', mono ? '96k' : '128k', dst]);
  enc(af);
  // a take that is quiet all the way through loses everything to the trim: keep it untrimmed instead
  if (!(duration(dst) > 0.05)) enc(af.replace(/,silenceremove=[^,]*/, ''));
  rmSync(tmp);
}

async function gen(group, e) {
  const dir = join(OUT, group); mkdirSync(dir, { recursive: true });
  const jobs = e.lines
    ? e.lines.map((text, k) => ({ k, make: () => api(`/v1/text-to-speech/${spec.voices[e.voice] || e.voice}?output_format=mp3_44100_128`, {
      text, model_id: e.model || 'eleven_v3', language_code: 'uk',
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, ...e.settings },
    }) }))
    : (e.prompts || Array(e.n || 1).fill(e.prompt)).map((prompt, k) => ({ k, make: () => api('/v1/sound-generation?output_format=mp3_44100_128', {
      text: prompt, model_id: 'eleven_text_to_sound_v2', loop: !!e.loop,
      ...(e.dur ? { duration_seconds: e.dur } : {}), prompt_influence: e.influence ?? 0.5,
    }) }));
  for (const j of jobs) {
    const dst = join(dir, `${e.id}_${j.k}.mp3`);
    if (existsSync(dst) && !only) continue;
    process.stdout.write(`${group}/${e.id}_${j.k} … `);
    finish(await j.make(), dst, { loop: !!e.loop, mono: !e.stereo, speech: !!e.lines });
    console.log('ok');
  }
}

function duration(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' });
  return +r.stdout.trim() || 0;
}

if (!indexOnly) {
  for (const [group, list] of Object.entries(spec.groups)) {
    for (const e of list) {
      if (only && !only.has(e.id)) continue;
      try { await gen(group, e); } catch (err) { console.error(`\n${group}/${e.id}: ${err.message}`); process.exitCode = 1; }
    }
  }
}

// index: id -> { g: group, n: files, d: [durations], gain, loop, text? } (text for the voice lines: subtitles / debugging)
const index = {};
for (const [group, list] of Object.entries(spec.groups)) {
  const dir = join(OUT, group);
  const files = existsSync(dir) ? readdirSync(dir) : [];
  for (const e of list) {
    const mine = files.filter((f) => f.startsWith(e.id + '_') && /^\d+\.mp3$/.test(f.slice(e.id.length + 1))).sort((a, b) => parseInt(a.slice(e.id.length + 1)) - parseInt(b.slice(e.id.length + 1)));
    if (!mine.length) continue;
    index[e.id] = { g: group, n: mine.length, d: mine.map((f) => Math.round(duration(join(dir, f)) * 100) / 100), gain: e.gain ?? 1, ...(e.loop ? { loop: true } : {}), ...(e.lines ? { text: e.lines } : {}) };
  }
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log(`index.json: ${Object.keys(index).length} sounds`);
