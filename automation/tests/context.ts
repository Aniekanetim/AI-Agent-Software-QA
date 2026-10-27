import { bindHarness, readHarness, validateHarness } from '../tools/runtime.js';

/** Self-checks reuse a valid adopting harness; they must not replace its configured identity. */
export function packageHarness(root: string) {
  const context = process.env.CI === 'true' ? 'ci' : 'interactive';
  const existing = readHarness(root);
  if (existing) { validateHarness(root, existing, context); return existing; }
  return bindHarness(root, { id: context === 'ci' ? 'github-actions' : 'terminal', version: context === 'ci' ? 'hosted-runner' : process.version,
    profile: context === 'ci' ? process.env.RUNNER_OS ?? 'ci' : 'local-synthetic-check', executionContext: context, source: 'Actual package synthetic tool execution context' });
}
