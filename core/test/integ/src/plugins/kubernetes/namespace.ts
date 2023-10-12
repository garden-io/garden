/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { randomString, gardenAnnotationKey } from "../../../../../src/util/string"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api"
import { getDataDir, makeTestGarden } from "../../../../helpers"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../src/plugins/kubernetes/config"
import { ensureNamespace, getNamespaceStatus } from "../../../../../src/plugins/kubernetes/namespace"
import { Log } from "../../../../../src/logger/log-entry"
import { expect } from "chai"
import { getPackageVersion } from "../../../../../src/util/util"
import { NamespaceStatus } from "../../../../../src/types/namespace"
import { deleteNamespace } from "../../../helpers"

describe("Kubernetes Namespace helpers", () => {
  let api: KubeApi
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider
  let log: Log
  let namespaceName: string

  before(async () => {
    const root = getDataDir("test-projects", "container")
    const garden = await makeTestGarden(root)
    provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as KubernetesProvider
    ctx = <KubernetesPluginContext>await garden.getPluginContext({
      provider,
      templateContext: undefined,
      events: undefined,
    })
    log = garden.log
    api = await KubeApi.factory(log, ctx, provider)
  })

  beforeEach(() => {
    namespaceName = "testing-" + randomString(10)
  })

  afterEach(async () => {
    await deleteNamespace(api, namespaceName)
  })

  describe("getNamespaceStatus", () => {
    it("should return the namespace status and emit a namespace status event on the plugin event broker", async () => {
      let namespaceStatusFromEvent: NamespaceStatus | null = null
      ctx.events.once("namespaceStatus", (status) => (namespaceStatusFromEvent = status))
      const status = await getNamespaceStatus({
        log,
        ctx,
        provider,
        skipCreate: true,
      })
      expect(namespaceStatusFromEvent).to.exist
      expect(namespaceStatusFromEvent!.namespaceName).to.eql(namespaceName)
      expect(status).to.exist
      expect(status.namespaceName).to.eql(namespaceName)
    })
  })

  describe("ensureNamespace", () => {
    it("should create the namespace if it doesn't exist, with configured annotations and labels", async () => {
      const namespace = {
        name: namespaceName,
        annotations: { foo: "bar" },
        labels: { floo: "blar" },
      }

      const result = await ensureNamespace(api, ctx, namespace, log)

      const ns = result.remoteResource

      expect(ns?.metadata.name).to.equal(namespaceName)
      expect(ns?.metadata.annotations).to.eql({
        [gardenAnnotationKey("generated")]: "true",
        [gardenAnnotationKey("version")]: getPackageVersion(),
        ...namespace.annotations,
      })
      expect(ns?.metadata.labels?.floo).to.equal("blar")

      expect(result.created).to.be.true
      expect(result.patched).to.be.false
    })

    it("should add configured annotations if any are missing", async () => {
      await api.core.createNamespace({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: namespaceName,
          annotations: {
            [gardenAnnotationKey("generated")]: "true",
            [gardenAnnotationKey("version")]: getPackageVersion(),
          },
        },
      })

      const namespace = {
        name: namespaceName,
        annotations: { foo: "bar" },
      }

      const result = await ensureNamespace(api, ctx, namespace, log)

      const ns = result.remoteResource

      expect(ns?.metadata.name).to.equal(namespaceName)
      expect(ns?.metadata.annotations).to.eql({
        [gardenAnnotationKey("generated")]: "true",
        [gardenAnnotationKey("version")]: getPackageVersion(),
        foo: "bar",
      })

      expect(result.created).to.be.false
      expect(result.patched).to.be.true
    })

    it("should add configured labels if any are missing", async () => {
      await api.core.createNamespace({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: namespaceName,
          labels: { foo: "bar" },
        },
      })

      const namespace = {
        name: namespaceName,
        labels: { floo: "blar" },
      }

      const result = await ensureNamespace(api, ctx, namespace, log)

      const ns = result.remoteResource

      expect(ns?.metadata.name).to.equal(namespaceName)
      expect(ns?.metadata.labels?.foo).to.equal("bar")
      expect(ns?.metadata.labels?.floo).to.equal("blar")

      expect(result.created).to.be.false
      expect(result.patched).to.be.true
    })

    it("should do nothing if the namespace has already been configured", async () => {
      await api.core.createNamespace({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: namespaceName,
          annotations: {
            [gardenAnnotationKey("generated")]: "true",
            [gardenAnnotationKey("version")]: getPackageVersion(),
            foo: "bar",
          },
          labels: { existing: "label", floo: "blar" },
        },
      })

      const namespace = {
        name: namespaceName,
        annotations: { foo: "bar" },
        labels: { floo: "blar" },
      }

      const result = await ensureNamespace(api, ctx, namespace, log)

      expect(result.created).to.be.false
      expect(result.patched).to.be.false
    })
  })
})
