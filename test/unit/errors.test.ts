import { describe, expect, it } from 'vitest'
import { fail, HttpError, isHttpError } from '../../server/utils/errors'

describe('HttpError', () => {
  it('carries status, message and optional data', () => {
    const err = fail(409, 'File changed on disk since it was loaded', { currentHash: 'abc' })
    expect(err).toBeInstanceOf(HttpError)
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(409)
    expect(err.message).toBe('File changed on disk since it was loaded')
    expect(err.data).toEqual({ currentHash: 'abc' })
    expect(isHttpError(err)).toBe(true)
    expect(isHttpError(new Error('plain'))).toBe(false)
  })
})
