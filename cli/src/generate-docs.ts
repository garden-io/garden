/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { generateDocs } from "@garden-io/core/build/src/docs/generate"
import { resolve } from "path"
import { Logger } from "@garden-io/core/build/src/logger/logger"
import { LogLevel } from "@garden-io/core/build/src/logger/log-node"
import { GARDEN_CLI_ROOT } from "@garden-io/core/build/src/constants"
import { getBundledPlugins } from "./cli"

require("source-map-support").install()

// make sure logger is initialized
try {
  Logger.initialize({
    level: LogLevel.info,
    // level: LogLevel.debug,
    // writers: [new BasicTerminalWriter()],
  })
} catch (_) {}

generateDocs(resolve(GARDEN_CLI_ROOT, "..", "docs"), getBundledPlugins())
  .then(() => {
    // tslint:disable-next-line: no-console
    console.log("Done!")
    process.exit(0)
  })
  .catch((err) => {
    // tslint:disable-next-line: no-console
    console.error(err)
    process.exit(1)
  })
