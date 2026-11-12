import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { contained, evidence } from '../shared/store.js';
import type { Library } from '../release/library.js';
import type { Round, Run } from '../release/round.js';

export function releaseFixture(root: string, assignmentId: string) {
  const put = (path: string, value: unknown) => {
    const file = contained(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
    return evidence(root, path);
  };
  const basis = put('approved-settings.json', { requirement: 'A saved reporting route governs handoff delivery.' });
  const definition = put('shared-check.json', { steps: ['Save the route', 'Publish a reviewed handoff'], expected: 'The reviewed destination is used.' });
  const library: Library = {
    schemaVersion: 1, projectId: 'fixture',
    modules: [
      { id: 'settings', name: 'Settings', conditionIds: ['route'], testTypeIds: ['functional'] },
      { id: 'reporting', name: 'Reporting', conditionIds: ['route'], testTypeIds: ['api'] },
    ],
    testTypes: [{ id: 'functional', name: 'Functional' }, { id: 'api', name: 'API' }],
    conditions: [{ id: 'route', description: 'Saved route is honored', basis }],
    suites: [
      { id: 'settings-handoff', moduleId: 'settings', testTypeId: 'functional', checkIds: ['shared'] },
      { id: 'reporting-handoff', moduleId: 'reporting', testTypeId: 'api', checkIds: ['shared'] },
    ],
    checks: [{ id: 'shared', name: 'Handoff uses saved route', conditionIds: ['route'], definition }],
  };
  const target = { buildId: 'build-1', environment: 'staging' };
  const targetEvidence = put('target.json', { ...target, observedAt: '2026-01-01T00:00:00Z', source: 'Synthetic target observation' });
  const round: Round = {
    schemaVersion: 1, id: 'round-1', library: put('library-v1.json', library), target, assignmentIds: [assignmentId],
    scope: put('scope.json', { source: 'Synthetic reviewed scope' }),
    changes: put('changes.json', { change: 'Reporting routes use saved settings.' }),
    moduleIds: ['settings', 'reporting'],
    obligations: library.suites.map(suite => ({
      id: suite.id, moduleId: suite.moduleId, testTypeId: suite.testTypeId,
      conditionId: 'route', state: 'required', checkIds: ['shared'],
    })),
  };
  const roundRef = put('round.json', round);
  const run = (id: string, outcome: 'Pass' | 'Fail', previousRunId?: string): Run => ({
    schemaVersion: 1, id, round: roundRef, target,
    observedAt: previousRunId ? '2026-01-01T00:04:00Z' : '2026-01-01T00:02:00Z',
    targetEvidence, observations: [{ checkId: 'shared', conditionId: 'route', outcome, previousRunId, evidence: [put(`${id}-result.json`, { actual: outcome })] }],
  });
  return { put, library, round, roundRef, run, target };
}
