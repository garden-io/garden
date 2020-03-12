/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expectError } from "../../../../../helpers"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/config-graph"
import {
  k8sBuildContainer,
  k8sGetContainerBuildStatus,
  getBuilderPodName,
  execInBuilder,
} from "../../../../../../src/plugins/kubernetes/container/build"
import { PluginContext } from "../../../../../../src/plugin-context"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { expect } from "chai"
import { getContainerTestGarden } from "./container"
import { containerHelpers } from "../../../../../../src/plugins/container/helpers"

describe("kubernetes build flow", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext

  after(async () => {
    if (garden) {
      await garden.close()
    }
  })

  const init = async (environmentName: string) => {
    garden = await getContainerTestGarden(environmentName)
    graph = await garden.getConfigGraph(garden.log)
    provider = <KubernetesProvider>await garden.resolveProvider("local-kubernetes")
    ctx = garden.getPluginContext(provider)
  }

  context("local mode", () => {
    before(async () => {
      await init("local")
    })

    it("should build a simple container (local only)", async () => {
      const module = await graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })
  })

  context("local-remote-registry mode", () => {
    before(async () => {
      await init("local-remote-registry")
    })

    it("should push to configured deploymentRegistry if specified (remote only)", async () => {
      const module = await graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      const remoteId = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
      // This throws if the image doesn't exist
      await containerHelpers.dockerCli(module.buildPath, ["manifest", "inspect", remoteId], garden.log)
    })

    it("should get the build status from the deploymentRegistry (remote only)", async () => {
      const module = await graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      const remoteId = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
      await containerHelpers.dockerCli(module.buildPath, ["rmi", remoteId], garden.log)

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.true
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

    it("should support pulling from private registries (remote only)", async () => {
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

    it("should get the build status from the deploymentRegistry", async () => {
      const module = await graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      // Clear the image tag from the in-cluster builder
      const remoteId = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
      const podName = await getBuilderPodName(provider, garden.log)
      const args = ["docker", "rmi", remoteId]
      await execInBuilder({ provider, log: garden.log, args, timeout: 300, podName })

      // This should still report the build as ready, because it's in the registry
      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.true
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = await graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      module.spec.image = "127.0.0.1:5000/boop/skee-bop-ba-doo"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.false
    })
  })

  context("cluster-docker-remote-registry mode", () => {
    before(async () => {
      await init("cluster-docker-remote-registry")
    })

    it("should push to configured deploymentRegistry if specified (remote only)", async () => {
      const module = await graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should get the build status from the registry (remote only)", async () => {
      const module = await graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      // Clear the image tag from the in-cluster builder
      const remoteId = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
      const podName = await getBuilderPodName(provider, garden.log)
      const args = ["docker", "rmi", remoteId]
      await execInBuilder({ provider, log: garden.log, args, timeout: 300, podName })

      // This should still report the build as ready, because it's in the registry
      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.true
    })

    it("should return ready=false status when image doesn't exist in registry (remote only)", async () => {
      const module = await graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      module.version.versionString = "v-0000000000"

      // This should still report the build as ready, because it's in the registry
      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.false
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

    it("should support pulling from private registries (remote only)", async () => {
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

    it("should get the build status from the registry", async () => {
      const module = await graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.true
    })

    it("should support pulling from private registries (remote only)", async () => {
      const module = await graph.getModule("private-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = await graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      module.spec.image = "skee-ba-dee-skoop"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.false
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

  context("kaniko-remote-registry mode", () => {
    before(async () => {
      await init("kaniko-remote-registry")
    })

    it("should push to configured deploymentRegistry if specified (remote only)", async () => {
      const module = await graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should get the build status from the registry (remote only)", async () => {
      const module = await graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.true
    })

    it("should return ready=false status when image doesn't exist in registry (remote only)", async () => {
      const module = await graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      module.version.versionString = "v-0000000000"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.false
    })
  })
})
