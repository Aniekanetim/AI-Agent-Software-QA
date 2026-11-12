import { assertNonsecret, load, requireText, verifyEvidence, type Evidence } from '../shared/store.js';

export interface Library {
  schemaVersion: 1;
  projectId: string;
  modules: { id: string; name: string; conditionIds: string[]; testTypeIds: string[] }[];
  testTypes: { id: string; name: string }[];
  conditions: { id: string; description: string; basis: Evidence }[];
  suites: { id: string; moduleId: string; testTypeId: string; checkIds: string[] }[];
  checks: { id: string; name: string; definition: Evidence; conditionIds: string[] }[];
}

export function identifier(value: string, label: string) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value)) throw new Error(`Use a stable ${label} ID.`);
  return value;
}

export function indexById<T extends { id: string }>(rows: T[], label: string) {
  if (!Array.isArray(rows)) throw new Error(`Supply the ${label} list.`);
  const result = new Map<string, T>(), normalized = new Set<string>();
  for (const row of rows) {
    const id = identifier(row?.id, label), lower = id.toLowerCase();
    if (normalized.has(lower)) throw new Error(`Duplicate ${label} ID ${id}.`);
    normalized.add(lower);
    result.set(id, row);
  }
  return result;
}

export function references(ids: string[], available: { has(id: string): boolean }, label: string, allowEmpty = false) {
  if (!Array.isArray(ids) || (!allowEmpty && !ids.length) || new Set(ids).size !== ids.length || ids.some(id => !available.has(id))) {
    throw new Error(`Use distinct, existing ${label} references.`);
  }
}

export function pinned<T>(root: string, ref: Evidence, label: string): T {
  if (!ref || ref.pointer !== undefined) throw new Error(`Supply a full-file evidence reference for ${label}.`);
  verifyEvidence(root, ref);
  const record = load<T>(root, ref.path, () => { throw new Error(`Missing ${label}.`); });
  if (record.revision !== ref.sha256) throw new Error(`The pinned ${label} changed while loading.`);
  assertNonsecret(record.value);
  return record.value;
}

export function readLibrary(root: string, ref: Evidence) {
  const library = pinned<Library>(root, ref, 'library');
  if (library?.schemaVersion !== 1) throw new Error('Use a version 1 test library.');
  identifier(library.projectId, 'project');
  const modules = indexById(library.modules, 'module'), types = indexById(library.testTypes, 'test type');
  const conditions = indexById(library.conditions, 'condition'), checks = indexById(library.checks, 'check');
  const suites = indexById(library.suites, 'suite');
  for (const type of types.values()) requireText(type.name, 'Test type name');
  for (const condition of conditions.values()) {
    requireText(condition.description, 'Condition description');
    verifyEvidence(root, condition.basis);
  }
  for (const check of checks.values()) {
    requireText(check.name, 'Check name');
    references(check.conditionIds, conditions, 'condition');
    verifyEvidence(root, check.definition);
  }
  const checksByArea = new Map<string, Set<string>>();
  for (const module of modules.values()) {
    requireText(module.name, 'Module name');
    references(module.testTypeIds, types, 'module test type');
    references(module.conditionIds, conditions, 'module condition');
  }
  for (const suite of suites.values()) {
    const module = modules.get(suite.moduleId);
    if (!module?.testTypeIds.includes(suite.testTypeId)) throw new Error(`Suite ${suite.id} needs an applicable module and test type.`);
    references(suite.checkIds, checks, 'suite check');
    const key = `${suite.moduleId}/${suite.testTypeId}`;
    const area = checksByArea.get(key) ?? new Set<string>();
    for (const checkId of suite.checkIds) {
      if (!checks.get(checkId)!.conditionIds.some(id => module.conditionIds.includes(id))) throw new Error(`Check ${checkId} has no condition for suite ${suite.id}'s module.`);
      area.add(checkId);
    }
    checksByArea.set(key, area);
  }
  return { library, modules, types, conditions, checks, checksByArea };
}

export function browseLibrary(root: string, ref: Evidence) {
  const { library, modules, types, checks } = readLibrary(root, ref);
  return {
    projectId: library.projectId,
    library: ref,
    modules: [...modules.values()].map(module => ({
      id: module.id, name: module.name, conditionIds: module.conditionIds,
      testTypes: module.testTypeIds.map(id => ({
        ...types.get(id)!,
        suites: library.suites.filter(suite => suite.moduleId === module.id && suite.testTypeId === id)
          .map(suite => ({ id: suite.id, checks: suite.checkIds.map(checkId => checks.get(checkId)!) })),
      })),
    })),
  };
}
