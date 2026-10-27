import { rehearse, validateReport } from '../browser/tools.js';
import { bindHarness } from '../tools/runtime.js';

const context = process.env.CI === 'true' ? 'ci' : 'interactive';
bindHarness(process.cwd(), { id: context === 'ci' ? 'github-actions' : 'terminal', version: context === 'ci' ? 'hosted-runner' : process.version, profile: context === 'ci' ? process.env.RUNNER_OS ?? 'ci' : 'local-synthetic-check', executionContext: context, source: 'Actual package synthetic browser execution context' });
for (const provider of ['cli', 'mcpServer'] as const) {
  const report = await rehearse(process.cwd(), provider, true, context);
  const issues = validateReport(process.cwd(), report, context, ['navigate', 'interact', 'inspect', 'upload', 'recover']);
  if (issues.length) throw new Error(`${provider}: ${report.limitation ?? issues.join('; ')}`);
  console.log(`${provider}: synthetic capability rehearsal passed`);
}
