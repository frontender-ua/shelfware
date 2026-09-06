import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { defineEventHandler, isError, setResponseStatus } from 'h3'
import { isHttpError } from './errors'

/**
 * Spec §9: every response is JSON; errors are `{ error }`. HttpError keeps
 * its status and extra data (the editor's `currentHash`), with `error`
 * always winning over a same-named data key; client-side h3 errors (status
 * below 500, e.g. readBody's 400 on malformed JSON) keep their status and
 * message. Everything else — including h3 errors at 500 and above, whose
 * message may leak internals — becomes a generic 500. Only the message is
 * logged, never a body.
 */
export function defineApiHandler<T>(handler: (event: H3Event<EventHandlerRequest>) => T | Promise<T>): EventHandler {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (err) {
      if (isHttpError(err)) {
        setResponseStatus(event, err.status)
        return { ...(err.data ?? {}), error: err.message }
      }
      if (isError(err) && err.statusCode < 500) {
        setResponseStatus(event, err.statusCode)
        return { error: err.message || err.statusMessage || 'Bad request' }
      }
      console.error('[shelfware] route failed:', err instanceof Error ? err.message : String(err))
      setResponseStatus(event, 500)
      return { error: 'Internal error' }
    }
  })
}
