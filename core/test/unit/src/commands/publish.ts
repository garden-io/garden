/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { it } from "mocha"
import { expect } from "chai"
import { PublishCommand } from "../../../../src/commands/publish.js"
import { withDefaultGlobalOpts, makeTestGarden, getAllTaskResults, getDataDir } from "../../../helpers.js"
import { taskResultOutputs } from "../../../helpers.js"
import cloneDeep from "fast-copy"

import type { PublishBuildAction } from "../../../../src/plugin/handlers/Build/publish.js"
import type { GardenPluginSpec } from "../../../../src/plugin/plugin.js"
import { ACTION_RUNTIME_LOCAL, createGardenPlugin } from "../../../../src/plugin/plugin.js"
import type { ConvertModuleParams } from "../../../../src/plugin/handlers/Module/convert.js"
import { PublishTask } from "../../../../src/tasks/publish.js"
import { joi } from "../../../../src/config/common.js"
import { execBuildSpecSchema } from "../../../../src/plugins/exec/build.js"
import type { ActionTypeHandlerParamsType } from "../../../../src/plugin/handlers/base/base.js"
import { styles } from "../../../../src/logger/styles.js"

const projectRootB = getDataDir("test-project-b")

type PublishActionParams = ActionTypeHandlerParamsType<PublishBuildAction>

const testProvider = createGardenPlugin({
  name: "test-plugin",
  createModuleTypes: [
    {
      name: "test",
      docs: "asd",
      needsBuild: true,
      handlers: {
        convert: async (params: ConvertModuleParams) => {
          return {
            group: {
              kind: <const>"Group",
              path: params.module.path,
              name: params.module.name,
              actions: [
                {
                  kind: "Build",
                  type: "test",
                  name: params.module.name,
                  internal: {
                    basePath: params.module.path,
                    groupName: params.module.name,
                  },
                  timeout: params.module.build.timeout,
                  spec: {},
                },
              ],
            },
          }
        },
      },
    },
  ],
  createActionTypes: {
    Build: [
      {
        name: "test",
        docs: "Test plugin",
        schema: joi.object().zodSchema(execBuildSpecSchema),
        handlers: {
          publish: async ({ tagOverride }: PublishActionParams) => {
            return {
              state: "ready",
              detail: { published: true, identifier: tagOverride },
              outputs: {},
            }
          },
          build: async (_params) => ({
            state: "ready",
            detail: {
              runtime: ACTION_RUNTIME_LOCAL,
            },
            outputs: {},
          }),
        },
      },
    ],
  },
})

async function getTestGarden(plugin: GardenPluginSpec = testProvider) {
  const garden = await makeTestGarden(projectRootB, { plugins: [plugin], onlySpecifiedPlugins: true })
  await garden.clearBuilds()
  return garden
}

describe("PublishCommand", () => {
  // TODO: Verify that services don't get redeployed when same version is already deployed.
  const command = new PublishCommand()

  it("should build and publish builds in a project", async () => {
    const garden = await getTestGarden()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      args: {
        names: undefined,
      },
      opts: withDefaultGlobalOpts({
        "force-build": false,
        "tag": undefined,
      }),
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined

    const graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })

    const versionA = graph.getBuild("module-a").versionString()
    const versionB = graph.getBuild("module-b").versionString()
    const versionC = graph.getBuild("module-c").versionString()

    // detail.identifier is undefined because --tag option was not specified; The plugin needs to calculate the tag itself, the test plugin will just return the tagOverride value.
    expect(taskResultOutputs(result!)).to.eql({
      "publish.module-a": {
        outputs: {},
        detail: {},
        state: "ready",
        version: versionA,
      },
      "publish.module-b": {
        outputs: {},
        detail: {},
        state: "ready",
        version: versionB,
      },
      "publish.module-c": {
        outputs: {},
        detail: {},
        state: "ready",
        version: versionC,
      },
    })
  })

  it("should optionally force new build", async () => {
    const garden = await getTestGarden()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      args: {
        names: undefined,
      },
      opts: withDefaultGlobalOpts({
        "force-build": true,
        "tag": undefined,
      }),
    })

    const allResults = getAllTaskResults(result?.graphResults!)

    expect(allResults["build.module-a"]?.processed).to.be.true
    expect(allResults["build.module-b"]?.processed).to.be.true
  })

  it("should optionally build a selected build", async () => {
    const garden = await getTestGarden()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      args: {
        names: ["module-a"],
      },
      opts: withDefaultGlobalOpts({
        "force-build": false,
        "tag": undefined,
      }),
    })

    expect(Object.keys(taskResultOutputs(result!))).to.eql(["publish.module-a"])
  })

  it("should respect allowPublish flag", async () => {
    const garden = await getTestGarden()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      args: {
        names: ["module-c"],
      },
      opts: withDefaultGlobalOpts({
        "force-build": false,
        "tag": undefined,
      }),
    })

    expect(Object.keys(taskResultOutputs(result!))).to.eql(["publish.module-c"])
  })

  it("should fail gracefully if action type does not have a provider for publish", async () => {
    const noHandlerPlugin = cloneDeep(testProvider)
    delete noHandlerPlugin.createActionTypes.Build[0].handlers.publish
    const garden = await getTestGarden(noHandlerPlugin)
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      args: {
        names: ["module-a"],
      },
      opts: withDefaultGlobalOpts({
        "force-build": false,
        "tag": undefined,
      }),
    })

    const res = taskResultOutputs(result!)["publish.module-a"]

    expect(res).to.exist
    expect(res.state).to.equal("unknown")
    expect(res.detail.message).to.be.equal(styles.warning("No publish handler available for type test"))
  })
})

