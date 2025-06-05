/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../../../src/logger/log-entry.js"
import { expect } from "chai"

import { KubeApi } from "../../../../../src/plugins/kubernetes/api.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../../../../src/plugins/kubernetes/config.js"

import { getDataDir, makeTestGarden, type TestGarden } from "../../../../helpers.js"
import { getEnvironmentStatus, prepareEnvironment } from "../../../../../src/plugins/kubernetes/init.js"
import type { PrepareEnvironmentParams } from "../../../../../src/plugin/handlers/Provider/prepareEnvironment.js"

async function ensureNamespaceDoesNotExist(api: KubeApi, namespaceName: string) {
  if (!(await namespaceExists(api, namespaceName))) {
    return
  }
  await api.core.deleteNamespace({ name: namespaceName })
  while (await namespaceExists(api, namespaceName)) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

async function namespaceExists(api: KubeApi, namespaceName: string) {
  try {
    await api.core.readNamespace({ name: namespaceName })
    return true
  } catch (e) {
    return false
  }
}

describe("kubernetes provider handlers", () => {
  let log: Log
  let ctx: KubernetesPluginContext
  let api: KubeApi
  let garden: TestGarden
  const namespaceName = "kubernetes-provider-handler-test"

  before(async () => {
    garden = await makeTestGarden(getDataDir("test-projects", "project-with-default-namespace"))

    log = garden.log
    const provider = <KubernetesProvider>(
      await garden.resolveProvider({ log: garden.log, name: "local-kubernetes", statusOnly: false })
    )
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    api = await KubeApi.factory(log, ctx, ctx.provider)
    await ensureNamespaceDoesNotExist(api, namespaceName)
  })
  afterEach(async () => {
    await ensureNamespaceDoesNotExist(api, namespaceName)
  })

  describe("getEnvironmentStatus", () => {
    it("should only return the environment status and not create any resources with the getEnvironmentStatus handler", async () => {
      const envStatus = await getEnvironmentStatus({ ctx, log })
      expect(envStatus.ready).to.be.false
      const namespaceStatus = await namespaceExists(api, namespaceName)
      expect(namespaceStatus).to.be.false
    })

    it("should prepare the environment with the prepareEnvironment handler and emit a namespaceStatus event", async () => {
      garden.events.eventLog = []
      const params: PrepareEnvironmentParams = {
        ctx,
        log: garden.log,
        force: false,
      }
      const envStatus = await prepareEnvironment(params)
      expect(envStatus.status.ready).to.be.true
      const namespaceStatus = await namespaceExists(api, namespaceName)
      expect(namespaceStatus).to.be.true
      const namespaceStatusEvent = garden.events.eventLog.find((e) => e.name === "namespaceStatus")
      expect(namespaceStatusEvent).to.exist
      expect(namespaceStatusEvent?.payload.namespaceName).to.equal(namespaceName)
    })
  })
})
