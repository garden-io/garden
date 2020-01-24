/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { flatten } from "lodash"
import { Garden } from "../../../../../src/garden"
import { getDataDir, makeTestGarden } from "../../../../helpers"
import { ConfigGraph } from "../../../../../src/config-graph"
import { Provider } from "../../../../../src/config/provider"
import { DeployTask } from "../../../../../src/tasks/deploy"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api"
import { KubernetesConfig } from "../../../../../src/plugins/kubernetes/config"
import { getWorkloadPods } from "../../../../../src/plugins/kubernetes/util"
import { createWorkloadResource } from "../../../../../src/plugins/kubernetes/container/deployment"
import { emptyRuntimeContext } from "../../../../../src/runtime-context"

describe("util", () => {
  // TODO: Add more test cases
  describe("getWorkloadPods", () => {
    let garden: Garden
    let graph: ConfigGraph
    let provider: Provider<KubernetesConfig>
    let api: KubeApi

    before(async () => {
      const root = getDataDir("test-projects", "container")
      garden = await makeTestGarden(root)
      graph = await garden.getConfigGraph(garden.log)
      provider = (await garden.resolveProvider("local-kubernetes")) as Provider<KubernetesConfig>
      api = await KubeApi.factory(garden.log, provider)
    })

    after(async () => {
      await garden.close()
    })

    it("should return workload pods", async () => {
      const service = await graph.getService("simple-service")

      const deployTask = new DeployTask({
        force: false,
        forceBuild: false,
        garden,
        graph,
        log: garden.log,
        service,
      })

      const resource = await createWorkloadResource({
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace: "container",
        enableHotReload: false,
        log: garden.log,
        production: false,
      })
      await garden.processTasks([deployTask], { throwOnError: true })

      const pods = await getWorkloadPods(api, "container", resource)
      const services = flatten(pods.map((pod) => pod.spec.containers.map((container) => container.name)))
      expect(services).to.eql(["simple-service"])
    })
  })
})
