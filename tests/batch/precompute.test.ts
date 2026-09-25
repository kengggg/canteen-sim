import { readFileSync } from 'node:fs';
import { defaultConfig } from '../../src/config/schema';
import { decodeEvidence, encodeEvidence, type Evidence } from '../../src/batch/precompute';
import { aggregate, runJob } from '../../src/batch/runner';
import { reservationJobs } from '../../src/batch/sweep';
import { MODEL_VERSION } from '../../src/sim/version';

test('evidence round-trips: decoded statistics equal the direct aggregation (7 significant digits)', () => {
  const c = defaultConfig();
  c.crowd.totalPeople = 300;
  const jobs = reservationJobs(c, 3);
  const b = aggregate('reservation', jobs, jobs.map(runJob));
  const ev = JSON.parse(JSON.stringify(encodeEvidence(b, c))) as Evidence;
  const d = decodeEvidence(ev);
  for (const id of ['walkAwayPct', 'entranceToSeatMeanMin', 'peakUtilization', 'peakThroughputPerHour', 'queueWaitMeanMin']) {
    for (const f of [0.25, 1]) {
      const x = b.stats.find((s) => s.metricId === id && s.fraction === f)!.adv;
      const y = d.stats.find((s) => s.metricId === id && s.fraction === f)!.adv;
      expect(y.nUsed).toBe(x.nUsed);
      if (x.mean === null) expect(y.mean).toBeNull();
      else expect(Math.abs(y.mean! - x.mean)).toBeLessThanOrEqual(1e-5 * Math.max(1, Math.abs(x.mean)));
    }
  }
  expect(d.runs.map((r) => r.hash)).toEqual(b.runs.map((r) => r.hash));
});

test('the shipped evidence is current: model version, size, and fresh runs reproduce sampled hashes', () => {
  const ev = JSON.parse(readFileSync(new URL('../../src/generated/evidence.json', import.meta.url), 'utf8')) as Evidence;
  expect(ev.model).toBe(MODEL_VERSION);
  expect(ev.runs).toHaveLength(150);
  expect(ev.pairs).toHaveLength(120);
  expect(ev.settings).toEqual(defaultConfig());
  const jobs = new Map(reservationJobs(defaultConfig(), 30).map((j) => [j.key, j]));
  for (const r of [ev.runs[0], ev.runs[40], ev.runs[77], ev.runs[110], ev.runs[149]]) expect(runJob(jobs.get(r.k)!).hash).toBe(r.h);
}, 60_000);
