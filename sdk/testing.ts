/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TestGarden, TestGardenOpts } from "@garden-io/core/build/src/util/testing"
import { uuidv4 } from "@garden-io/core/build/src/util/random"
import { LogLevel, RootLogger } from "@garden-io/core/build/src/logger/logger"

export { TestGarden, getLogMessages, getRootLogMessages } from "@garden-io/core/build/src/util/testing"
export { expectError } from "@garden-io/core/build/src/util/testing"
export { makeTempDir } from "@garden-io/core/build/src/util/fs"

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
