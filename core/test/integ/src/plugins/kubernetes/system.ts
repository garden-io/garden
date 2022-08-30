/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
import { convertModules } from "../../../../../src/resolve-module"
import { TestAction } from "../../../../../src/actions/test"
import { actionFromConfig } from "../../../../../src/graph/actions"

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
    const graph = await systemGarden.getConfigGraph({ log: garden.log, emit: false })
    const conftestModuleNames = (await graph.getModules())
      .filter((module) => module.name.startsWith("conftest-"))
      .map((m) => m.name)
    expect(conftestModuleNames.sort()).to.eql(["conftest-ingress-controller", "conftest-nginx-kind", "conftest-util"])
  })

  it.skip("should check whether system modules pass the conftest test", async () => {
    const ctx = <KubernetesPluginContext>await garden.getPluginContext(provider)
    const variables = getKubernetesSystemVariables(provider.config)
    const systemGarden = await getSystemGarden(ctx, variables, garden.log)
    const graph = await systemGarden.getConfigGraph({ log: garden.log, emit: false })
    const modules = graph.getModules().filter((module) => module.name.startsWith("conftest-"))
    const actions = await convertModules(systemGarden, systemGarden.log, modules, graph.moduleGraph)
    const router = await systemGarden.getActionRouter()
    const tests = actions.actions.filter((a) => a.kind === "Test")

    await Bluebird.map(tests, async (testConfig) => {
      const action = (await actionFromConfig({
        config: testConfig,
        configsByKey: {},
        garden: systemGarden,
        graph,
        log: systemGarden.log,
        router,
      })) as TestAction<any, any>
      const resolved = await systemGarden.resolveAction<TestAction>({ action, graph, log: systemGarden.log })
      const testTask = new TestTask({
        garden: systemGarden,
        log: garden.log,
        action: resolved,
        localModeDeployNames: [],
        devModeDeployNames: [],
        force: false,
        fromWatch: false,
        graph,
      })
      const key = testTask.getBaseKey()
      const result = await systemGarden.processTasks({ tasks: [testTask], throwOnError: false, log: systemGarden.log })
      expect(result[key]).to.exist
      expect(result[key]?.error).to.not.exist
    })
  })
})
