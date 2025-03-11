/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { TestGarden } from "../../../../../helpers.js"
import { findNamespaceStatusEvent } from "../../../../../helpers.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import { getKubernetesTestGarden } from "./common.js"
import { RunTask } from "../../../../../../src/tasks/run.js"
import { runResultCache } from "../../../../../../src/plugins/kubernetes/run-results.js"

describe("kubernetes-type exec Run", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getKubernetesTestGarden()
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  it("should run a command in a pod specified by kind and name", async () => {
    const action = graph.getRun("echo-run-exec")

    const testTask = new RunTask({
      garden,
      graph,
      action,
      log: garden.log,
      force: true,
      forceBuild: false,
    })

    // Clear any existing Run result
    const provider = await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    await runResultCache.clear({ ctx, log: garden.log, action })

    garden.events.eventLog = []
    const results = await garden.processTasks({ tasks: [testTask], throwOnError: true })
    const result = results.results.getResult(testTask)
    expect(findNamespaceStatusEvent(garden.events.eventLog, "kubernetes-type-test-default")).to.exist

    expect(result).to.exist
    expect(result?.result).to.exist
    expect(result?.outputs).to.exist
    expect(result?.result?.outputs.log).to.equal("ok")
    expect(result!.result!.detail?.namespaceStatus).to.exist
  })

  it("should run a command in a pod specified by podSelector", async () => {
    const action = graph.getRun("echo-run-exec-pod-selector")

    const testTask = new RunTask({
      garden,
      graph,
      action,
      log: garden.log,
      force: true,
      forceBuild: false,
    })

    // Clear any existing Run result
    const provider = await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    await runResultCache.clear({ ctx, log: garden.log, action })

    garden.events.eventLog = []
    const results = await garden.processTasks({ tasks: [testTask], throwOnError: true })
    const result = results.results.getResult(testTask)
    expect(findNamespaceStatusEvent(garden.events.eventLog, "kubernetes-type-test-default")).to.exist

    expect(result).to.exist
    expect(result?.result).to.exist
    expect(result?.outputs).to.exist
    expect(result?.result?.outputs.log).to.equal("ok")
    expect(result!.result!.detail?.namespaceStatus).to.exist
  })
})
