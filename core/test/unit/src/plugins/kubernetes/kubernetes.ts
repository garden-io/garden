/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, gardenPlugin } from "../../../../../src/plugins/kubernetes/kubernetes"
import { KubernetesConfig, defaultResources, defaultStorage } from "../../../../../src/plugins/kubernetes/config"
import { defaultSystemNamespace } from "../../../../../src/plugins/kubernetes/system"
import { makeDummyGarden } from "../../../../../src/cli/cli"
import { expect } from "chai"
import { TempDirectory, makeTempDir, grouped } from "../../../../helpers"
import { providerFromConfig } from "../../../../../src/config/provider"

describe("kubernetes configureProvider", () => {
  const basicConfig: KubernetesConfig = {
    name: "kubernetes",
    buildMode: "local-docker",
    context: "my-cluster",
    defaultHostname: "my.domain.com",
    forceSsl: false,
    gardenSystemNamespace: defaultSystemNamespace,
    imagePullSecrets: [],
    ingressClass: "nginx",
    ingressHttpPort: 80,
    ingressHttpsPort: 443,
    resources: defaultResources,
    storage: defaultStorage,
    systemNodeSelector: {},
    registryProxyTolerations: [],
    tlsCertificates: [],
    _systemServices: [],
  }

  let tmpDir: TempDirectory

  beforeEach(async () => {
    tmpDir = await makeTempDir({ git: true })
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  grouped("cluster-docker").context("cluster-docker mode", () => {
    it("should set a default deploymentRegistry with projectName as namespace", async () => {
      const garden = await makeDummyGarden(tmpDir.path)
      const config: KubernetesConfig = {
        ...basicConfig,
        buildMode: "cluster-docker",
      }

      const result = await configureProvider({
        ctx: await garden.getPluginContext(
          providerFromConfig({
            plugin: gardenPlugin(),
            config: basicConfig,
            dependencies: {},
            moduleConfigs: [],
            status: { ready: false, outputs: {} },
          })
        ),
        environmentName: "default",
        projectName: garden.projectName,
        projectRoot: garden.projectRoot,
        config,
        log: garden.log,
        dependencies: {},
        configStore: garden.configStore,
      })

      expect(result.config.deploymentRegistry).to.eql({
        hostname: "127.0.0.1:5000",
        namespace: garden.projectName,
      })
    })

    it("should allow overriding the deploymentRegistry namespace for the in-cluster registry", async () => {
      const garden = await makeDummyGarden(tmpDir.path)
      const config: KubernetesConfig = {
        ...basicConfig,
        buildMode: "cluster-docker",
        deploymentRegistry: {
          hostname: "127.0.0.1:5000",
          namespace: "my-namespace",
        },
      }

      const result = await configureProvider({
        ctx: await garden.getPluginContext(
          providerFromConfig({
            plugin: gardenPlugin(),
            config: basicConfig,
            dependencies: {},
            moduleConfigs: [],
            status: { ready: false, outputs: {} },
          })
        ),
        environmentName: "default",
        projectName: garden.projectName,
        projectRoot: garden.projectRoot,
        config,
        log: garden.log,
        dependencies: {},
        configStore: garden.configStore,
      })

      expect(result.config.deploymentRegistry).to.eql({
        hostname: "127.0.0.1:5000",
        namespace: "my-namespace",
      })
    })
  })
})
