/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { it } from "mocha"
import { expect } from "chai"
import { PublishCommand } from "../../../../src/commands/publish"
import { withDefaultGlobalOpts, makeTestGarden, getAllTaskResults, getDataDir } from "../../../helpers"
import { taskResultOutputs } from "../../../helpers"
import { cloneDeep } from "lodash"
import { execBuildActionSchema } from "../../../../src/plugins/exec/config"
import { PublishActionResult, PublishBuildAction } from "../../../../src/plugin/handlers/Build/publish"
import { createGardenPlugin, GardenPlugin } from "../../../../src/plugin/plugin"
import { ConvertModuleParams } from "../../../../src/plugin/handlers/Module/convert"

const projectRootB = getDataDir("test-project-b")

type PublishActionParams = PublishBuildAction["_paramsType"]
type PublishActionResultDetail = PublishActionResult["detail"]

const publishAction = async ({ tag }: PublishActionParams): Promise<PublishActionResultDetail> => {
  return { published: true, identifier: tag }
}

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
              kind: <"Group">"Group",
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
        schema: execBuildActionSchema(),
        handlers: {
          publish: async (params: PublishActionParams) => {
            return {
              state: "ready",
              detail: await publishAction(params),
              outputs: {},
            }
          },
          build: async (_params) => ({
            state: "ready",
            detail: {},
            outputs: {},
          }),
        },
      },
    ],
  },
})

async function getTestGarden(plugin: GardenPlugin = testProvider) {
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
      headerLog: log,
      footerLog: log,
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

    expect(taskResultOutputs(result!)).to.eql({
      "publish.module-a": {
        detail: {
          identifier: versionA,
          published: true,
        },
        outputs: {},
        state: "ready",
        version: versionA,
      },
      "publish.module-b": {
        detail: {
          identifier: versionB,
          published: true,
        },
        outputs: {},
        state: "ready",
        version: versionB,
      },
      "publish.module-c": {
        detail: {
          published: false,
        },
        outputs: {},
        state: "ready",
        version: versionC,
      },
    })
  })

  it("should apply the specified tag to the published builds", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const tag = "foo"

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        names: undefined,
      },
      opts: withDefaultGlobalOpts({
        "force-build": false,
        tag,
      }),
    })

    const publishActionResult = taskResultOutputs(result!)

    expect(publishActionResult["publish.module-a"].detail.published).to.be.true
    expect(publishActionResult["publish.module-a"].detail.identifier).to.equal(tag)
    expect(publishActionResult["publish.module-b"].detail.published).to.be.true
    expect(publishActionResult["publish.module-b"].detail.identifier).to.equal(tag)
  })

  it("should resolve a templated tag and apply to the builds", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const tag = "v1.0-${module.name}-${module.version}"

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        names: undefined,
      },
      opts: withDefaultGlobalOpts({
        "force-build": false,
        tag,
      }),
    })

    const publishActionResult = taskResultOutputs(result!)
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const verA = graph.getBuild("module-a").versionString()
    const verB = graph.getBuild("module-b").versionString()

    expect(publishActionResult["publish.module-a"].detail.published).to.be.true
    expect(publishActionResult["publish.module-a"].detail.identifier).to.equal(`v1.0-module-a-${verA}`)
    expect(publishActionResult["publish.module-b"].detail.published).to.be.true
    expect(publishActionResult["publish.module-b"].detail.identifier).to.equal(`v1.0-module-b-${verB}`)
  })

  it("should optionally force new build", async () => {
    const garden = await getTestGarden()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
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
      headerLog: log,
      footerLog: log,
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
      headerLog: log,
      footerLog: log,
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
      headerLog: log,
      footerLog: log,
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
    expect(res.detail.published).to.be.false
    expect(res.detail.message).to.be.equal(chalk.yellow("No publish handler available for type test"))
  })
})
