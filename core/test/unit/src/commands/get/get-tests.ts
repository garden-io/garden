/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { makeTestGarden, dataDir, withDefaultGlobalOpts } from "../../../../helpers"
import { GetTestsCommand } from "../../../../../src/commands/get/get-tests"
import { expect } from "chai"
import { sortBy } from "lodash"

describe("GetTestsCommand", () => {
  const projectRoot = resolve(dataDir, "test-project-a")

  it("should return tests, grouped by module", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetTestsCommand()

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { tests: undefined },
      opts: withDefaultGlobalOpts({}),
    })

    const modules = sortBy(res.result, (m) => {
      return Object.keys(m)[0]
    })
    const testsForModuleA = sortBy(modules[0]["module-a"], "name")
    const testsForModuleB = sortBy(modules[1]["module-b"], "name")
    const testsForModuleC = sortBy(modules[2]["module-c"], "name")
    expect(modules.length).to.eql(3)
    expect(testsForModuleA).to.eql([
      {
        name: "integration",
        command: ["echo", "OK"],
        dependencies: ["service-a"],
        disabled: false,
        timeout: null,
        env: {},
        cpu: { min: 10, max: 1000 },
        memory: { min: 90, max: 1024 },
        volumes: [],
      },
      {
        name: "unit",
        command: ["echo", "OK"],
        dependencies: [],
        disabled: false,
        timeout: null,
        env: {},
        cpu: { min: 10, max: 1000 },
        memory: { min: 90, max: 1024 },
        volumes: [],
      },
    ])
    expect(testsForModuleB).to.eql([
      {
        name: "unit",
        command: ["echo", "OK"],
        dependencies: [],
        disabled: false,
        timeout: null,
        env: {},
        cpu: { min: 10, max: 1000 },
        memory: { min: 90, max: 1024 },
        volumes: [],
      },
    ])
    expect(testsForModuleC).to.eql([
      {
        name: "integ",
        command: ["echo", "OK"],
        dependencies: [],
        disabled: false,
        timeout: null,
        env: {},
        cpu: { min: 10, max: 1000 },
        memory: { min: 90, max: 1024 },
        volumes: [],
      },
      {
        name: "unit",
        command: ["echo", "OK"],
        dependencies: [],
        disabled: false,
        timeout: null,
        env: {},
        cpu: { min: 10, max: 1000 },
        memory: { min: 90, max: 1024 },
        volumes: [],
      },
    ])
  })

  it("should return only the applicable tests when called with a list of test names", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetTestsCommand()

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { tests: ["integration"] },
      opts: withDefaultGlobalOpts({}),
    })
    expect(res).to.eql({
      result: [
        {
          "module-a": [
            {
              name: "integration",
              command: ["echo", "OK"],
              dependencies: ["service-a"],
              disabled: false,
              timeout: null,
              env: {},
              cpu: { min: 10, max: 1000 },
              memory: { min: 90, max: 1024 },
              volumes: [],
            },
          ],
        },
      ],
    })
  })
})
