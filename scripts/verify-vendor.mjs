// SPDX-License-Identifier: Apache-2.0
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join, relative} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root,'vendor/PROVENANCE.json'),'utf8'));
if (manifest.schema !== 'street-racer-vendor-v1' || !Array.isArray(manifest.files)) throw new Error('Unsupported vendor manifest');
const expected = new Set(), repositories = new Set();
for (const file of manifest.files) {
  if (!/^QSOLKCB\/[A-Z0-9_]+$/.test(file.repository) || !/^[a-f0-9]{40}$/.test(file.commit) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.source !== 'string' ||
      !/^vendor\/[a-z0-9-]+\/[A-Za-z0-9_./-]+$/.test(file.local) || file.local.split('/').includes('..') ||
      expected.has(file.local)) throw new Error(`Invalid vendor entry: ${file.local}`);
  const data = readFileSync(join(root,file.local));
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual !== file.sha256) throw new Error(`Pinned donor bytes changed: ${file.local}`);
  expected.add(file.local); repositories.add(file.repository);
}
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir,name);
    if (statSync(path).isDirectory()) walk(path);
    else {
      const rel = relative(root,path).replaceAll('\\','/');
      if (rel !== 'vendor/PROVENANCE.json' && !expected.has(rel)) throw new Error(`Unrecorded vendor file: ${rel}`);
    }
  }
}
walk(join(root,'vendor'));
for (const repo of ['VANILLAJS','E8_MUSIC','SONIFICATION','GAMES','ARCADE']) {
  if (!repositories.has(`QSOLKCB/${repo}`)) throw new Error(`Missing donor: ${repo}`);
}
console.log(`PASS: ${expected.size} pinned donor files from ${repositories.size} repositories; SHA-256 and complete inventory verified.`);
