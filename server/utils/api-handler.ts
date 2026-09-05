import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { defineEventHandler, isError, setResponseStatus } from 'h3'
import { isHttpError } from './errors'

/**
 * Spec §9: every response is JSON; errors are `{ error }`. HttpError keeps
 * its status and extra data (the editor's `currentHash`); h3 errors keep
 * their status (readBody's 400 on malformed JSON); anything else is a 500
 * with a generic message. Only the message is logged, never a body.
 */
export function defineApiHandler<T>(handler: (event: H3Event<EventHandlerRequest>) => T | Promise<T>): EventHandler {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (err) {
      if (isHttpError(err)) {
        setResponseStatus(event, err.status)
        return { error: err.message, ...(err.data ?? {}) }
      }
      if (isError(err)) {
        setResponseStatus(event, err.statusCode)
        return { error: err.message || err.statusMessage || 'Bad request' }
      }
      console.error('[shelfware] route failed:', err instanceof Error ? err.message : String(err))
      setResponseStatus(event, 500)
      return { error: 'Internal error' }
    }
  })
}
