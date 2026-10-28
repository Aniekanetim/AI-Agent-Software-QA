import { assertNonsecret, requireText, verifyEvidence, type Evidence } from '../shared/store.js';

export interface Feature {
  id: string; name: string; kind: 'feature' | 'component' | 'external'; state: 'active' | 'retired';
  replacementId?: string; references: Evidence[]; testLinkIds: string[]; gaps: string[];
}
export interface TestLink {
  id: string; kind: 'requirement' | 'risk' | 'condition' | 'check' | 'charter'; reference: Evidence;
}
export interface Relationship {
  id: string; from: string; to: string;
  type: 'navigation' | 'prerequisite' | 'data' | 'state' | 'permission' | 'request' | 'event' | 'sharedDependency';
  state: 'active' | 'needsReview' | 'retired'; replacementId?: string;
  transfer: string; applicability: string; recovery: string;
  intended: { state: 'accepted' | 'proposed' | 'unknown'; references: Evidence[] };
  observed: { state: 'observed' | 'notObserved' | 'unknown'; evidence: Evidence[]; environment: string | null; build: string | null; observedAt: string | null };
  inference: string | null; discrepancy: string | null; gaps: string[]; refreshWhen: string; testLinkIds: string[];
}
export interface FlowMapSnapshot {
  schemaVersion: 1; mapId: string; revision: string; targetBuild: string | null;
  sourceRecords: Evidence[]; features: Feature[]; relationships: Relationship[]; testLinks: TestLink[];
}
export interface MapIssue { kind: 'map' | 'feature' | 'relationship' | 'testLink'; id: string; reason: string }
export type Direction = 'upstream' | 'downstream' | 'both';

function ensure(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  ensure(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
}
function array(value: unknown, label: string): asserts value is unknown[] { ensure(Array.isArray(value), `${label} must be an array.`); }
function strings(value: unknown, label: string) {
  array(value, label); value.forEach(item => requireText(item, label));
  ensure(new Set(value).size === value.length, `${label} contains duplicates.`);
}
function nullableText(value: unknown, label: string) { if (value !== null) requireText(value, `${label}; use null when unknown`); }
function timestamp(value: unknown) {
  requireText(value, 'Observation time');
  ensure(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), 'Observation time needs an actual date/time and timezone.');
}

