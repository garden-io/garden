/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { providerFromConfig } from "../../../../../src/config/provider.js"
import type { Garden } from "../../../../../src/garden.js"
import { configureProvider } from "../../../../../src/plugins/kubernetes/ephemeral/config.js"
import { gardenPlugin } from "../../../../../src/plugins/kubernetes/ephemeral/ephemeral.js"
import type { TempDirectory } from "../../../../helpers.js"
import { expectError, makeTempDir, makeTestGardenA } from "../../../../helpers.js"
import { FakeGardenCloudApi } from "../../../../helpers/api.js"
import { styles } from "../../../../../src/logger/styles.js"

describe("ephemeral-kubernetes configureProvider", () => {
  const basicConfig = {
    name: "ephemeral-kubernetes",
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
          `You are not logged in. You must log in with the ${styles.command(
            "garden login"
          )} command to use the ephemeral-kubernetes plugin`
        )
      }
    )
  })

  it("should throw an error for Garden Enterprise", async () => {
    garden = await makeTestGardenA(undefined, {
      overrideCloudApiFactory: async (params) =>
        FakeGardenCloudApi.factory({
          ...params,
          cloudDomain: "https://NOT.app.garden.io",
        }),
    })
    await expectError(
      () =>
        configure({
          ...basicConfig,
        }),
      (err) => {
        expect(err.message).to.equal("ephemeral-kubernetes provider is currently not supported for Garden Enterprise.")
      }
    )
  })
})
