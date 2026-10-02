export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  csrf?: string,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(
      'API returned a non-JSON response. Open the application through its same-origin proxy.',
      response.status === 200 ? 502 : response.status,
    );
  const data = await response.json().catch(() => ({
    error: { message: `Request failed (${response.status})` },
  }));
  if (!response.ok)
    throw new ApiError(
      data.error?.message ?? data.message ?? 'Request failed',
      response.status,
    );
  return data as T;
}
