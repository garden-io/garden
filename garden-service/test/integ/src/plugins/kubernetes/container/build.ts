import "../../../../../setup"
import { getDataDir, makeTestGarden, expectError } from "../../../../../helpers"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { k8sBuildContainer } from "../../../../../../src/plugins/kubernetes/container/build"
import { PluginContext } from "../../../../../../src/plugin-context"
import { clusterInit } from "../../../../../../src/plugins/kubernetes/commands/cluster-init"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { decryptSecretFile } from "../../../../helpers"
import { GARDEN_SERVICE_ROOT } from "../../../../../../src/constants"
import { resolve } from "path"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { expect } from "chai"
import { findByName, getPackageVersion } from "../../../../../../src/util/util"
import { ResolveProviderTask } from "../../../../../../src/tasks/resolve-provider"

describe("k8sBuildContainer", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext

  let initialized = false

  const root = getDataDir("test-projects", "container")

  after(async () => {
    if (garden) {
      await garden.close()
    }
  })

  const init = async (environmentName: string) => {
    garden = await makeTestGarden(root, { environmentName })

    if (!initialized && environmentName !== "local") {
      // Load the test authentication for private registries
      const authSecret = JSON.parse(
        (await decryptSecretFile(resolve(GARDEN_SERVICE_ROOT, "..", "secrets", "test-docker-auth.json"))).toString()
      )

      const plugin = await garden.getPlugin("local-kubernetes")
      const config = findByName(garden.getRawProviderConfigs(), "local-kubernetes")!
      const resolveTask = new ResolveProviderTask({
        garden,
        log: garden.log,
        plugin,
        config,
        version: {
          versionString: getPackageVersion(),
          dependencyVersions: {},
          files: [],
        },
        force: false,
        skipPrepare: true,
        forcePrepare: false,
      })
      const result = await garden.processTasks([resolveTask])
      const tmpProvider = findByName(<any>Object.values(result), "local-kubernetes")!["output"]

      const api = await KubeApi.factory(garden.log, tmpProvider)
      await api.upsert("Secret", "default", authSecret, garden.log)
    }

    graph = await garden.getConfigGraph(garden.log)
    provider = <KubernetesProvider>await garden.resolveProvider("local-kubernetes")
    ctx = garden.getPluginContext(provider)

    if (!initialized && environmentName !== "local") {
      // Run cluster-init
      await clusterInit.handler({ ctx, log: garden.log })
      initialized = true
    }
  }

  context("local mode", () => {
    before(async () => {
      await init("local")
    })

    it("should build a simple container", async () => {
      const module = await graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })
  })

  context("cluster-docker mode", () => {
    before(async () => {
      await init("cluster-docker")
    })

    it("should build a simple container", async () => {
      const module = await graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should support pulling from private registries", async () => {
      const module = await graph.getModule("private-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = await graph.getModule("inaccessible-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await expectError(
        () =>
          k8sBuildContainer({
            ctx,
            log: garden.log,
            module,
          }),
        (err) => {
          expect(err.message).to.include("pull access denied")
        }
      )
    })
  })

  context("cluster-docker mode with BuildKit", () => {
    before(async () => {
      await init("cluster-docker-buildkit")
    })

    it("should build a simple container", async () => {
      const module = await graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      const result = await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      // Make sure we're actually using BuildKit
      expect(result.buildLog!).to.include("load build definition from Dockerfile")
    })

    it("should support pulling from private registries", async () => {
      const module = await graph.getModule("private-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = await graph.getModule("inaccessible-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await expectError(
        () =>
          k8sBuildContainer({
            ctx,
            log: garden.log,
            module,
          }),
        (err) => {
          expect(err.message).to.include("pull access denied")
        }
      )
    })
  })

  context("kaniko mode", () => {
    before(async () => {
      await init("kaniko")
    })

    it("should build a simple container", async () => {
      const module = await graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should support pulling from private registries", async () => {
      const module = await graph.getModule("private-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = await graph.getModule("inaccessible-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await expectError(
        () =>
          k8sBuildContainer({
            ctx,
            log: garden.log,
            module,
          }),
        (err) => {
          expect(err.message).to.include("UNAUTHORIZED")
        }
      )
    })
  })
})
