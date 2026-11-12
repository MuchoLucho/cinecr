import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.resolve(__dirname, '../src/data/movies-data.json');

assert.ok(fs.existsSync(dataFile), 'movies-data.json should exist');

const movies = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
assert.ok(Array.isArray(movies) && movies.length > 0, 'Movies list should not be empty');

const chainsFound = new Set();
let totalShowtimes = 0;

for (const m of movies) {
  assert.ok(m.title, `Movie missing title: ${JSON.stringify(m)}`);
  assert.ok(m.rating, `Movie missing rating: ${m.title}`);
  assert.ok(Array.isArray(m.theaters), `Movie missing theaters: ${m.title}`);

  for (const t of m.theaters) {
    assert.ok(['cinemark', 'cinepolis', 'ccm'].includes(t.chainId), `Invalid chainId ${t.chainId} in ${t.complexName}`);
    chainsFound.add(t.chainId);
    assert.ok(t.complexName, `Missing complexName in ${m.title}`);
    assert.ok(t.province, `Missing province in ${t.complexName}`);
    assert.ok(Array.isArray(t.groups), `Missing groups in ${t.complexName}`);

    for (const g of t.groups) {
      assert.ok(g.format, `Missing format in ${t.complexName}`);
      assert.ok(['SUB', 'DOB'].includes(g.language), `Invalid language ${g.language} in ${t.complexName}`);
      assert.ok(Array.isArray(g.times) && g.times.length > 0, `Empty times in group for ${t.complexName}`);

      totalShowtimes += g.times.length;

      // Verify chronological sorting
      for (let i = 1; i < g.times.length; i++) {
        const prev = g.times[i - 1];
        const curr = g.times[i];
        const prevKey = `${prev.date} ${prev.time}`;
        const currKey = `${curr.date} ${curr.time}`;
        assert.ok(prevKey <= currKey, `Showtimes not sorted chronologically: ${prevKey} > ${currKey} in ${m.title} at ${t.complexName}`);
      }
    }
  }
}

assert.ok(chainsFound.has('cinemark'), 'Cinemark showtimes must be present');
assert.ok(chainsFound.has('cinepolis'), 'Cinépolis showtimes must be present');
assert.ok(chainsFound.has('ccm'), 'CCM Cinemas showtimes must be present');
assert.ok(totalShowtimes > 100, `Expected > 100 showtimes, got ${totalShowtimes}`);

console.log(`✓ Verification passed: ${movies.length} movies, ${chainsFound.size} chains (${[...chainsFound].join(', ')}), ${totalShowtimes} showtimes verified.`);
