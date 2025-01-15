/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
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
import { type KubernetesServerResource } from "../../../../../src/plugins/kubernetes/types.js"
import { type V1Secret } from "@kubernetes/client-node"
import { cloneDeep } from "lodash-es"

async function deleteNamespace(api: KubeApi, namespaceName: string) {
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

/**
 * Returns a sorted list of secret names and their data (base64 parsed) from the raw K8s output
 */
function parseAndSortSecrets(secrets: KubernetesServerResource<V1Secret>[]) {
  return secrets
    .map((s) => {
      const secretName = s.metadata.name
      const secretData = Object.entries(s.data!).reduce((memo, [key, value]) => {
        memo[key] = atob(value)

        return memo
      }, {})

      return { secretName, secretData }
    })
    .sort((a, b) => a.secretName.localeCompare(b.secretName))
}

describe("kubernetes provider handlers", () => {
  let log: Log
  let ctx: KubernetesPluginContext
  let api: KubeApi
  let garden: TestGarden
  const namespaceName = "kubernetes-provider-handler-test"
  const secretNamespaceName = "secrets"
  const secrets: KubernetesServerResource<V1Secret>[] = [
    {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "image-pull-secret-a",
      },
      stringData: {
        secretKey: "image-pull-secret-a-value",
      },
    },
    {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "image-pull-secret-b",
      },
      stringData: {
        secretKey: "image-pull-secret-b-value",
      },
    },
    {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "copy-secret-a",
      },
      stringData: {
        secretKey: "copy-secret-a-value",
      },
    },
    {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "copy-secret-b",
      },
      stringData: {
        secretKey: "copy-secret-b-value",
      },
    },
  ]

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
    await deleteNamespace(api, namespaceName)

    // Create a namespace for secrets that we clean up after the test run
    await api.core.createNamespace({
      body: {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: secretNamespaceName,
        },
      },
    })

    // Create secrets in secret namespace. In the tests we validate that these get copied to the target namespace.
    await Promise.all(
      secrets.map(async (secret) => {
        await api.upsert({ kind: "Secret", namespace: secretNamespaceName, obj: secret, log })
      })
    )
  })
  afterEach(async () => {
    await deleteNamespace(api, namespaceName)
  })

  after(async () => {
    await deleteNamespace(api, secretNamespaceName)
  })

  describe("getEnvironmentStatus", () => {
    it("should only return the environment status and not create any resources with the getEnvironmentStatus handler", async () => {
      const envStatus = await getEnvironmentStatus({ ctx, log })
      expect(envStatus.ready).to.be.false
      const namespaceStatus = await namespaceExists(api, namespaceName)
      expect(namespaceStatus).to.be.false
    })
  })
  describe("prepareEnvironment", () => {
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
    it("should ensure image pull and copy secrets", async () => {
      const ctxClone = cloneDeep(ctx)
      ctxClone.provider.config.imagePullSecrets = [
        {
          name: "image-pull-secret-a",
          namespace: secretNamespaceName,
        },
        {
          name: "image-pull-secret-b",
          namespace: secretNamespaceName,
        },
      ]
      ctxClone.provider.config.copySecrets = [
        {
          name: "copy-secret-a",
          namespace: secretNamespaceName,
        },
        {
          name: "copy-secret-b",
          namespace: secretNamespaceName,
        },
      ]
      const params: PrepareEnvironmentParams = {
        ctx: ctxClone,
        log: garden.log,
        force: false,
      }
      await prepareEnvironment(params)

      const allNamespaceSecrets = (await api.core.listNamespacedSecret({ namespace: namespaceName })).items
      const secretNameAndValues = parseAndSortSecrets(allNamespaceSecrets)

      expect(secretNameAndValues).to.eql([
        {
          secretName: "copy-secret-a",
          secretData: {
            secretKey: "copy-secret-a-value",
          },
        },
        {
          secretName: "copy-secret-b",
          secretData: {
            secretKey: "copy-secret-b-value",
          },
        },
        {
          secretName: "image-pull-secret-a",
          secretData: {
            secretKey: "image-pull-secret-a-value",
          },
        },
        {
          secretName: "image-pull-secret-b",
          secretData: {
            secretKey: "image-pull-secret-b-value",
          },
        },
      ])
    })
  })
})
