/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { makeTestGarden } from "@garden-io/sdk/build/src/testing.js"
import { dirname, resolve } from "node:path"
import { gardenPlugin } from "../src/index.js"
import { defaultTerraformVersion } from "../src/cli.js"
import { ValidateCommand } from "@garden-io/core/build/src/commands/validate.js"
import { withDefaultGlobalOpts } from "@garden-io/core/build/test/helpers.js"
import { fileURLToPath } from "node:url"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

describe("terraform validation", () => {
  for (const project of ["test-project", "test-project-action", "test-project-module"]) {
    it(`should pass validation for ${project}`, async () => {
      const testRoot = resolve(moduleDirName, "../../test/", project)
      const garden = await makeTestGarden(testRoot, {
        plugins: [gardenPlugin()],
        variableOverrides: { "tf-version": defaultTerraformVersion },
      })

      const command = new ValidateCommand()
      await command.action({
        garden,
        log: garden.log,
        args: {},
        opts: withDefaultGlobalOpts({ resolve: undefined }),
      })
    })
  }
})