describe("PublishTask", () => {
  it("should apply the specified tag to the published build", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const graph = await garden.getConfigGraph({ log, emit: true })
    const builds = graph.getBuilds()

    const tasks = builds.map((action) => {
      return new PublishTask({
        garden,
        graph,
        log,
        action,
        forceBuild: false,
        tagOverrideTemplate: "foo",
        force: false,
      })
    })

    const processed = await garden.processTasks({ tasks, throwOnError: true })
    const graphResultsMap = processed.results.getMap()
    expect(graphResultsMap["publish.module-a"]!.result.detail.published).to.be.true
    expect(graphResultsMap["publish.module-a"]!.result.detail.identifier).to.equal("foo")
    expect(graphResultsMap["publish.module-b"]!.result.detail.published).to.be.true
    expect(graphResultsMap["publish.module-b"]!.result.detail.identifier).to.equal("foo")
  })

  it("should resolve a templated tag and apply to the builds", async () => {
    const garden = await getTestGarden()
    const log = garden.log

    const graph = await garden.getConfigGraph({ log, emit: true })
    const builds = graph.getBuilds()

    const tasks = builds.map((action) => {
      return new PublishTask({
        garden,
        graph,
        log,
        action,
        forceBuild: false,
        tagOverrideTemplate: "v1.0-${module.name}-${module.version}",
        force: false,
      })
    })

    const processed = await garden.processTasks({ tasks, throwOnError: true })
    const graphResultsMap = processed.results.getMap()
    const verA = graph.getBuild("module-a").versionString()
    const verB = graph.getBuild("module-b").versionString()

    expect(graphResultsMap["publish.module-a"]!.result.detail.published).to.be.true
    expect(graphResultsMap["publish.module-a"]!.result.detail.identifier).to.equal(`v1.0-module-a-${verA}`)
    expect(graphResultsMap["publish.module-b"]!.result.detail.published).to.be.true
    expect(graphResultsMap["publish.module-b"]!.result.detail.identifier).to.equal(`v1.0-module-b-${verB}`)
  })

  it("should pass tagOverride=undefined to plugin handler if tagOverride was undefined", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const graph = await garden.getConfigGraph({ log, emit: true })
    const builds = graph.getBuilds()

    const tasks = builds.map((action) => {
      return new PublishTask({
        garden,
        graph,
        log,
        action,
        forceBuild: false,
        tagOverrideTemplate: undefined,
        force: false,
      })
    })

    const processed = await garden.processTasks({ tasks, throwOnError: true })
    const graphResultsMap = processed.results.getMap()
    expect(graphResultsMap["publish.module-a"]!.result.detail.published).to.be.true
    expect(graphResultsMap["publish.module-a"]!.result.detail.identifier).to.equal(undefined)
    expect(graphResultsMap["publish.module-b"]!.result.detail.published).to.be.true
    expect(graphResultsMap["publish.module-b"]!.result.detail.identifier).to.equal(undefined)
  })
})
