/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { generateDocs } from "@garden-io/core/build/src/docs/generate.js"
import { resolve } from "path"
import { LogLevel, RootLogger } from "@garden-io/core/build/src/logger/logger.js"
import { GARDEN_CLI_ROOT } from "@garden-io/core/build/src/constants.js"
import { getBundledPlugins } from "./cli.js"
import { getSupportedPlugins } from "@garden-io/core/build/src/plugins/plugins.js"
import { gracefulExit } from "@scg82/exit-hook"
import * as url from "node:url"

// make sure logger is initialized
try {
  RootLogger.initialize({
    level: LogLevel.info,
    displayWriterType: "quiet",
    storeEntries: false,
    // level: LogLevel.debug,
    // writers: [new TerminalWriter()],
  })
} catch (_) {}

const getPlugins = () => [...getBundledPlugins(), ...getSupportedPlugins()]

const modulePath = url.fileURLToPath(import.meta.url)
if (process.argv[1] === modulePath) {
  generateDocs(resolve(GARDEN_CLI_ROOT, "..", "docs"), getPlugins)
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("Done!")
      gracefulExit(0)
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err)
      gracefulExit(1)
    })
}
