#!/usr/bin/env node
import { launch } from './launch.mjs'

await launch({
  importServer: () => import('../.output/server/index.mjs'),
})
