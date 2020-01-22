import { Garden } from "../../../../../src/garden"
import { Provider } from "../../../../../src/config/provider"
import { KubernetesConfig } from "../../../../../src/plugins/kubernetes/config"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api"
import { getDataDir, makeTestGarden } from "../../../../helpers"
import { getAppNamespace } from "../../../../../src/plugins/kubernetes/namespace"
import { randomString } from "../../../../../src/util/string"
import { V1ConfigMap } from "@kubernetes/client-node"
import { KubernetesResource } from "../../../../../src/plugins/kubernetes/types"
import { expect } from "chai"

describe("KubeApi", () => {
  let garden: Garden
  let provider: Provider<KubernetesConfig>
  let api: KubeApi

  before(async () => {
    const root = getDataDir("test-projects", "container")
    garden = await makeTestGarden(root)
    provider = (await garden.resolveProvider("local-kubernetes")) as Provider<KubernetesConfig>
    api = await KubeApi.factory(garden.log, provider)
  })

  after(async () => {
    await garden.close()
  })

  describe("replace", () => {
    it("should replace an existing resource in the cluster", async () => {
      const ctx = garden.getPluginContext(provider)
      const namespace = await getAppNamespace(ctx, garden.log, provider)
      const name = randomString()

      const configMap: KubernetesResource<V1ConfigMap> = {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
          name,
          namespace,
        },
        data: {
          something: "whatever",
        },
      }

      await api.core.createNamespacedConfigMap(namespace, configMap)

      try {
        configMap.data!.other = "thing"
        await api.replace({ log: garden.log, resource: configMap })

        const updated = await api.core.readNamespacedConfigMap(name, namespace)
        expect(updated.data?.other).to.equal("thing")
      } finally {
        await api.deleteBySpec({ namespace, manifest: configMap, log: garden.log })
      }
    })
  })
})
