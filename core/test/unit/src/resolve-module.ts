/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import { makeTestGardenA } from "../../helpers"

describe("ModuleResolver", () => {
  // Note: We test the ModuleResolver via the TestGarden.resolveModule method, for convenience.

  it("handles a project template reference in a build dependency name", async () => {
    const garden = await makeTestGardenA()

    garden.setModuleConfigs([
      {
        name: "test-project-a",
        type: "test",
        path: join(garden.projectRoot, "module-a"),
        build: {
          dependencies: [],
        },
      },
      {
        name: "module-b",
        type: "test",
        path: join(garden.projectRoot, "module-b"),
        build: {
          dependencies: [{ name: "${project.name}", copy: [] }],
        },
      },
    ])

    const module = await garden.resolveModule("module-b")
    expect(module.build.dependencies[0].name).to.equal("test-project-a")
  })

  it("handles a module template reference in a build dependency name", async () => {
    const garden = await makeTestGardenA()

    garden.setModuleConfigs([
      {
        name: "module-a",
        type: "test",
        path: join(garden.projectRoot, "module-a"),
        build: {
          dependencies: [],
        },
      },
      {
        name: "module-b",
        type: "test",
        path: join(garden.projectRoot, "module-b"),
        build: {
          dependencies: [{ name: "${modules.module-a.name}", copy: [] }],
        },
      },
    ])

    const module = await garden.resolveModule("module-b")
    expect(module.build.dependencies[0].name).to.equal("module-a")
  })
})
