import { rehearseChrome } from '../chrome-devtools/rehearsal.js';

for (const provider of ['mcpServer', 'cli'] as const) {
  const report = await rehearseChrome(process.cwd(), provider, process.env.QA_CHROME_HEADED === '1' ? 'headed' : 'headless');
  console.log(JSON.stringify(report));
}
