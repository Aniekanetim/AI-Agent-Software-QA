import { rehearse, validateReport } from '../browser/tools.js';
for (const provider of ['cli', 'mcpServer'] as const) {
  const report = await rehearse(process.cwd(), provider, true);
  const issues = validateReport(process.cwd(), report, 'interactive', ['navigate', 'interact', 'inspect', 'upload', 'recover']);
  if (issues.length) throw new Error(`${provider}: ${report.limitation ?? issues.join('; ')}`);
  console.log(`${provider}: synthetic capability rehearsal passed`);
}
