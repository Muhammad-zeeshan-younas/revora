import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'revora-monitor-test-'));
const stateFile = join(directory, 'state.json');
const delivered: string[] = [];
let degraded = true;
const server = createServer((request, response) => {
  if (request.url === '/api/health/operations') {
    response.writeHead(degraded ? 503 : 200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        status: degraded ? 'degraded' : 'healthy',
        alerts: degraded ? ['reminder_worker_stale'] : [],
      }),
    );

    return;
  }
  if (request.url === '/alerts') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      delivered.push(body);
      response.writeHead(204);
      response.end();
    });

    return;
  }
  response.writeHead(404);
  response.end();
});
let baseUrl = '';

async function monitorOnce(): Promise<{ code: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/monitor.ts'], {
      cwd: resolve('.'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        OPERATIONS_URL: `${baseUrl}/api/health/operations`,
        OPERATIONS_TOKEN: 'a'.repeat(32),
        ALERT_WEBHOOK_URL: `${baseUrl}/alerts`,
        OPERATIONS_STATE_FILE: stateFile,
      },
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('close', (code) => done({ code, output }));
  });
}

beforeAll(async () => {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  if (existsSync(stateFile)) {
    unlinkSync(stateFile);
  }
  rmdirSync(directory);
});

describe('operations alert delivery', () => {
  it('sends a changed alert once and then a recovery event', async () => {
    const first = await monitorOnce();
    expect(first.code, first.output).toBe(0);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain('"status":"degraded"');

    const unchanged = await monitorOnce();
    expect(unchanged.code, unchanged.output).toBe(0);
    expect(delivered).toHaveLength(1);

    degraded = false;
    const recovered = await monitorOnce();
    expect(recovered.code, recovered.output).toBe(0);
    expect(delivered).toHaveLength(2);
    expect(delivered[1]).toContain('"status":"recovered"');
  });
});
