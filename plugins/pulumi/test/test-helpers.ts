/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { execa } from "execa"
import fsExtra from "fs-extra"
import { join } from "lodash-es"
const { pathExists } = fsExtra

// Here, pulumi needs node modules to be installed (to use the TS SDK in the pulumi program).
export const ensureNodeModules = async (configRoots: string[]) => {
  await Promise.all(
    configRoots.map(async (configRoot) => {
      if (await pathExists(join(configRoot, "node_modules"))) {
        return
      }
      await execa("npm", ["install"], { cwd: configRoot })
    })
  )
}
