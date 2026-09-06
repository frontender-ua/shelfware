// Types for bin/launch.mjs. Hand-written: keep every export here in step with the .mjs.

export const DEFAULT_PORT: 3781
export const PORT_ATTEMPTS: 20
export const HOST: '127.0.0.1'
export const TOKEN_ENV: 'NUXT_PUBLIC_SHELFWARE_TOKEN'
export const HELP: string

export type Env = Record<string, string | undefined>

export interface ParsedArgs {
  help: boolean
  port: number | null
  open: boolean
}

/** The subset of child_process.spawn the launcher relies on, so tests can pass a stub. */
export type SpawnLike = (
  cmd: string,
  args: string[],
  options: { stdio: 'ignore', detached: true, env: Env },
) => { unref?: () => void, on?: (event: 'error', listener: (err: Error) => unknown) => unknown }

export interface LaunchOptions {
  argv?: string[]
  env?: Env
  importServer: () => Promise<unknown>
  log?: (line: string) => void
  exit?: (code: number) => unknown
  entry?: string
  spawn?: SpawnLike
}

export function makeToken(): string
export function parseArgs(argv?: string[], env?: Env): ParsedArgs
export function portReason(code: string): string
export function checkPort(port: number, host?: string): Promise<string | null>
export function isPortFree(port: number, host?: string): Promise<boolean>
export function pickPort(start?: number, options?: { attempts?: number, host?: string }): Promise<number>
export function probeHealth(port: number, host?: string): Promise<boolean>
export function waitForHealth(
  port: number,
  options?: {
    timeoutMs?: number
    intervalMs?: number
    host?: string
    probe?: (port: number, host: string) => Promise<boolean>
    signal?: AbortSignal
  },
): Promise<boolean>
export function openBrowser(url: string, options?: { platform?: string, spawn?: SpawnLike, env?: Env }): { cmd: string, args: string[] }
export function serverEntry(binDir?: string): string
export function describeError(err: unknown): string
export function launch(options: LaunchOptions): Promise<{ port: number, url: string } | null>
