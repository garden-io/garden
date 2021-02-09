/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expectError, grouped } from "../../../../../../helpers"
import { Garden } from "../../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../../src/config-graph"
import {
  k8sBuildContainer,
  k8sGetContainerBuildStatus,
} from "../../../../../../../src/plugins/kubernetes/container/build/build"
import { PluginContext } from "../../../../../../../src/plugin-context"
import { KubernetesProvider } from "../../../../../../../src/plugins/kubernetes/config"
import { expect } from "chai"
import { getContainerTestGarden } from "../container"
import { containerHelpers } from "../../../../../../../src/plugins/container/helpers"
import { dockerDaemonContainerName } from "../../../../../../../src/plugins/kubernetes/constants"
import { KubeApi } from "../../../../../../../src/plugins/kubernetes/api"
import { getSystemNamespace } from "../../../../../../../src/plugins/kubernetes/namespace"
import { getDockerDaemonPodRunner } from "../../../../../../../src/plugins/kubernetes/container/build/cluster-docker"
import { k8sPublishContainerModule } from "../../../../../../../src/plugins/kubernetes/container/publish"
import { LogEntry } from "../../../../../../../src/logger/log-entry"

describe("kubernetes build flow", () => {
  let garden: Garden
  let log: LogEntry
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext
  let systemNamespace: string
  let currentEnv: string

  const builtImages: { [key: string]: boolean } = {}

  after(async () => {
    if (garden) {
      await garden.close()
    }
  })

  const init = async (environmentName: string) => {
    currentEnv = environmentName
    garden = await getContainerTestGarden(environmentName)
    log = garden.log
    graph = await garden.getConfigGraph(garden.log)
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext(provider)
    systemNamespace = await getSystemNamespace(ctx, provider, garden.log)
  }

  async function buildImage(moduleName: string) {
    const module = graph.getModule(moduleName)
    const key = `${currentEnv}.${module.name}.${module.version.versionString}`

    if (builtImages[key]) {
      return module
    }

    await garden.buildStaging.syncFromSrc(module, garden.log)

    await k8sBuildContainer({
      ctx,
      log,
      module,
    })

    builtImages[key] = true

    return module
  }

  context("local mode", () => {
    before(async () => {
      await init("local")
    })

    it("should build a simple container", async () => {
      await buildImage("simple-service")
    })
  })

  grouped("remote-only").context("local-remote-registry mode", () => {
    before(async () => {
      await init("local-remote-registry")
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      const module = await buildImage("remote-registry-test")

      const remoteId = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)
      // This throws if the image doesn't exist
      await containerHelpers.dockerCli({
        cwd: module.buildPath,
        args: ["manifest", "inspect", remoteId],
        log,
        ctx,
      })
    })

    it("should get the build status from the deploymentRegistry", async () => {
      const module = await buildImage("remote-registry-test")

      const remoteId = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

      await containerHelpers.dockerCli({
        cwd: module.buildPath,
        args: ["rmi", remoteId],
        log,
        ctx,
      })
      buildImage[`${currentEnv}.${module.name}.${module.version.versionString}`] = false

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.true
    })

    context("publish handler", () => {
      it("should publish the built image", async () => {
        const module = await buildImage("remote-registry-test")

        const { message } = await k8sPublishContainerModule({
          ctx,
          module,
          log,
        })

        expect(message).to.eql("Published gardendev/remote-registry-test:" + module.version.versionString)
      })
    })
  })

  grouped("cluster-docker").context("cluster-docker mode", () => {
    before(async () => {
      await init("cluster-docker")
    })

    it("should build a simple container", async () => {
      await buildImage("simple-service")
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      await buildImage("private-base")
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = graph.getModule("inaccessible-base")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      await expectError(
        () =>
          k8sBuildContainer({
            ctx,
            log,
            module,
          }),
        (err) => {
          expect(err.message).to.include("pull access denied")
        }
      )
    })

    it("should get the build status from the deploymentRegistry", async () => {
      const module = await buildImage("remote-registry-test")

      // Clear the image tag from the in-cluster builder
      const remoteId = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)
      const api = await KubeApi.factory(garden.log, ctx, provider)

      const runner = await getDockerDaemonPodRunner({ api, systemNamespace, ctx, provider })

      await runner.exec({
        log,
        command: ["docker", "rmi", remoteId],
        timeoutSec: 300,
        containerName: dockerDaemonContainerName,
      })

      // This should still report the build as ready, because it's in the registry
      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.true
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("simple-service")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      module.spec.image = "127.0.0.1:5000/boop/skee-bop-ba-doo"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.false
    })
  })

  grouped("cluster-docker", "remote-only").context("cluster-docker-remote-registry mode", () => {
    before(async () => {
      await init("cluster-docker-remote-registry")
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      await buildImage("remote-registry-test")
    })

    it("should get the build status from the registry", async () => {
      const module = await buildImage("remote-registry-test")

      // Clear the image tag from the in-cluster builder
      const remoteId = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)
      const api = await KubeApi.factory(garden.log, ctx, provider)

      const runner = await getDockerDaemonPodRunner({ api, systemNamespace, ctx, provider })

      await runner.exec({
        log,
        command: ["docker", "rmi", remoteId],
        timeoutSec: 300,
        containerName: dockerDaemonContainerName,
      })

      // This should still report the build as ready, because it's in the registry
      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.true
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("remote-registry-test")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      module.version.versionString = "v-0000000000"

      // This should still report the build as ready, because it's in the registry
      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.false
    })

    context("publish handler", () => {
      it("should publish the built image", async () => {
        const module = await buildImage("remote-registry-test")

        const { message } = await k8sPublishContainerModule({
          ctx,
          module,
          log,
        })

        expect(message).to.eql("Published gardendev/remote-registry-test:" + module.version.versionString)
      })
    })
  })

  grouped("cluster-docker").context("cluster-docker mode with BuildKit", () => {
    before(async () => {
      await init("cluster-docker-buildkit")
    })

    it("should build a simple container", async () => {
      const module = graph.getModule("simple-service")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      const result = await k8sBuildContainer({
        ctx,
        log,
        module,
      })

      // Make sure we're actually using BuildKit
      expect(result.buildLog!).to.include("load build definition from Dockerfile")
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      await buildImage("private-base")
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = graph.getModule("inaccessible-base")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      await expectError(
        () =>
          k8sBuildContainer({
            ctx,
            log,
            module,
          }),
        (err) => {
          expect(err.message).to.include("pull access denied")
        }
      )
    })
  })

  grouped("kaniko").context("kaniko mode", () => {
    before(async () => {
      await init("kaniko")
    })

    it("should build a simple container", async () => {
      await buildImage("simple-service")
    })

    it("should get the build status from the registry", async () => {
      const module = await buildImage("simple-service")

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.true
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      await buildImage("private-base")
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("simple-service")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      module.spec.image = "skee-ba-dee-skoop"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.false
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = graph.getModule("inaccessible-base")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      await expectError(
        () =>
          k8sBuildContainer({
            ctx,
            log,
            module,
          }),
        (err) => {
          expect(err.message).to.include("UNAUTHORIZED")
        }
      )
    })
  })

  grouped("kaniko", "remote-only").context("kaniko-remote-registry mode", () => {
    before(async () => {
      await init("kaniko-remote-registry")
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      await buildImage("remote-registry-test")
    })

    it("should get the build status from the registry", async () => {
      const module = await buildImage("remote-registry-test")

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.true
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("remote-registry-test")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      module.version.versionString = "v-0000000000"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.false
    })

    context("publish handler", () => {
      it("should publish the built image", async () => {
        const module = await buildImage("remote-registry-test")

        const { message } = await k8sPublishContainerModule({
          ctx,
          module,
          log,
        })

        expect(message).to.eql("Published gardendev/remote-registry-test:" + module.version.versionString)
      })
    })
  })

  grouped("kaniko", "image-override", "remote-only").context("kaniko - image - override mode", () => {
    before(async () => {
      await init("kaniko-image-override")
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      await buildImage("remote-registry-test")
    })
  })

  grouped("cluster-buildkit").context("cluster-buildkit mode", () => {
    before(async () => {
      await init("cluster-buildkit")
    })

    it("should build a simple container", async () => {
      await buildImage("simple-service")
    })

    it("should get the build status from the registry", async () => {
      const module = await buildImage("simple-service")

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.true
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      await buildImage("private-base")
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("simple-service")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      module.spec.image = "skee-ba-dee-skoop"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.false
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = graph.getModule("inaccessible-base")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      await expectError(
        () =>
          k8sBuildContainer({
            ctx,
            log,
            module,
          }),
        (err) => {
          expect(err.message).to.include("authorization failed")
        }
      )
    })
  })

  grouped("cluster-buildkit").context("cluster-buildkit-rootless mode", () => {
    before(async () => {
      await init("cluster-buildkit-rootless")
    })

    it("should build a simple container", async () => {
      await buildImage("simple-service")
    })

    it("should get the build status from the registry", async () => {
      const module = await buildImage("simple-service")

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.true
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      await buildImage("private-base")
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("simple-service")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      module.spec.image = "skee-ba-dee-skoop"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.false
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = graph.getModule("inaccessible-base")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      await expectError(
        () =>
          k8sBuildContainer({
            ctx,
            log,
            module,
          }),
        (err) => {
          expect(err.message).to.include("authorization failed")
        }
      )
    })
  })

  grouped("cluster-buildkit", "remote-only").context("cluster-buildkit-remote-registry mode", () => {
    before(async () => {
      await init("cluster-buildkit-remote-registry")
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      await buildImage("remote-registry-test")
    })

    it("should get the build status from the registry", async () => {
      const module = await buildImage("remote-registry-test")

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.true
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("remote-registry-test")
      await garden.buildStaging.syncFromSrc(module, garden.log)

      module.version.versionString = "v-0000000000"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.ready).to.be.false
    })

    context("publish handler", () => {
      it("should publish the built image", async () => {
        const module = await buildImage("remote-registry-test")

        const { message } = await k8sPublishContainerModule({
          ctx,
          module,
          log,
        })

        expect(message).to.eql("Published gardendev/remote-registry-test:" + module.version.versionString)
      })
    })
  })
})
