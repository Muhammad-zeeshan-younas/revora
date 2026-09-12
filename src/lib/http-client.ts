import type { z } from 'zod';
import { errorSchema } from '../../shared/schema';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, schema: z.ZodType<T>, body?: object): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const result = errorSchema.safeParse(await response.json());
    throw new ApiError(
      result.success
        ? typeof result.data.message === 'string'
          ? result.data.message
          : result.data.message.join('; ')
        : 'The request could not be completed.',
      response.status,
    );
  }

  return schema.parse(await response.json());
}
