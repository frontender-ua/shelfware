import { describe, expect, it } from 'vitest'
import {
  expectedPort,
  isAllowedHost,
  isLoopbackOrigin,
  isWellFormedToken,
  MAX_BODY_BYTES,
  parseHostHeader,
  tokenMatches,
} from '../../server/utils/guards'

describe('parseHostHeader', () => {
  it('splits hostname and port, keeping IPv6 brackets', () => {
    expect(parseHostHeader('127.0.0.1:3781')).toEqual({ hostname: '127.0.0.1', port: '3781' })
    expect(parseHostHeader('localhost:3781')).toEqual({ hostname: 'localhost', port: '3781' })
    expect(parseHostHeader('[::1]:3781')).toEqual({ hostname: '[::1]', port: '3781' })
    expect(parseHostHeader('127.0.0.1')).toEqual({ hostname: '127.0.0.1', port: '' })
  })

  it('returns null for missing or garbage headers', () => {
    expect(parseHostHeader(undefined)).toBeNull()
    expect(parseHostHeader('')).toBeNull()
    expect(parseHostHeader('not a host')).toBeNull()
  })
})

describe('expectedPort', () => {
  it('prefers NITRO_PORT, then PORT, and ignores non-numbers', () => {
    expect(expectedPort({ NITRO_PORT: '3781', PORT: '9999' })).toBe('3781')
    expect(expectedPort({ PORT: '4000' })).toBe('4000')
    expect(expectedPort({})).toBeNull()
    expect(expectedPort({ PORT: 'abc' })).toBeNull()
  })
})

describe('isAllowedHost', () => {
  it('accepts the three loopback names on the expected port', () => {
    expect(isAllowedHost('127.0.0.1:3781', '3781')).toBe(true)
    expect(isAllowedHost('localhost:3781', '3781')).toBe(true)
    expect(isAllowedHost('[::1]:3781', '3781')).toBe(true)
  })

  it('rejects other hosts, the wrong port, and missing headers', () => {
    expect(isAllowedHost('evil.com:3781', '3781')).toBe(false)
    expect(isAllowedHost('127.0.0.1:3782', '3781')).toBe(false)
    expect(isAllowedHost('127.0.0.1', '3781')).toBe(false)
    expect(isAllowedHost(undefined, '3781')).toBe(false)
    expect(isAllowedHost('', '3781')).toBe(false)
    expect(isAllowedHost('127.0.0.1.evil.com:3781', '3781')).toBe(false)
  })

  it('skips the port check when no port is expected', () => {
    expect(isAllowedHost('127.0.0.1:5555', null)).toBe(true)
    expect(isAllowedHost('localhost', null)).toBe(true)
    expect(isAllowedHost('evil.com:5555', null)).toBe(false)
  })
})

describe('isLoopbackOrigin', () => {
  it('accepts loopback origins on the expected port', () => {
    expect(isLoopbackOrigin('http://127.0.0.1:3781', '3781')).toBe(true)
    expect(isLoopbackOrigin('http://localhost:3781', '3781')).toBe(true)
    expect(isLoopbackOrigin('http://[::1]:3781', '3781')).toBe(true)
    expect(isLoopbackOrigin('http://127.0.0.1:5173', null)).toBe(true)
  })

  it('rejects other hosts, wrong ports, missing and invalid origins', () => {
    expect(isLoopbackOrigin('http://evil.com', '3781')).toBe(false)
    expect(isLoopbackOrigin('http://127.0.0.1:3782', '3781')).toBe(false)
    expect(isLoopbackOrigin(undefined, '3781')).toBe(false)
    expect(isLoopbackOrigin('not a url', '3781')).toBe(false)
    expect(isLoopbackOrigin('null', '3781')).toBe(false)
    expect(isLoopbackOrigin('file:///tmp/x', null)).toBe(false)
  })
})

describe('tokenMatches', () => {
  const token = `sw_${'ab'.repeat(32)}`

  it('accepts only the exact token', () => {
    expect(tokenMatches(token, token)).toBe(true)
    expect(tokenMatches(`${token}a`, token)).toBe(false)
    expect(tokenMatches(token.slice(0, -1), token)).toBe(false)
    expect(tokenMatches(`${token.slice(0, -1)}c`, token)).toBe(false)
  })

  it('never matches an empty or missing value', () => {
    expect(tokenMatches(undefined, token)).toBe(false)
    expect(tokenMatches('', token)).toBe(false)
    expect(tokenMatches('', '')).toBe(false)
    expect(tokenMatches(token, '')).toBe(false)
  })
})

describe('isWellFormedToken', () => {
  it('accepts only `sw_` plus 64 lowercase hex characters', () => {
    const token = `sw_${'ab'.repeat(32)}`
    expect(isWellFormedToken(token)).toBe(true)
    expect(isWellFormedToken(undefined)).toBe(false)
    expect(isWellFormedToken('')).toBe(false)
    expect(isWellFormedToken(' ')).toBe(false)
    expect(isWellFormedToken(` ${token} `)).toBe(false)
    expect(isWellFormedToken(`sw_${'AB'.repeat(32)}`)).toBe(false)
    expect(isWellFormedToken(token.slice(0, -1))).toBe(false)
    expect(isWellFormedToken(`${token}a`)).toBe(false)
    expect(isWellFormedToken('ab'.repeat(32))).toBe(false)
    expect(isWellFormedToken(`sw_${'zz'.repeat(32)}`)).toBe(false)
  })
})

describe('MAX_BODY_BYTES', () => {
  it('is one mebibyte', () => {
    expect(MAX_BODY_BYTES).toBe(1_048_576)
  })
})
