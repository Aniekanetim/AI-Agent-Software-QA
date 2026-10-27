import { rehearse, validateReport } from '../browser/tools.js';
import { packageHarness } from './context.js';

const context = packageHarness(process.cwd()).executionContext;
for (const provider of ['cli', 'mcpServer'] as const) {
  const report = await rehearse(process.cwd(), provider, true, context);
  const issues = validateReport(process.cwd(), report, context, ['navigate', 'interact', 'inspect', 'upload', 'recover']);
  if (issues.length) throw new Error(`${provider}: ${report.limitation ?? issues.join('; ')}`);
  console.log(`${provider}: synthetic capability rehearsal passed`);
}
