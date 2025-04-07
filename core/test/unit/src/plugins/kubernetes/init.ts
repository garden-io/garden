/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import * as td from "testdouble"
import type { Garden } from "../../../../../src/garden.js"
import { prepareDockerAuth, getIngressMisconfigurationWarnings } from "../../../../../src/plugins/kubernetes/init.js"
import {
  defaultSystemNamespace,
  defaultUtilImageRegistryDomain,
  dockerAuthSecretKey,
} from "../../../../../src/plugins/kubernetes/constants.js"
import { ConfigurationError } from "../../../../../src/exceptions.js"
import type { KubernetesProvider, KubernetesConfig } from "../../../../../src/plugins/kubernetes/config.js"
import { defaultResources } from "../../../../../src/plugins/kubernetes/config.js"
import { gardenPlugin } from "../../../../../src/plugins/container/container.js"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api.js"
import { makeTestGarden, expectError, getDataDir } from "../../../../helpers.js"
import type { KubernetesList, KubernetesResource } from "../../../../../src/plugins/kubernetes/types.js"
import type { V1IngressClass, V1Secret } from "@kubernetes/client-node"
import type { PluginContext } from "../../../../../src/plugin-context.js"
import { kubectlSpec } from "../../../../../src/plugins/kubernetes/kubectl.js"
import { PluginTool } from "../../../../../src/util/ext-tools.js"
import { uuidv4 } from "../../../../../src/util/random.js"

const basicConfig: KubernetesConfig = {
  name: "kubernetes",
  utilImageRegistryDomain: defaultUtilImageRegistryDomain,
  buildMode: "local-docker",
  context: "my-cluster",
  defaultHostname: "hostname.invalid",
  deploymentRegistry: {
    hostname: "registry.invalid",
    port: 5000,
    namespace: "boo",
    insecure: true,
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
  copySecrets: [
    {
      name: "test-shared-secret",
      namespace: "default",
    },
  ],
  ingressClass: "nginx",
  ingressHttpPort: 80,
  ingressHttpsPort: 443,
  resources: defaultResources,
  setupIngressController: null,
  systemNodeSelector: {},
  tlsCertificates: [],
}

const basicProvider: KubernetesProvider = {
  name: "kubernetes",
  uid: uuidv4(),
  config: basicConfig,
  dependencies: {},
  moduleConfigs: [],
  status: { ready: true, outputs: {} },
  dashboardPages: [],
  outputs: {},
  state: "ready",
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

describe("kubernetes init", () => {
  const projectRoot = getDataDir("test-project-container")
  let garden: Garden
  let ctx: PluginContext
  let api: KubeApi

  before(async () => {
    process.env.KUBECONFIG = join(projectRoot, "kubeconfig.yml")
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
    ctx = await garden.getPluginContext({ provider: basicProvider, templateContext: undefined, events: undefined })
    ctx.tools["kubernetes.kubectl"] = new PluginTool(kubectlSpec)
  })

  after(() => {
    if (kubeConfigEnvVar) {
      process.env.KUBECONFIG = kubeConfigEnvVar
    } else {
      delete process.env.KUBECONFIG
    }
    garden.close()
  })

  function jsonLoadBase64(data: string) {
    return JSON.parse(Buffer.from(data, "base64").toString())
  }

  beforeEach(async () => {
    api = await KubeApi.factory(garden.log, ctx, basicProvider)
  })

  describe("kubernetes init", () => {
    describe("when simple login or cred helpers are present", () => {
      beforeEach(async () => {
        const core = td.replace(api, "core")
        td.when(core.listNamespace()).thenResolve({
          items: [
            {
              apiVersion: "v1",
              kind: "Namepsace",
              status: { phase: "Active" },
              metadata: { name: "default" },
              spec: {},
            },
          ],
        })
        td.when(core.readNamespacedSecret({ name: "test-docker-auth", namespace: "default" })).thenResolve(
          dockerSimpleAuthSecret
        )
        td.when(core.readNamespacedSecret({ name: "test-cred-helper-auth", namespace: "default" })).thenResolve(
          dockerCredentialHelperSecret
        )
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
          items: [
            {
              apiVersion: "v1",
              kind: "Namepsace",
              status: { phase: "Active" },
              metadata: { name: "default" },
              spec: {},
            },
          ],
        })
        td.when(core.readNamespacedSecret({ name: "test-docker-auth", namespace: "default" })).thenResolve(
          emptyDockerSimpleAuthSecret
        )
        td.when(core.readNamespacedSecret({ name: "test-cred-helper-auth", namespace: "default" })).thenResolve(
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

  describe("ingress and networking check", () => {
    const ingressClassResourceName = "name-for-testing"

    before(async () => {
      garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
    })

    beforeEach(async () => {
      td.replace(
        api,
        "listResources",
        async () =>
          <KubernetesList<KubernetesResource<V1IngressClass, string>>>{
            items: [{ metadata: { name: ingressClassResourceName } }],
          }
      )
    })

    after(() => {
      td.reset()
      garden.close()
    })

    it("should warn if custom ingressclass has been set but no matching resource exists with v1 api", async () => {
      const warnings = await getIngressMisconfigurationWarnings("custom-name", "networking.k8s.io/v1", garden.log, api)
      expect(warnings.length).to.be.eq(1)
      expect(warnings[0]).to.include("no matching IngressClass resource was found in the cluster")
    })

    it("should not warn if custom ingressclass has not been set", async () => {
      const undefinedIngressName = undefined
      const warnings = await getIngressMisconfigurationWarnings(
        undefinedIngressName,
        "networking.k8s.io/v1",
        garden.log,
        api
      )
      expect(warnings.length).to.be.eq(0)
    })

    it("should not warn if custom ingressclass has been set but older api is used", async () => {
      const warnings = await getIngressMisconfigurationWarnings(
        "custom-name",
        "networking.k8s.io/v1beta1",
        garden.log,
        api
      )
      expect(warnings.length).to.be.eq(0)
    })

    it("should not warn if custom ingressclass has not been set but older api is used", async () => {
      const undefinedIngressName = undefined
      const warnings = await getIngressMisconfigurationWarnings(
        undefinedIngressName,
        "networking.k8s.io/v1beta1",
        garden.log,
        api
      )
      expect(warnings.length).to.be.eq(0)
    })
  })
})
