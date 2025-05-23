/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TestGardenOpts } from "@garden-io/core/build/src/util/testing.js"
import { TestGarden } from "@garden-io/core/build/src/util/testing.js"
import { uuidv4 } from "@garden-io/core/build/src/util/random.js"
import { LogLevel, RootLogger } from "@garden-io/core/build/src/logger/logger.js"

export { TestGarden, getLogMessages, getRootLogMessages } from "@garden-io/core/build/src/util/testing.js"
export { downloadAndVerifyHash, expectError, isCiEnv } from "@garden-io/core/build/src/util/testing.js"
export { makeTempDir } from "@garden-io/core/build/src/util/fs.js"

export const makeTestGarden = async (projectRoot: string, opts: TestGardenOpts = {}): Promise<TestGarden> => {
  // Make sure Logger is initialized
  try {
    RootLogger.initialize({
      level: LogLevel.info,
      displayWriterType: "quiet",
      storeEntries: true,
    })
  } catch (_) {}

  opts = { sessionId: uuidv4(), ...opts }
  return TestGarden.factory(projectRoot, opts)
}
