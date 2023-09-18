/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { providerFromConfig } from "../../../../../src/config/provider"
import { Garden } from "../../../../../src/garden"
import { getRootLogger } from "../../../../../src/logger/logger"
import { configureProvider } from "../../../../../src/plugins/kubernetes/garden-kubernetes/config"
import { gardenPlugin } from "../../../../../src/plugins/kubernetes/garden-kubernetes/garden-kubernetes"
import { TempDirectory, expectError, makeTempDir, makeTestGardenA } from "../../../../helpers"
import { FakeCloudApi } from "../../../../helpers/api"

describe("garden-kubernetes configureProvider", () => {
  const basicConfig = {
    name: "garden-kubernetes",
  }

  let tmpDir: TempDirectory
  let garden: Garden

  beforeEach(async () => {
    tmpDir = await makeTempDir({ git: true })
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  async function configure(config) {
    return configureProvider({
      ctx: await garden.getPluginContext({
        provider: providerFromConfig({
          plugin: gardenPlugin(),
          config,
          dependencies: {},
          moduleConfigs: [],
          status: { ready: false, outputs: {} },
        }),
        templateContext: undefined,
        events: undefined,
      }),
      namespace: "default",
      environmentName: "default",
      projectName: garden.projectName,
      projectRoot: garden.projectRoot,
      config,
      log: garden.log,
      dependencies: {},
      configStore: garden.localConfigStore,
    })
  }

  it("should throw an error in configure provider if user is not logged in", async () => {
    garden = await makeTestGardenA(undefined)
    await expectError(
      () =>
        configure({
          ...basicConfig,
        }),
      (err) => {
        expect(err.message).to.contain(
          "You are not logged in. You must be logged into Garden Cloud in order to use garden-kubernetes provider"
        )
      }
    )
  })

  it("should throw an error for Garden Enterprise", async () => {
    const cloudApi = await FakeCloudApi.factory({ log: getRootLogger().createLog() })
    garden = await makeTestGardenA(undefined, { cloudApi })
    await expectError(
      () =>
        configure({
          ...basicConfig,
        }),
      (err) => {
        expect(err.message).to.equal("garden-kubernetes provider is currently not supported for Garden Enterprise.")
      }
    )
  })
})
