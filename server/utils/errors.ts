/**
 * Error carrying an HTTP status. Pure modules throw it; `defineApiHandler`
 * (server/utils/api-handler.ts) turns it into `{ error, ...data }` JSON.
 */
export class HttpError extends Error {
  readonly status: number
  readonly data: Record<string, unknown> | undefined

  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.data = data
  }
}

export function fail(status: number, message: string, data?: Record<string, unknown>): HttpError {
  return new HttpError(status, message, data)
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError
}
