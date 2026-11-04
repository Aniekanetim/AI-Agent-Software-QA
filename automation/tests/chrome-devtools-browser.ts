import { rehearseChrome } from '../chrome-devtools/rehearsal.js';

const repeats = Number(process.env.QA_CHROME_REPEATS ?? '1');
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error('QA_CHROME_REPEATS must be an integer from 1 to 10. No browser was launched.');
for (let iteration = 1; iteration <= repeats; iteration++) {
  for (const provider of ['mcpServer', 'cli'] as const) {
    const report = await rehearseChrome(process.cwd(), provider, process.env.QA_CHROME_HEADED === '1' ? 'headed' : 'headless', process.env.QA_CHROME_EXECUTABLE);
    console.log(JSON.stringify({ ...report, iteration, repeats }));
  }
}
