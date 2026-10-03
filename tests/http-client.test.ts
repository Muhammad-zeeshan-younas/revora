import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { request } from '../src/lib/http-client';

afterEach(() => vi.unstubAllGlobals());

describe('HTTP error handling', () => {
  it('preserves an unauthorized status when a proxy returns HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Unauthorized</html>', { status: 401 })),
    );
    await expect(request('/workspace', z.object({ ok: z.boolean() }))).rejects.toMatchObject({
      status: 401,
      message: 'The request could not be completed.',
    });
  });

  it('preserves a conflict status for an empty error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 409 })),
    );
    await expect(request('/workspace', z.object({ ok: z.boolean() }))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('retains server validation messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ message: ['Invalid invoice', 'Invalid amount'] }, { status: 400 }),
      ),
    );
    await expect(request('/workspace', z.object({ ok: z.boolean() }))).rejects.toMatchObject({
      status: 400,
      message: 'Invalid invoice; Invalid amount',
    });
  });
});