/** Validate a projection of canonical records. No writes, network calls, approvals or test execution. */
export function validateFlowMap(root: string, map: FlowMapSnapshot) {
  object(map, 'Map snapshot'); assertNonsecret(map);
  ensure(map.schemaVersion === 1, 'Unsupported map snapshot; preserve and migrate it explicitly.');
  requireText(map.mapId, 'Map ID'); requireText(map.revision, 'Map revision'); nullableText(map.targetBuild, 'Target build');
  array(map.features, 'Features'); array(map.relationships, 'Relationships'); array(map.testLinks, 'Test links'); array(map.sourceRecords, 'Source records');
  ensure(map.features.length <= 2000 && map.relationships.length <= 10000 && map.testLinks.length <= 10000, 'Snapshot exceeds read-only helper limits; use a documented area view.');
  if (map.features.length || map.relationships.length || map.testLinks.length) ensure(map.sourceRecords.length, 'A populated snapshot requires canonical source-record references.');
  const issues: MapIssue[] = [], ids = new Set<string>();
  function identity(id: string) {
    requireText(id, 'Stable ID'); ensure(!ids.has(id), `Duplicate map ID ${id}.`); ids.add(id);
  }
  function references(refs: Evidence[], kind: MapIssue['kind'], id: string) {
    array(refs, 'Evidence references');
    for (const ref of refs) {
      object(ref, 'Evidence reference'); requireText(ref.path, 'Evidence path');
      ensure(typeof ref.sha256 === 'string' && /^[a-f0-9]{64}$/.test(ref.sha256), 'Evidence needs a SHA-256 reference.');
      if (ref.pointer !== undefined) requireText(ref.pointer, 'Evidence pointer');
      try { verifyEvidence(root, ref); }
      catch { issues.push({ kind, id, reason: `Reference missing or changed: ${ref.path}; assess affected knowledge before reuse.` }); }
    }
  }
  references(map.sourceRecords, 'map', map.mapId);
  const features = new Map<string, Feature>();
  for (const feature of map.features) {
    object(feature, 'Feature'); identity(feature.id); requireText(feature.name, 'Feature name');
    ensure(['feature', 'component', 'external'].includes(feature.kind), 'Invalid feature kind.');
    ensure(['active', 'retired'].includes(feature.state), 'Invalid feature lifecycle.');
    strings(feature.testLinkIds, 'Feature test-link IDs'); strings(feature.gaps, 'Feature gaps');
    references(feature.references, 'feature', feature.id);
    if (!feature.references.length) issues.push({ kind: 'feature', id: feature.id, reason: 'Feature provenance is missing; record a source or original question.' });
    features.set(feature.id, feature);
  }
  const links = new Set<string>();
  for (const link of map.testLinks) {
    object(link, 'Test link'); identity(link.id);
    ensure(['requirement', 'risk', 'condition', 'check', 'charter'].includes(link.kind), 'Invalid traceability-link kind.');
    references([link.reference], 'testLink', link.id); links.add(link.id);
  }
  const relationships = new Map<string, Relationship>();
  for (const relation of map.relationships) {
    object(relation, 'Relationship'); identity(relation.id);
    ensure(features.has(relation.from) && features.has(relation.to), `Relationship ${relation.id} has a missing feature endpoint.`);
    ensure(['navigation', 'prerequisite', 'data', 'state', 'permission', 'request', 'event', 'sharedDependency'].includes(relation.type), 'Invalid relationship type.');
    ensure(['active', 'needsReview', 'retired'].includes(relation.state), 'Invalid relationship lifecycle.');
    for (const field of ['transfer', 'applicability', 'recovery', 'refreshWhen'] as const) requireText(relation[field], `Relationship ${field}`);
    strings(relation.gaps, 'Relationship gaps'); strings(relation.testLinkIds, 'Relationship test-link IDs');
    nullableText(relation.inference, 'Inference'); nullableText(relation.discrepancy, 'Discrepancy');
    object(relation.intended, 'Intended behavior'); object(relation.observed, 'Observed behavior');
    ensure(['accepted', 'proposed', 'unknown'].includes(relation.intended.state), 'Intended behavior requires its own authority state.');
    references(relation.intended.references, 'relationship', relation.id);
    if (relation.intended.state === 'accepted') ensure(relation.intended.references.length, 'Accepted intent requires its actual source reference; a status alone is insufficient.');
    ensure(['observed', 'notObserved', 'unknown'].includes(relation.observed.state), 'Observed behavior requires its own evidence state.');
    references(relation.observed.evidence, 'relationship', relation.id);
    nullableText(relation.observed.build, 'Observed build'); nullableText(relation.observed.environment, 'Observation environment');
    if (relation.observed.state !== 'unknown') {
      ensure(relation.observed.evidence.length, 'An observation needs its actual evidence.'); timestamp(relation.observed.observedAt);
      requireText(relation.observed.environment, 'Observation environment');
      if (relation.state !== 'retired' && map.targetBuild !== relation.observed.build) issues.push({ kind: 'relationship', id: relation.id, reason: 'Observed build differs from the selected target; retain history and review applicability.' });
    } else if (relation.observed.observedAt !== null) timestamp(relation.observed.observedAt);
    if (relation.state !== 'retired') ensure(features.get(relation.from)!.state !== 'retired' && features.get(relation.to)!.state !== 'retired', 'Active relationships cannot silently use retired features; review the connection.');
    if (relation.state === 'needsReview' || relation.discrepancy) issues.push({ kind: 'relationship', id: relation.id, reason: relation.discrepancy ?? 'Relationship is marked Needs review.' });
    relationships.set(relation.id, relation);
  }
  for (const item of [...map.features, ...map.relationships]) {
    item.testLinkIds.forEach(id => ensure(links.has(id), `Missing coverage/test reference ${id}.`));
  }
  function replacements<T extends { id: string; state: string; replacementId?: string }>(items: Map<string, T>) {
    for (const item of items.values()) {
      if (!item.replacementId) continue;
      ensure(item.state === 'retired' && items.has(item.replacementId), `Invalid replacement for ${item.id}.`);
      const seen = new Set([item.id]); let next: T | undefined = items.get(item.replacementId);
      while (next) {
        ensure(!seen.has(next.id), 'Replacement history contains a cycle.'); seen.add(next.id);
        next = next.replacementId ? items.get(next.replacementId) : undefined;
      }
    }
  }
  replacements(features); replacements(relationships);
  return { mapId: map.mapId, revision: map.revision, targetBuild: map.targetBuild,
    status: issues.length ? 'needsReview' : map.features.length ? 'recorded' : 'unconfigured', issues,
    counts: { features: map.features.filter(f => f.state === 'active').length, relationships: map.relationships.filter(r => r.state !== 'retired').length, testLinks: links.size },
    productVerdict: 'Not assessed', limits: ['Structural assessment only: sources, intent, map completeness and actual behavior require review.',
      'A map connection is not an exercised test or execution authorization.',
      ...(map.targetBuild === null ? ['Target build is undisclosed; exact-revision applicability is not established.'] : [])] };
}

export interface TraceOptions { features: string[]; direction?: Direction; maxDepth?: number }
export interface CandidatePath { seed: string; featureId: string; direction: 'upstream' | 'downstream'; relationshipIds: string[] }

