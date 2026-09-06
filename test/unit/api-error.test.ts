import { describe, expect, it } from 'vitest'
import { ApiError, toApiError } from '../../app/utils/api-error'

describe('toApiError', () => {
  it('maps an ofetch error with an { error } body to status and message', () => {
    const err = toApiError({ statusCode: 409, message: '409 Conflict', data: { error: 'File changed on disk since it was loaded', currentHash: 'abc' } })
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.message).toBe('File changed on disk since it was loaded')
    expect(err.data).toEqual({ error: 'File changed on disk since it was loaded', currentHash: 'abc' })
  })

  it('falls back to the error message and status 0 for network failures', () => {
    const err = toApiError(new Error('fetch failed'))
    expect(err.status).toBe(0)
    expect(err.message).toBe('fetch failed')
    expect(err.data).toEqual({})
  })

  it('never throws on garbage and passes ApiError through', () => {
    expect(toApiError('boom').message).toBe('Request failed')
    expect(toApiError(null).status).toBe(0)
    const original = new ApiError('x', 418, {})
    expect(toApiError(original)).toBe(original)
  })
})
