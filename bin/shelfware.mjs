#!/usr/bin/env node
import { launch } from './launch.mjs'

// launch() reports every failure it can foresee as one line and exits 1; this is
// the last resort, so an unforeseen throw still never reaches the user as a stack.
try {
  await launch({ importServer: () => import('../.output/server/index.mjs') })
} catch (err) {
  console.error(`shelfware: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
