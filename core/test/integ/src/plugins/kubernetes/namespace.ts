/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { randomString, gardenAnnotationKey } from "../../../../../src/util/string"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api"
import { getDataDir, makeTestGarden } from "../../../../helpers"
import { Provider } from "../../../../../src/config/provider"
import { KubernetesConfig } from "../../../../../src/plugins/kubernetes/config"
import { ensureNamespace } from "../../../../../src/plugins/kubernetes/namespace"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { expect } from "chai"
import { getPackageVersion } from "../../../../../src/util/util"

describe("ensureNamespace", () => {
  let api: KubeApi
  let log: LogEntry
  let namespaceName: string

  before(async () => {
    const root = getDataDir("test-projects", "container")
    const garden = await makeTestGarden(root)
    const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as Provider<KubernetesConfig>
    const ctx = await garden.getPluginContext(provider)
    log = garden.log
    api = await KubeApi.factory(log, ctx, provider)
  })

  beforeEach(() => {
    namespaceName = "testing-" + randomString(10)
  })

  afterEach(async () => {
    try {
      await api.core.deleteNamespace(namespaceName)
    } catch {}
  })

  it("should create the namespace if it doesn't exist, with configured annotations and labels", async () => {
    const namespace = {
      name: namespaceName,
      annotations: { foo: "bar" },
      labels: { floo: "blar" },
    }

    const result = await ensureNamespace(api, namespace, log)

    expect(result?.metadata.name).to.equal(namespaceName)
    expect(result?.metadata.annotations).to.eql({
      [gardenAnnotationKey("generated")]: "true",
      [gardenAnnotationKey("version")]: getPackageVersion(),
      ...namespace.annotations,
    })
    expect(result?.metadata.labels?.floo).to.equal("blar")
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

    const result = await ensureNamespace(api, namespace, log)

    expect(result?.metadata.name).to.equal(namespaceName)
    expect(result?.metadata.annotations).to.eql({
      [gardenAnnotationKey("generated")]: "true",
      [gardenAnnotationKey("version")]: getPackageVersion(),
      foo: "bar",
    })
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

    const result = await ensureNamespace(api, namespace, log)

    expect(result?.metadata.name).to.equal(namespaceName)
    expect(result?.metadata.labels?.foo).to.equal("bar")
    expect(result?.metadata.labels?.floo).to.equal("blar")
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

    const result = await ensureNamespace(api, namespace, log)

    expect(result).to.be.null
  })
})
