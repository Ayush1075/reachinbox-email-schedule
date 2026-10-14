import type { ApiResponse } from '@/types/api';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Normalised error for every failed API call. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | undefined | null>;

/**
 * Typed fetch wrapper. The session JWT lives in an httpOnly cookie set by the
 * API, so we never touch it from JS — `credentials: 'include'` attaches it.
 */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; file?: File; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  const url = new URL(path, API_URL);
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: options.file
        ? {
            // Raw bytes: the API reads the name and real media type from headers.
            'Content-Type': 'application/octet-stream',
            'X-Filename': encodeURIComponent(options.file.name),
            'X-Content-Type': options.file.type || 'application/octet-stream',
          }
        : options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : undefined,
      body: options.file ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', `Cannot reach the API at ${API_URL}. Is the backend running?`);
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    // Non-JSON body (proxy error page, etc.) — handled below.
  }

  if (payload?.success) return payload.data;
  if (payload && !payload.success) {
    throw new ApiError(res.status, payload.error.code, payload.error.message, payload.error.details);
  }
  throw new ApiError(res.status, 'BAD_RESPONSE', `Unexpected response from API (HTTP ${res.status})`);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
