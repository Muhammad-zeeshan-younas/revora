import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const POLL_INTERVAL_MS = 60_000;
const REMINDER_INTERVAL_MS = 60 * 60_000;
const stateSchema = z.object({ alerts: z.array(z.string()), sentAt: z.number() });
const operationsSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  alerts: z.array(z.string()),
});
type AlertState = z.infer<typeof stateSchema>;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for operations monitoring.`);
  }

  return value;
}

function statePath(): string {
  return resolve(process.env['OPERATIONS_STATE_FILE'] ?? 'data/operations-alert-state.json');
}

function readState(path: string): AlertState {
  try {
    return stateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { alerts: [], sentAt: 0 };
    }
    throw new Error('Operations alert state is invalid or unreadable.', { cause: error });
  }
}

function saveState(path: string, state: AlertState): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  renameSync(temporary, path);
}

async function readOperations(url: string, token: string): Promise<string[]> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200 && response.status !== 503) {
      return ['operations_endpoint_unavailable'];
    }
    const result = operationsSchema.parse(await response.json());
    if (response.status === 503 && result.status !== 'degraded') {
      return ['operations_endpoint_unavailable'];
    }

    return result.alerts;
  } catch {
    return ['operations_endpoint_unavailable'];
  }
}

async function poll(): Promise<void> {
  const operationsUrl = new URL(required('OPERATIONS_URL'));
  const webhookUrl = new URL(required('ALERT_WEBHOOK_URL'));
  if (process.env['NODE_ENV'] === 'production' && webhookUrl.protocol !== 'https:') {
    throw new Error('Production ALERT_WEBHOOK_URL must use HTTPS.');
  }
  const token = required('OPERATIONS_TOKEN');
  const path = statePath();
  const previous = readState(path);
  const alerts = [...new Set(await readOperations(operationsUrl.href, token))].sort();
  const now = Date.now();
  const changed = JSON.stringify(alerts) !== JSON.stringify(previous.alerts);
  if (!changed && (alerts.length === 0 || now - previous.sentAt < REMINDER_INTERVAL_MS)) {
    return;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env['ALERT_WEBHOOK_TOKEN']
        ? { Authorization: `Bearer ${process.env['ALERT_WEBHOOK_TOKEN']}` }
        : {}),
    },
    body: JSON.stringify({
      source: 'revora',
      status: alerts.length ? 'degraded' : 'recovered',
      alerts,
      at: new Date(now).toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Alert webhook returned HTTP ${response.status}.`);
  }
  saveState(path, { alerts, sentAt: now });
  console.log(
    alerts.length ? `Operations alert sent: ${alerts.join(', ')}` : 'Operations recovered.',
  );
}

async function main(): Promise<void> {
  if (process.argv.includes('--watch')) {
    while (true) {
      try {
        await poll();
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Operations poll failed.');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  await poll();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Operations poll failed.');
  process.exitCode = 1;
});
