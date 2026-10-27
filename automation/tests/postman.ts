import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bindHarness } from '../tools/runtime.js';
import { evidence, contained } from '../shared/store.js';
import { runCollection, type RunRequest } from '../postman/postman.js';
import { runProcess, type Runner } from '../tools/registry.js';

// Only synthetic/harmless help diagnostics are printed; product runners suppress raw output.
const fixtureRunner: Runner = async (command, args, options) => {
  const result = await runProcess(command, args, options);
  if (args.includes('--help')) console.log(JSON.stringify({ command: args, code: result.code, help: (result.stdout + '\n' + result.stderr).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').slice(0, 14_000) }));
  return result;
};

const root = process.cwd(), ci = process.env.CI === 'true';
bindHarness(root, { id: ci ? 'github-actions' : 'terminal', version: ci ? 'hosted-runner' : process.version, profile: ci ? process.env.RUNNER_OS ?? 'ci' : 'local-synthetic-check', executionContext: ci ? 'ci' : 'interactive', source: 'Actual package synthetic CLI execution context' });
const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"status":"ok"}'); });
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Synthetic API did not bind.');
const url = `http://127.0.0.1:${address.port}`;
try {
  for (const fail of [false, true]) {
    const path = `.local/postman/fixtures/${fail ? 'failure' : 'success'}.collection.json`; mkdirSync(resolve(contained(root, path), '..'), { recursive: true });
    writeFileSync(contained(root, path), JSON.stringify({ info: { name: 'Synthetic package check', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [{ name: 'Synthetic health check', request: { method: 'GET', url: `${url}/health` }, event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
      'pm.test("HTTP 200", function () { pm.response.to.have.status(200); });',
      `pm.test("Synthetic assertion", function () { pm.expect(pm.response.json().status).to.eql("${fail ? 'deliberate-failure' : 'ok'}"); });`,
    ] } }] }] }));
    const request: RunRequest = { id: `fixture-${randomUUID()}`, source: 'Package synthetic integration check', authorizationReference: 'Maintainer authorized this loopback fixture; not product execution approval', collection: { kind: 'file', reference: path, format: 'v2.1' }, approvedInputs: [evidence(root, path)], target: { environment: 'synthetic-loopback', baseUrl: url, build: 'synthetic-v1', source: 'Actual local fixture server' }, timeoutMs: 30_000 };
    const result = await runCollection(root, request, fixtureRunner);
    assert.equal(result.outcome, fail ? 'failed' : 'passed'); assert.equal(result.assertions?.total, 2); assert.equal(result.assertions.failed, fail ? 1 : 0);
    console.log(`Postman CLI: ${fail ? 'intentional assertion failure retained' : 'passing assertions verified'}; synthetic loopback only`);
  }
} finally { await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
