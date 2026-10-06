import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandType, Role } from '../shared/enums';
import { snapshotSchema } from '../shared/schema';
import type { Command } from '../shared/schema';
import { emptyWorkspace } from '../shared/seed';
import { mutate, snapshot } from '../src/stores/workspace';

afterEach(() => {
  snapshot.value = null;
  vi.unstubAllGlobals();
});

describe('manual retry after a lost response', () => {
  it('replays the saved request ID before accepting another command', async () => {
    const entries = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
    snapshot.value = snapshotSchema.parse({
      workspace: emptyWorkspace('org-pending', 'Pending Company'),
      revision: 0,
      session: {
        organizationId: 'org-pending',
        demo: false,
        user: {
          id: 'user-pending',
          name: 'Test Owner',
          email: 'owner@example.com',
          role: Role.Owner,
        },
      },
    });
    let calls = 0;
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls++;
        bodies.push(String(init.body));
        if (calls <= 2) {
          throw new TypeError('Connection lost');
        }

        return Response.json(snapshot.value);
      }),
    );
    const command: Command = {
      type: CommandType.UpdateSettings,
      settings: snapshot.value.workspace.settings,
    };
    await expect(mutate(command)).rejects.toThrow('Connection lost');
    expect(entries.size).toBe(1);
    await expect(mutate(command)).rejects.toThrow('previous save was confirmed');
    expect(calls).toBe(3);
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[1]).toBe(bodies[2]);
    expect(entries.size).toBe(0);
  });
});
