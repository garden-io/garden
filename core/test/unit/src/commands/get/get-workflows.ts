/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { makeTestGarden, withDefaultGlobalOpts, getDataDir } from "../../../../helpers.js"
import { expect } from "chai"
import { GetWorkflowsCommand } from "../../../../../src/commands/get/get-workflows.js"
import { defaultWorkflowResources } from "../../../../../src/config/workflow.js"
import { GardenApiVersion } from "../../../../../src/constants.js"

describe("GetWorkflowsCommand", () => {
  const projectRoot = getDataDir("test-project-a")
  const defaultWorkflowConf = {
    apiVersion: GardenApiVersion.v0,
    kind: "Workflow" as const,
    envVars: {},
    resources: defaultWorkflowResources,
    internal: {
      basePath: projectRoot,
    },
    steps: [],
  }

  it("should return workflows, grouped alphabetically", async () => {
    const garden = await makeTestGarden(projectRoot)
    garden.setRawWorkflowConfigs([
      { name: "c", description: "c-desc", ...defaultWorkflowConf },
      { name: "a", description: "a-desc", ...defaultWorkflowConf },
      { name: "b", description: "b-desc", ...defaultWorkflowConf },
    ])
    const log = garden.log
    const command = new GetWorkflowsCommand()

    const res = await command.action({
      garden,
      log,
      args: { workflows: undefined },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result.length).to.eq(3)
    expect(res.result[0].name).to.eq("a")
    expect(res.result[1].name).to.eq("b")
    expect(res.result[2].name).to.eq("c")
    expect(res.result[0].description).to.eq("a-desc")
    expect(res.result[1].description).to.eq("b-desc")
    expect(res.result[2].description).to.eq("c-desc")
  })

  it("should return only the applicable workflow when called with a name", async () => {
    const garden = await makeTestGarden(projectRoot)
    garden.setRawWorkflowConfigs([
      { name: "c", description: "c-desc", ...defaultWorkflowConf },
      { name: "a", description: "a-desc", ...defaultWorkflowConf },
      { name: "b", description: "b-desc", ...defaultWorkflowConf },
    ])
    const log = garden.log
    const command = new GetWorkflowsCommand()

    const res = await command.action({
      garden,
      log,
      args: { workflows: ["a"] },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result.length).to.eq(1)
    expect(res.result[0].name).to.eq("a")
    expect(res.result[0].description).to.eq("a-desc")
  })

  it("should return only the applicable workflows when called with a list of names", async () => {
    const garden = await makeTestGarden(projectRoot)
    garden.setRawWorkflowConfigs([
      { name: "c", description: "c-desc", ...defaultWorkflowConf },
      { name: "a", description: "a-desc", ...defaultWorkflowConf },
      { name: "b", description: "b-desc", ...defaultWorkflowConf },
    ])
    const log = garden.log
    const command = new GetWorkflowsCommand()

    const res = await command.action({
      garden,
      log,
      args: { workflows: ["a", "c"] },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result.length).to.eq(2)
    expect(res.result[0].name).to.eq("a")
    expect(res.result[0].description).to.eq("a-desc")
    expect(res.result[1].name).to.eq("c")
    expect(res.result[1].description).to.eq("c-desc")
  })
})
