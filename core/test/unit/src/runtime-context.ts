/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "../../../src/garden"
import { makeTestGardenA } from "../../helpers"
import { ConfigGraph } from "../../../src/graph/config-graph"
import { prepareRuntimeContext } from "../../../src/runtime-context"
import { expect } from "chai"
import { ActionDependency } from "../../../src/actions/base"
import { GraphResults } from "../../../src/graph/results"
import { BuildTask } from "../../../src/tasks/build"

// TODO-G2: remove this commented code after all tests are fixed.
//  The code has been left for the additional context here.
// TODO-G2: reduce repeated code and extract helper methods (or create parameterizable tests) after all tests are fixed.
describe("prepareRuntimeContext", () => {
  let garden: Garden
  let graph: ConfigGraph

  before(async () => {
    garden = await makeTestGardenA()
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  it("should add the module version to the output envVars", async () => {
    // const module = graph.getModule("module-a")
    //
    // const runtimeContext = await prepareRuntimeContext({
    //   garden,
    //   graph,
    //   version: module.version.versionString,
    //   moduleVersion: module.version.versionString,
    //   dependencies: {
    //     build: [],
    //     deploy: [],
    //     run: [],
    //     test: [],
    //   },
    //   serviceStatuses: {},
    //   taskResults: {},
    // })

    const buildActionA = graph.getBuild("module-a")

    const buildTaskA = new BuildTask({
      garden,
      graph,
      log: garden.log,
      action: buildActionA,
      fromWatch: false,
      force: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    const graphResults = new GraphResults([buildTaskA])
    // TODO-G2: construct the valid result object here
    // const result: GraphResultFromTask<BuildTask> = {}
    // graphResults.setResult(buildTaskA, result)

    const runtimeContext = await prepareRuntimeContext({
      action: buildActionA,
      graph,
      graphResults,
    })

    expect(runtimeContext.envVars.GARDEN_VERSION).to.equal(buildActionA.versionString())
    expect(runtimeContext.envVars.GARDEN_MODULE_VERSION).to.equal(buildActionA.versionString())
  })

  it("should add outputs for every build dependency output", async () => {
    // const module = graph.getModule("module-a")
    // const moduleB = graph.getModule("module-b")
    //
    // moduleB.outputs = { "my-output": "meep" }
    //
    // const runtimeContext = await prepareRuntimeContext({
    //   garden,
    //   graph,
    //   version: module.version.versionString,
    //   moduleVersion: module.version.versionString,
    //   dependencies: {
    //     build: [moduleB],
    //     deploy: [],
    //     run: [],
    //     test: [],
    //   },
    //   serviceStatuses: {},
    //   taskResults: {},
    // })

    const buildActionA = graph.getBuild("module-a")
    const buildActionB = graph.getBuild("module-b")

    const depRef: ActionDependency = { kind: "Build", name: "module-b", type: "explicit" }
    buildActionA.addDependency(depRef)

    const outputs = { "my-output": "meep" }

    const buildTaskA = new BuildTask({
      garden,
      graph,
      log: garden.log,
      action: buildActionA,
      fromWatch: false,
      force: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    const graphResults = new GraphResults([buildTaskA])
    // TODO-G2: construct the valid result object here, and include the outputs defined above
    // const result: GraphResultFromTask<BuildTask> = {}
    // graphResults.setResult(buildTaskA, result)

    const runtimeContext = await prepareRuntimeContext({
      action: buildActionA,
      graph,
      graphResults,
    })

    expect(runtimeContext.dependencies).to.eql([
      {
        moduleName: "module-b",
        name: "module-b",
        outputs,
        type: "build",
        version: buildActionB.versionString(),
      },
    ])
  })

  it("should add outputs for every service dependency runtime output", async () => {
    // const module = graph.getModule("module-a")
    // const serviceB = graph.getDeploy("service-b")
    //
    // const outputs = {
    //   "my-output": "moop",
    // }
    //
    // const runtimeContext = await prepareRuntimeContext({
    //   garden,
    //   graph,
    //   version: module.version.versionString,
    //   moduleVersion: module.version.versionString,
    //   dependencies: {
    //     build: [],
    //     deploy: [serviceB],
    //     run: [],
    //     test: [],
    //   },
    //   serviceStatuses: {
    //     "service-b": {
    //       state: "ready",
    //       outputs,
    //       detail: {},
    //     },
    //   },
    //   taskResults: {},
    // })

    const buildActionA = graph.getBuild("module-a")
    const deployActionB = graph.getDeploy("service-b")

    const depRef: ActionDependency = { kind: "Deploy", name: "service-b", type: "explicit" }
    buildActionA.addDependency(depRef)

    const outputs = { "my-output": "moop" }

    const buildTaskA = new BuildTask({
      garden,
      graph,
      log: garden.log,
      action: buildActionA,
      fromWatch: false,
      force: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    const graphResults = new GraphResults([buildTaskA])
    // TODO-G2: construct the valid result object here, and include the outputs defined above
    // const result: GraphResultFromTask<BuildTask> = {}
    // graphResults.setResult(buildTaskA, result)

    const runtimeContext = await prepareRuntimeContext({
      action: buildActionA,
      graph,
      graphResults,
    })

    expect(runtimeContext.dependencies).to.eql([
      {
        moduleName: "module-b",
        name: "service-b",
        outputs,
        type: "service",
        version: deployActionB.versionString(),
      },
    ])
  })

  it("should add outputs for every task dependency runtime output", async () => {
    // const module = graph.getModule("module-a")
    // const taskB = graph.getRun("task-b")
    //
    // const outputs = {
    //   "my-output": "mewp",
    // }
    //
    // const runtimeContext = await prepareRuntimeContext({
    //   garden,
    //   graph,
    //   version: module.version.versionString,
    //   moduleVersion: module.version.versionString,
    //   dependencies: {
    //     build: [],
    //     deploy: [],
    //     run: [taskB],
    //     test: [],
    //   },
    //   serviceStatuses: {},
    //   taskResults: {
    //     "task-b": {
    //       command: ["foo"],
    //       completedAt: new Date(),
    //       log: "mewp",
    //       moduleName: "module-b",
    //       outputs,
    //       startedAt: new Date(),
    //       success: true,
    //       taskName: "task-b",
    //       version: taskB.versionString(),
    //     },
    //   },
    // })

    const buildActionA = graph.getBuild("module-a")
    const runActionB = graph.getRun("task-b")

    const depRef: ActionDependency = { kind: "Run", name: "task-b", type: "explicit" }
    buildActionA.addDependency(depRef)

    const outputs = { "my-output": "mewp" }

    const buildTaskA = new BuildTask({
      garden,
      graph,
      log: garden.log,
      action: buildActionA,
      fromWatch: false,
      force: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    const graphResults = new GraphResults([buildTaskA])
    // TODO-G2: construct the valid result object here, and include the outputs defined above
    // const result: GraphResultFromTask<BuildTask> = {}
    // graphResults.setResult(buildTaskA, result)

    const runtimeContext = await prepareRuntimeContext({
      action: buildActionA,
      graph,
      graphResults,
    })

    expect(runtimeContext.dependencies).to.eql([
      {
        moduleName: "module-b",
        name: "task-b",
        outputs,
        type: "task",
        version: runActionB.versionString(),
      },
    ])
  })
})
