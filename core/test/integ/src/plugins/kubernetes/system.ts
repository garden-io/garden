/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Garden } from "../../../../../src/garden.js"
import type { Provider } from "../../../../../src/config/provider.js"
import type { KubernetesConfig, KubernetesPluginContext } from "../../../../../src/plugins/kubernetes/config.js"
import { getDataDir, makeTestGarden } from "../../../../helpers.js"
import { expect } from "chai"
import { TestTask } from "../../../../../src/tasks/test.js"
import { getSystemGarden } from "../../../../../src/plugins/kubernetes/system.js"
import { getKubernetesSystemVariables } from "../../../../../src/plugins/kubernetes/init.js"
import { convertModules } from "../../../../../src/resolve-module.js"
import type { TestAction } from "../../../../../src/actions/test.js"
import { actionFromConfig } from "../../../../../src/graph/actions.js"

describe("System services", () => {
  let garden: Garden
  let provider: Provider<KubernetesConfig>

  before(async () => {
    const root = getDataDir("test-projects", "container")
    garden = await makeTestGarden(root)
    provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as Provider<KubernetesConfig>
  })

  after(async () => {
    garden.close()
  })

  // TODO: Revisit this. Doesn't make sense to have the kubernetes provider depend on a provider that depends on
  //       the kubernetes provider.
  it.skip("should use conftest to check whether system services have a valid config", async () => {
    const ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    const variables = getKubernetesSystemVariables(provider.config)
    const systemGarden = await getSystemGarden(ctx, variables, garden.log)
    const graph = await systemGarden.getConfigGraph({ log: garden.log, emit: false })
    const conftestModuleNames = (await graph.getModules())
      .filter((module) => module.name.startsWith("conftest-"))
      .map((m) => m.name)
    expect(conftestModuleNames.sort()).to.eql(["conftest-ingress-controller", "conftest-nginx-kind", "conftest-util"])
  })

  it.skip("should check whether system modules pass the conftest test", async () => {
    const ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    const variables = getKubernetesSystemVariables(provider.config)
    const systemGarden = await getSystemGarden(ctx, variables, garden.log)
    const graph = await systemGarden.getConfigGraph({ log: garden.log, emit: false })
    const modules = graph.getModules().filter((module) => module.name.startsWith("conftest-"))
    const actions = await convertModules(systemGarden, systemGarden.log, modules, graph.moduleGraph)
    const router = await systemGarden.getActionRouter()
    const tests = actions.actions.filter((a) => a.kind === "Test")

    await Promise.all(
      tests.map(async (testConfig) => {
        const action = (await actionFromConfig({
          config: testConfig,
          configsByKey: {},
          garden: systemGarden,
          graph,
          log: systemGarden.log,
          router,
          mode: "default",
          linkedSources: {},
        })) as TestAction<any, any>
        const resolved = await systemGarden.resolveAction<TestAction>({ action, graph, log: systemGarden.log })
        const testTask = new TestTask({
          garden: systemGarden,
          log: garden.log,
          action: resolved,

          force: false,

          graph,
        })
        const key = testTask.getBaseKey()
        const result = await systemGarden.processTasks({
          tasks: [testTask],
          throwOnError: false,
          log: systemGarden.log,
        })
        expect(result[key]).to.exist
        expect(result[key]?.error).to.not.exist
      })
    )
  })
})
