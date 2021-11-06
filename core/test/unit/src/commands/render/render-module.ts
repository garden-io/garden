/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ensureDir } from "fs-extra"
import { join } from "path"
import { RenderModuleCommand } from "../../../../../src/commands/render/render"
import { DEFAULT_API_VERSION, GARDEN_CORE_ROOT } from "../../../../../src/constants"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../../helpers"

describe("RenderModuleCommand", () => {
  let tmpPath: string

  before(async () => {
    tmpPath = join(GARDEN_CORE_ROOT, "tmp")
    await ensureDir(tmpPath)
  })

  it("should filter secrets from the rendered output", async () => {
    const garden = await makeTestGardenA()
    garden.secrets = {
      big_secret: "there is no spoon",
    }
    garden.setModuleConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        name: "foo",
        path: tmpPath,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "disabled-service",
              dependencies: [],
              disabled: true,
              hotReloadable: false,
              spec: {},
              env: { some_field: "there is no spoon" },
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
    ])
    const command = new RenderModuleCommand()
    const log = garden.log
    const result = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { module: "foo" },
      opts: withDefaultGlobalOpts({}),
    })
    expect(result.result?.spec.services[0]["env"]["some_field"]).to.eql("[filtered secret: big_secret]")
  })
})
