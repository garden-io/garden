/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "../../../../../src/garden"
import { Provider } from "../../../../../src/config/provider"
import { KubernetesConfig, KubernetesPluginContext } from "../../../../../src/plugins/kubernetes/config"
import { getDataDir, makeTestGarden } from "../../../../helpers"
import { expect } from "chai"
import { TestTask } from "../../../../../src/tasks/test"
import { getSystemGarden } from "../../../../../src/plugins/kubernetes/system"
import { getKubernetesSystemVariables } from "../../../../../src/plugins/kubernetes/init"
import Bluebird = require("bluebird")

describe("System services", () => {
  let garden: Garden
  let provider: Provider<KubernetesConfig>

  before(async () => {
    const root = getDataDir("test-projects", "container")
    garden = await makeTestGarden(root)
    provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as Provider<KubernetesConfig>
  })

  after(async () => {
    await garden.close()
  })

  // TODO: Revisit this. Doesn't make sense to have the kubernetes provider depend on a provider that depends on
  //       the kubernetes provider.
  it.skip("should use conftest to check whether system services have a valid config", async () => {
    const ctx = <KubernetesPluginContext>await garden.getPluginContext(provider)
    const variables = getKubernetesSystemVariables(provider.config)
    const systemGarden = await getSystemGarden(ctx, variables, garden.log)
    const graph = await systemGarden.getConfigGraph(garden.log)
    const conftestModuleNames = (await graph.getModules())
      .filter((module) => module.name.startsWith("conftest-"))
      .map((m) => m.name)
    expect(conftestModuleNames.sort()).to.eql([
      "conftest-build-sync",
      "conftest-docker-daemon",
      "conftest-docker-registry",
      "conftest-ingress-controller",
      "conftest-nfs-provisioner",
      "conftest-nginx-kind",
      "conftest-registry-proxy",
      "conftest-util",
    ])
  })

  it.skip("should check whether system modules pass the conftest test", async () => {
    const ctx = <KubernetesPluginContext>await garden.getPluginContext(provider)
    const variables = getKubernetesSystemVariables(provider.config)
    const systemGarden = await getSystemGarden(ctx, variables, garden.log)
    const graph = await systemGarden.getConfigGraph(garden.log)
    const modules = (await graph.getModules()).filter((module) => module.name.startsWith("conftest-"))

    await Bluebird.map(modules, async (module) => {
      const testTask = new TestTask({
        garden: systemGarden,
        module,
        log: garden.log,
        graph,
        testConfig: module.testConfigs[0] || {},
        force: true,
        forceBuild: true,
        version: module.version,
        _guard: true,
      })
      const key = testTask.getKey()
      const result = await systemGarden.processTasks([testTask])
      expect(result[key]).to.exist
      expect(result[key]?.error).to.not.exist
    })
  })
})
