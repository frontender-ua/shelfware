export class ApiError extends Error {
  readonly status: number
  readonly data: Record<string, unknown>

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

/** Maps ofetch's FetchError (statusCode + parsed `data`) or anything else to ApiError. Never throws. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const fe = (err && typeof err === 'object' ? err : {}) as { statusCode?: unknown, status?: unknown, data?: unknown, message?: unknown }
  const data = fe.data && typeof fe.data === 'object' && !Array.isArray(fe.data) ? (fe.data as Record<string, unknown>) : {}
  const status = typeof fe.statusCode === 'number' ? fe.statusCode : typeof fe.status === 'number' ? fe.status : 0
  const message = typeof data.error === 'string' && data.error
    ? data.error
    : typeof fe.message === 'string' && fe.message
      ? fe.message
      : 'Request failed'
  return new ApiError(message, status, data)
}
