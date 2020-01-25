/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { it } from "mocha"
import { join } from "path"
import { expect } from "chai"
import { Garden } from "../../../../src/garden"
import { PublishCommand } from "../../../../src/commands/publish"
import {
  makeTestGardenA,
  configureTestModule,
  withDefaultGlobalOpts,
  dataDir,
  testModuleSpecSchema,
} from "../../../helpers"
import { taskResultOutputs } from "../../../helpers"
import { createGardenPlugin } from "../../../../src/types/plugin/plugin"

const projectRootB = join(dataDir, "test-project-b")

const getBuildStatus = async () => {
  return { ready: true }
}

const build = async () => {
  return { fresh: true }
}

const publishModule = async () => {
  return { published: true }
}

const testProvider = createGardenPlugin({
  name: "test-plugin",
  createModuleTypes: [
    {
      name: "test",
      docs: "Test plugin",
      schema: testModuleSpecSchema,
      handlers: {
        configure: configureTestModule,
        getBuildStatus,
        build,
        publish: publishModule,
      },
    },
  ],
})

async function getTestGarden() {
  const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
  await garden.clearBuilds()
  return garden
}

describe("PublishCommand", () => {
  // TODO: Verify that services don't get redeployed when same version is already deployed.

  it("should build and publish modules in a project", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        modules: undefined,
      },
      opts: withDefaultGlobalOpts({
        "allow-dirty": false,
        "force-build": false,
      }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: false },
      "build.module-b": { fresh: false },
      "publish.module-a": { published: true },
      "publish.module-b": { published: true },
      "publish.module-c": { published: false },
      "stage-build.module-a": {},
      "stage-build.module-b": {},
    })
  })

  it("should optionally force new build", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        modules: undefined,
      },
      opts: withDefaultGlobalOpts({
        "allow-dirty": false,
        "force-build": true,
      }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true },
      "build.module-b": { fresh: true },
      "publish.module-a": { published: true },
      "publish.module-b": { published: true },
      "publish.module-c": { published: false },
      "stage-build.module-a": {},
      "stage-build.module-b": {},
    })
  })

  it("should optionally build selected module", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        modules: ["module-a"],
      },
      opts: withDefaultGlobalOpts({
        "allow-dirty": false,
        "force-build": false,
      }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: false },
      "publish.module-a": { published: true },
      "stage-build.module-a": {},
    })
  })

  it("should respect allowPublish flag", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        modules: ["module-c"],
      },
      opts: withDefaultGlobalOpts({
        "allow-dirty": false,
        "force-build": false,
      }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "publish.module-c": { published: false },
    })
  })

  it("should fail gracefully if module does not have a provider for publish", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    await garden.clearBuilds()

    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        modules: ["module-a"],
      },
      opts: withDefaultGlobalOpts({
        "allow-dirty": false,
        "force-build": false,
      }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": {
        buildLog: "A",
        fresh: true,
      },
      "publish.module-a": {
        published: false,
        message: chalk.yellow("No publish handler available for module type test"),
      },
      "stage-build.module-a": {},
    })
  })
})
