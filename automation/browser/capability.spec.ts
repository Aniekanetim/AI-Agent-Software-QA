import { test, expect } from '@playwright/test';
import { rehearse, validateReport } from './tools.js';
import { packageHarness } from '../tests/context.js';

test('synthetic browser capability: form, upload, save and second-context recovery', async () => {
  const context = packageHarness(process.cwd()).executionContext;
  const report = await rehearse(process.cwd(), 'library', true, context);
  expect(validateReport(process.cwd(), report, context, ['navigate', 'interact', 'inspect', 'upload', 'recover']), report.limitation).toEqual([]);
});
