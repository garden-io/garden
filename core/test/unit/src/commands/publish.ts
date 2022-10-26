/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { it } from "mocha"
import { join } from "path"
import { expect } from "chai"
import { PublishCommand } from "../../../../src/commands/publish"
import { keyBy } from "lodash"
import { withDefaultGlobalOpts, dataDir, makeTestGarden } from "../../../helpers"
import { taskResultOutputs } from "../../../helpers"
import { cloneDeep } from "lodash"
import { execBuildActionSchema } from "../../../../src/plugins/exec/config"
import { PublishActionResult, PublishBuildAction } from "../../../../src/plugin/handlers/build/publish"
import { createGardenPlugin, GardenPlugin } from "../../../../src/plugin/plugin"
import { ConvertModuleParams } from "../../../../src/plugin/handlers/module/convert"

const projectRootB = join(dataDir, "test-project-b")

type PublishActionParams = PublishBuildAction["_paramsType"]
type PublishActionResultDetail = PublishActionResult["detail"]

const publishAction = async ({ tag }: PublishActionParams): Promise<PublishActionResultDetail> => {
  return { published: true, identifier: tag }
}

const defaultHandlerReturn = {
  state: <"ready">"ready",
  detail: {},
  outputs: {},
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
          build: async (params) => defaultHandlerReturn,
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
    expect(taskResultOutputs(result!)).to.eql({
      "publish.module-a": {
        detail: {
          identifier: undefined,
          published: true,
        },
        outputs: {},
        state: "ready",
      },
      "publish.module-b": {
        detail: {
          identifier: undefined,
          published: true,
        },
        outputs: {},
        state: "ready",
      },
      "publish.module-c": {
        detail: {
          published: false,
        },
        outputs: {},
        state: "ready",
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
        "tag": tag,
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
        "tag": tag,
      }),
    })

    const publishActionResult = taskResultOutputs(result!)
    const actions = (await garden.getConfigGraph({ log, emit: false })).getBuilds()
    const verA = actions.find((a) => a.name === "module-a")!.versionString()
    const verB = actions.find((a) => a.name === "module-b")!.versionString()

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

    // Errors due to a bug in the solver
    expect(taskResultOutputs(result!)).to.eql("TODO-G2")
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

    expect(taskResultOutputs(result!)).to.eql({
      "publish.module-a": {
        detail: {
          identifier: undefined,
          published: true,
        },
        outputs: {},
        state: "ready",
      },
    })
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

    expect(taskResultOutputs(result!)).to.eql({
      "publish.module-c": {
        detail: {
          published: false,
        },
        outputs: {},
        state: "ready",
      },
    })
  })

  it("should fail gracefully if action type does not have a provider for publish", async () => {
    const noHandlerPlugin = cloneDeep(testProvider)
    delete testProvider.createActionTypes.Build[0].handlers.publish
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

    expect(taskResultOutputs(result!)).to.eql({
      "publish.module-a": {
        outputs: {},
        state: "unknown",
        detail: {
          published: false,
          message: chalk.yellow("No publish handler available for type test"),
        },
      },
    })
  })
})
