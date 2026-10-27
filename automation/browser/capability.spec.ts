import { test, expect } from '@playwright/test';
import { rehearse, validateReport } from './tools.js';

test('synthetic browser capability: form, upload, save and second-context recovery', async () => {
  const report = await rehearse(process.cwd(), 'library', true);
  expect(validateReport(process.cwd(), report, 'interactive', ['navigate', 'interact', 'inspect', 'upload', 'recover']), report.limitation).toEqual([]);
});
