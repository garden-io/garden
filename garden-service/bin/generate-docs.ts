#!/usr/bin/env ts-node

import { generateDocs } from "../src/docs/generate"
import { resolve } from "path"
import { Logger } from "../src/logger/logger"
import { LogLevel } from "../src/logger/log-node"

// make sure logger is initialized
try {
  Logger.initialize({
    level: LogLevel.info,
    // level: LogLevel.debug,
    // writers: [new BasicTerminalWriter()],
  })
} catch (_) { }

generateDocs(resolve(__dirname, "..", "..", "docs"))
  .then(() => {
    console.log("Done!")
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
