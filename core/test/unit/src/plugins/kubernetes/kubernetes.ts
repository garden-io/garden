/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, gardenPlugin } from "../../../../../src/plugins/kubernetes/kubernetes.js"
import type { KubernetesConfig } from "../../../../../src/plugins/kubernetes/config.js"
import { defaultResources } from "../../../../../src/plugins/kubernetes/config.js"
import { expect } from "chai"
import type { TempDirectory } from "../../../../helpers.js"
import { makeTempDir } from "../../../../helpers.js"
import { providerFromConfig } from "../../../../../src/config/provider.js"
import type { Garden } from "../../../../../src/garden.js"
import { makeDummyGarden } from "../../../../../src/garden.js"
import {
  defaultSystemNamespace,
  defaultUtilImageRegistryDomain,
} from "../../../../../src/plugins/kubernetes/constants.js"
import { UnresolvedProviderConfig } from "../../../../../src/config/project.js"

describe("kubernetes configureProvider", () => {
  const basicConfig: KubernetesConfig = {
    name: "kubernetes",
    utilImageRegistryDomain: defaultUtilImageRegistryDomain,
    buildMode: "local-docker",
    context: "my-cluster",
    defaultHostname: "hostname.invalid",
    deploymentRegistry: {
      hostname: "index.docker.io",
      namespace: "garden-ci",
      insecure: false,
    },
    forceSsl: false,
    gardenSystemNamespace: defaultSystemNamespace,
    imagePullSecrets: [],
    copySecrets: [],
    ingressClass: "nginx",
    ingressHttpPort: 80,
    ingressHttpsPort: 443,
    resources: defaultResources,
    setupIngressController: null,
    systemNodeSelector: {},
    tlsCertificates: [],
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
      ctx: await garden.getPluginContext({
        provider: providerFromConfig({
          plugin: gardenPlugin(),
          config: new UnresolvedProviderConfig(
            config.name,
            config.dependencies || [],
            // @ts-expect-error todo: correct types for unresolved configs
            config
          ),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      namespace: <any>"foo",
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
})
