// Prepare public catalog assets only; never export user photos, cloned voices or credentials.
// node --env-file=.env.local --experimental-strip-types scripts/prepare-spoken-public-assets.mjs <output-dir>
import path from 'node:path';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { listPeoplePortraits } from '../src/lib/digital-human/people-portrait-library.ts';

const destination = process.argv[2];
if (!destination || destination.startsWith('--')) throw new Error('An empty output directory is required');
const root = path.resolve(destination);
try { await access(root); throw new Error('Output already exists; use a new directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(root, { recursive: true });
const files = [];
async function save(relative, bytes) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
  files.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const portraits = await listPeoplePortraits();
const photoRoot = 'research/provider-scene-catalog/2026-08-27';
if (process.argv.includes('--voices')) throw new Error('Template voices have been retired; only public photos are exported');
const source = JSON.parse(await readFile(path.join(photoRoot, 'chanjing/public-digital-humans.json'), 'utf8'));
const selected = new Map(portraits.map(p => [p.id, p]));
const seen = new Set();
const people = [];
for (const person of source.items || []) {
  const portrait = selected.get(`${person.id}-0`);
  if (!portrait || seen.has(person.id)) continue;
  seen.add(person.id);
  const figure = person.figures[0];
  const relative = figure.downloaded_cover.file;
  await save(`${photoRoot}/${relative}`, await readFile(portrait.filePath));
  // Strip remote URLs and unrelated provider metadata from the deployable catalog.
  people.push({ id: person.id, name: person.name, gender: person.gender, tag_names: person.tag_names,
    figures: [{ type: figure.type, downloaded_cover: { file: relative } }] });
}
await save(`${photoRoot}/chanjing/public-digital-humans.json`, Buffer.from(JSON.stringify({ items: people })));
const voiceCount = 0;
const manifest = { schemaVersion: 1, publicOnly: true, portraits: people.length, voices: voiceCount, files };
const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(root, 'manifest.json'), bytes);
await writeFile(path.join(root, 'manifest.sha256'), files.map(f => `${f.sha256}  ${f.path}`).join('\n') + '\n');
console.log(JSON.stringify({ root, portraits: people.length, voices: voiceCount, files: files.length, bytes: files.reduce((n,f)=>n+f.bytes,0), manifestSha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