/** Trace same-direction paths only. The caller reviews applicability, semantics and risk. */
export function traceFlowMap(root: string, map: FlowMapSnapshot, options: TraceOptions) {
  const assessment = validateFlowMap(root, map); object(options, 'Trace options'); strings(options.features, 'Changed feature IDs');
  ensure(options.features.length > 0 && options.features.length <= 100, 'Select 1–100 actual changed features.');
  const direction = options.direction ?? 'both', maxDepth = options.maxDepth ?? 8;
  ensure(['upstream', 'downstream', 'both'].includes(direction), 'Use upstream, downstream or both.');
  ensure(Number.isInteger(maxDepth) && maxDepth >= 1 && maxDepth <= 32, 'Depth must be an integer from 1 to 32.');
  const features = new Map(map.features.map(f => [f.id, f]));
  options.features.forEach(id => ensure(features.get(id)?.state === 'active', `Changed feature ${id} is missing or retired; inspect its history/replacement.`));
  const edges = map.relationships.filter(r => r.state !== 'retired');
  const upstream = new Map<string, Relationship[]>(), downstream = new Map<string, Relationship[]>();
  for (const relation of edges) {
    downstream.set(relation.from, [...(downstream.get(relation.from) ?? []), relation]);
    upstream.set(relation.to, [...(upstream.get(relation.to) ?? []), relation]);
  }
  const selectedFeatures = new Set(options.features), selectedEdges = new Set<string>(), paths: CandidatePath[] = [];
  let truncated = false;
  const directions: ('upstream' | 'downstream')[] = direction === 'both' ? ['upstream', 'downstream'] : [direction];
  for (const seed of options.features) for (const travel of directions) {
    const seen = new Set([seed]), queue = [{ id: seed, via: [] as string[] }];
    for (let offset = 0; offset < queue.length; offset++) {
      const current = queue[offset]!;
      const adjacent = (travel === 'downstream' ? downstream : upstream).get(current.id) ?? [];
      if (current.via.length >= maxDepth) {
        for (const relation of adjacent) {
          const next = travel === 'downstream' ? relation.to : relation.from;
          if (seen.has(next)) selectedEdges.add(relation.id);
          else truncated = true;
        }
        continue;
      }
      for (const relation of adjacent) {
        selectedEdges.add(relation.id);
        const next = travel === 'downstream' ? relation.to : relation.from;
        selectedFeatures.add(next);
        if (seen.has(next)) continue;
        seen.add(next); const via = [...current.via, relation.id];
        paths.push({ seed, featureId: next, direction: travel, relationshipIds: via }); queue.push({ id: next, via });
      }
    }
  }
  const candidates = map.features.filter(f => selectedFeatures.has(f.id));
  const relationships = edges.filter(r => selectedEdges.has(r.id));
  const linkIds = new Set([...candidates, ...relationships].flatMap(item => item.testLinkIds));
  const relevantIssues = assessment.issues.filter(i => i.kind === 'map' || i.kind === 'feature' && selectedFeatures.has(i.id) || i.kind === 'relationship' && selectedEdges.has(i.id) || i.kind === 'testLink' && linkIds.has(i.id));
  const uncertainties = [
    ...candidates.flatMap(f => f.gaps.map(gap => `${f.id}: ${gap}`)),
    ...relationships.flatMap(r => [
      ...r.gaps.map(gap => `${r.id}: ${gap}`),
      ...(r.intended.state !== 'accepted' ? [`${r.id}: intended relationship is ${r.intended.state}.`] : []),
      ...(r.observed.state !== 'observed' ? [`${r.id}: observation state is ${r.observed.state}; this does not establish absence.`] : []),
      ...(r.inference ? [`${r.id}: inference: ${r.inference}`] : [])]),
  ];
  const recordedCandidates = { features: candidates, relationships, testLinks: map.testLinks.filter(link => linkIds.has(link.id)), paths };
  return { assessment, direction, maxDepth, changedFeatures: options.features,
    selectionStatus: relevantIssues.length || truncated ? 'needsReview' : 'candidates', relevantIssues, truncated, uncertainties,
    recordedCandidates, currentCandidates: relevantIssues.length || truncated ? null : recordedCandidates,
    next: 'Review relationship semantics, conditions, risks and source authority; prepare the itemized scope briefing before any dependent execution.',
    limits: [...assessment.limits, 'Paths are candidate impact, not a final test selection or complete dependency inventory.',
      'Upstream and downstream walks start separately at each changed feature; they never reverse direction mid-path.',
      'One representative path per feature/seed/direction is shown; the selected relationships retain other encountered connections.',
      ...(selectedEdges.size === 0 ? ['No mapped path was found; independence is not established. Review gaps and broader regression.'] : []),
      ...(truncated ? ['Depth limit reached; unvisited impact remains unknown. Review scope before using the candidates.'] : [])], productVerdict: 'Not assessed' };
}
