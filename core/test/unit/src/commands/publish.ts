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
import {
  makeTestGardenA,
  configureTestModule,
  withDefaultGlobalOpts,
  dataDir,
  testModuleSpecSchema,
  makeTestGarden,
} from "../../../helpers"
import { taskResultOutputs } from "../../../helpers"
import { createGardenPlugin } from "../../../../src/plugin/plugin"
import { keyBy } from "lodash"

const projectRootB = join(dataDir, "test-project-b")

const getBuildStatus = async () => {
  return { ready: true }
}

const build = async () => {
  return { fresh: true }
}

const publishModule = async ({ tag }: PublishModuleParams): Promise<PublishModuleResult> => {
  return { published: true, identifier: tag }
}

const testProvider = createGardenPlugin({
  name: "test-plugin",
  createModuleTypes: [
    {
      name: "test",
      docs: "Test plugin",
      schema: testModuleSpecSchema(),
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
  const garden = await makeTestGarden(projectRootB, { plugins: [testProvider] })
  await garden.clearBuilds()
  return garden
}

describe("PublishCommand", () => {
  // TODO: Verify that services don't get redeployed when same version is already deployed.
  const command = new PublishCommand()

  it("should build and publish modules in a project", async () => {
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
      "build.module-a": { fresh: false },
      "build.module-b": { fresh: false },
      "publish.module-a": { published: true, identifier: undefined },
      "publish.module-b": { published: true, identifier: undefined },
      "publish.module-c": { published: false },


    })

    const { published } = result!

    for (const res of Object.values(published)) {
      expect(res.durationMsec).to.gte(0)
      res.durationMsec = 0
    }

    const graph = await garden.getConfigGraph({ log, emit: false })
    const modules = keyBy(graph.getModules(), "name")

    expect(published).to.eql({
      "module-a": {
        published: true,
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        version: modules["module-a"].version.versionString,
        identifier: undefined,
      },
      "module-b": {
        published: true,
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        version: modules["module-b"].version.versionString,
        identifier: undefined,
      },
      "module-c": {
        published: false,
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        version: modules["module-c"].version.versionString,
      },
    })
  })

  it("should apply the specified tag to the published modules", async () => {
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

    const { published } = result!

    expect(published["module-a"].published).to.be.true
    expect(published["module-a"].identifier).to.equal(tag)
    expect(published["module-b"].published).to.be.true
    expect(published["module-b"].identifier).to.equal(tag)
  })

  it("should resolve a templated tag and apply to the modules", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const tag = "v1.0-${module.name}-${module.version}"

    const result = await command.action({
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

    const { published } = result.result!

    expect(published["module-a"].published).to.be.true
    expect(published["module-a"].identifier).to.equal(`v1.0-module-a-${published["module-a"].version}`)
    expect(published["module-b"].published).to.be.true
    expect(published["module-b"].identifier).to.equal(`v1.0-module-b-${published["module-b"].version}`)
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

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true },
      "build.module-b": { fresh: true },
      "publish.module-a": { published: true, identifier: undefined },
      "publish.module-b": { published: true, identifier: undefined },
      "publish.module-c": { published: false },


    })
  })

  it("should optionally build selected module", async () => {
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
      "build.module-a": { fresh: false },
      "publish.module-a": { published: true, identifier: undefined },

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
      "publish.module-c": { published: false },
    })
  })

  it("should fail gracefully if module does not have a provider for publish", async () => {
    const garden = await makeTestGardenA()
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
      "build.module-a": {
        buildLog: "A",
        fresh: true,
      },
      "publish.module-a": {
        published: false,
        message: chalk.yellow("No publish handler available for module type test"),
      },

    })
  })
})
