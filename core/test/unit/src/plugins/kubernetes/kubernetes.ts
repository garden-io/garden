/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, gardenPlugin } from "../../../../../src/plugins/kubernetes/kubernetes"
import { KubernetesConfig, defaultResources, defaultStorage } from "../../../../../src/plugins/kubernetes/config"
import { defaultSystemNamespace } from "../../../../../src/plugins/kubernetes/system"
import { expect } from "chai"
import { TempDirectory, makeTempDir } from "../../../../helpers"
import { providerFromConfig } from "../../../../../src/config/provider"
import { Garden } from "../../../../../src/garden"
import { makeDummyGarden } from "../../../../../src/cli/cli"

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
  let garden: Garden

  beforeEach(async () => {
    tmpDir = await makeTempDir({ git: true })
    garden = await makeDummyGarden(tmpDir.path, { commandInfo: { name: "test", args: {}, opts: {} } })
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  async function configure(config: KubernetesConfig) {
    return configureProvider({
      ctx: await garden.getPluginContext(
        providerFromConfig({
          plugin: gardenPlugin(),
          config,
          dependencies: {},
          moduleConfigs: [],
          status: { ready: false, outputs: {} },
        })
      ),
      namespace: "default",
      environmentName: "default",
      projectName: garden.projectName,
      projectRoot: garden.projectRoot,
      config,
      log: garden.log,
      dependencies: {},
      configStore: garden.configStore,
    })
  }

  it("should apply a default namespace if none is configured", async () => {
    const result = await configure({
      ...basicConfig,
      buildMode: "kaniko",
      namespace: undefined,
    })

    expect(result.config.namespace).to.eql({
      name: `${garden.projectName}-default`,
    })
  })

  it("should convert the string shorthand for the namespace parameter", async () => {
    const result = await configure({
      ...basicConfig,
      buildMode: "kaniko",
      namespace: <any>(<unknown>"foo"),
    })

    expect(result.config.namespace).to.eql({
      name: "foo",
    })
  })

  it("should pass through a full namespace spec", async () => {
    const result = await configure({
      ...basicConfig,
      buildMode: "kaniko",
      namespace: {
        name: "foo",
        annotations: { bla: "ble" },
        labels: { fla: "fle" },
      },
    })

    expect(result.config.namespace).to.eql({
      name: "foo",
      annotations: { bla: "ble" },
      labels: { fla: "fle" },
    })
  })

  it("should set a default deploymentRegistry with projectName as namespace", async () => {
    const result = await configure({
      ...basicConfig,
      buildMode: "kaniko",
    })

    expect(result.config.deploymentRegistry).to.eql({
      hostname: "127.0.0.1:5000",
      namespace: garden.projectName,
    })
  })

  it("should allow overriding the deploymentRegistry namespace for the in-cluster registry", async () => {
    const result = await configure({
      ...basicConfig,
      buildMode: "kaniko",
      deploymentRegistry: {
        hostname: "127.0.0.1:5000",
        namespace: "my-namespace",
      },
    })

    expect(result.config.deploymentRegistry).to.eql({
      hostname: "127.0.0.1:5000",
      namespace: "my-namespace",
    })
  })
})
