/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { resolve, join } from "path"
import td from "testdouble"
import { Garden } from "../../../../../src/garden"
import { prepareDockerAuth } from "../../../../../src/plugins/kubernetes/init"
import { dockerAuthSecretKey } from "../../../../../src/plugins/kubernetes/constants"
import { ConfigurationError } from "../../../../../src/exceptions"
import {
  KubernetesProvider,
  KubernetesConfig,
  defaultResources,
  defaultStorage,
} from "../../../../../src/plugins/kubernetes/config"
import { gardenPlugin } from "../../../../../src/plugins/container/container"
import { defaultSystemNamespace } from "../../../../../src/plugins/kubernetes/system"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api"
import { dataDir, makeTestGarden, expectError } from "../../../../helpers"
import { KubernetesResource } from "../../../../../src/plugins/kubernetes/types"
import { V1Secret } from "@kubernetes/client-node"
import { PluginContext } from "../../../../../src/plugin-context"
import { kubectlSpec } from "../../../../../src/plugins/kubernetes/kubectl"
import { PluginTool } from "../../../../../src/util/ext-tools"

const basicConfig: KubernetesConfig = {
  name: "kubernetes",
  buildMode: "local-docker",
  context: "my-cluster",
  defaultHostname: "my.domain.com",
  deploymentRegistry: {
    hostname: "foo.garden",
    port: 5000,
    namespace: "boo",
  },
  forceSsl: false,
  gardenSystemNamespace: defaultSystemNamespace,
  imagePullSecrets: [
    {
      name: "test-docker-auth",
      namespace: "default",
    },
    {
      name: "test-cred-helper-auth",
      namespace: "default",
    },
  ],
  ingressClass: "nginx",
  ingressHttpPort: 80,
  ingressHttpsPort: 443,
  resources: defaultResources,
  storage: defaultStorage,
  setupIngressController: null,
  systemNodeSelector: {},
  registryProxyTolerations: [],
  tlsCertificates: [],
  _systemServices: [],
}

const basicProvider: KubernetesProvider = {
  name: "kubernetes",
  config: basicConfig,
  dependencies: {},
  moduleConfigs: [],
  status: { ready: true, outputs: {} },
  dashboardPages: [],
}

const dockerSimpleAuthSecret: KubernetesResource<V1Secret> = {
  apiVersion: "v1",
  kind: "Secret",
  type: "kubernetes.io/dockerconfigjson",
  metadata: {
    name: "test-docker-auth",
    namespace: "default",
  },
  data: {
    ".dockerconfigjson": Buffer.from(
      JSON.stringify({ auths: { myDockerRepo: "simple-auth" }, experimental: "enabled" })
    ).toString("base64"),
  },
}

const dockerCredentialHelperSecret: KubernetesResource<V1Secret> = {
  apiVersion: "v1",
  kind: "Secret",
  type: "kubernetes.io/dockerconfigjson",
  metadata: {
    name: "test-cred-helper-auth",
    namespace: "default",
  },
  data: {
    ".dockerconfigjson": Buffer.from(
      JSON.stringify({ credHelpers: { myDockerRepo: "ecr-helper" }, experimental: "enabled" })
    ).toString("base64"),
  },
}
const kubeConfigEnvVar = process.env.KUBECONFIG

describe("prepareDockerAuth", () => {
  const projectRoot = resolve(dataDir, "test-project-container")
  let garden: Garden
  let ctx: PluginContext
  let api: KubeApi

  before(() => {
    process.env.KUBECONFIG = join(projectRoot, "kubeconfig.yml")
  })

  after(() => {
    if (kubeConfigEnvVar) {
      process.env.KUBECONFIG = kubeConfigEnvVar
    } else {
      delete process.env.KUBECONFIG
    }
  })

  function jsonLoadBase64(data: string) {
    return JSON.parse(Buffer.from(data, "base64").toString())
  }

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin] })
    ctx = await garden.getPluginContext(basicProvider)
    ctx.tools["kubernetes.kubectl"] = new PluginTool(kubectlSpec)
    api = await KubeApi.factory(garden.log, ctx, basicProvider)
  })

  describe("when simple login or cred helpers are present", () => {
    beforeEach(async () => {
      const core = td.replace(api, "core")
      td.when(core.listNamespace()).thenResolve({
        items: [{ status: { phase: "Active" }, metadata: { name: "default" } }],
      })
      td.when(core.readNamespacedSecret("test-docker-auth", "default")).thenResolve(dockerSimpleAuthSecret)
      td.when(core.readNamespacedSecret("test-cred-helper-auth", "default")).thenResolve(dockerCredentialHelperSecret)
      td.replace(api, "upsert")
    })
    it("should merge both", async () => {
      const res = await prepareDockerAuth(api, basicProvider, "default")
      const dockerAuth = jsonLoadBase64(res.data![dockerAuthSecretKey])
      expect(dockerAuth).to.haveOwnProperty("auths")
      expect(dockerAuth.auths.myDockerRepo).to.equal("simple-auth")
      expect(dockerAuth).to.haveOwnProperty("credHelpers")
      expect(dockerAuth.credHelpers.myDockerRepo).to.equal("ecr-helper")
    })
  })
  describe("when both simple login and cred helpers are missing", () => {
    beforeEach(async () => {
      const core = td.replace(api, "core")
      const emptyDockerSimpleAuthSecret: KubernetesResource<V1Secret> = {
        apiVersion: "v1",
        kind: "Secret",
        type: "kubernetes.io/dockerconfigjson",
        metadata: {
          name: "test-docker-auth",
          namespace: "default",
        },
        data: {
          ".dockerconfigjson": Buffer.from(JSON.stringify({ experimental: "enabled" })).toString("base64"),
        },
      }

      const emptyDockerCredentialHelperSecret: KubernetesResource<V1Secret> = {
        apiVersion: "v1",
        kind: "Secret",
        type: "kubernetes.io/dockerconfigjson",
        metadata: {
          name: "test-cred-helper-auth",
          namespace: "default",
        },
        data: {
          ".dockerconfigjson": Buffer.from(JSON.stringify({ experimental: "enabled" })).toString("base64"),
        },
      }
      td.when(core.listNamespace()).thenResolve({
        items: [{ status: { phase: "Active" }, metadata: { name: "default" } }],
      })
      td.when(core.readNamespacedSecret("test-docker-auth", "default")).thenResolve(emptyDockerSimpleAuthSecret)
      td.when(core.readNamespacedSecret("test-cred-helper-auth", "default")).thenResolve(
        emptyDockerCredentialHelperSecret
      )
      td.replace(api, "upsert")
    })

    it("should fail when both are missing", async () => {
      await expectError(
        () => prepareDockerAuth(api, basicProvider, "default"),
        (e) => expect(e).to.be.instanceof(ConfigurationError)
      )
    })
  })
})
