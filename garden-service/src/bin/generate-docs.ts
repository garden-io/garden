/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { generateDocs } from "../docs/generate"
import { resolve } from "path"
import { Logger } from "../logger/logger"
import { LogLevel } from "../logger/log-node"
import { GARDEN_SERVICE_ROOT } from "../constants"

// make sure logger is initialized
try {
  Logger.initialize({
    level: LogLevel.info,
    // level: LogLevel.debug,
    // writers: [new BasicTerminalWriter()],
  })
} catch (_) {}

generateDocs(resolve(GARDEN_SERVICE_ROOT, "..", "docs"))
  .then(() => {
    console.log("Done!")
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
