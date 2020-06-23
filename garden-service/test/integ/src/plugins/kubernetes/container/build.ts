/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expectError, grouped } from "../../../../../helpers"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/config-graph"
import {
  k8sBuildContainer,
  k8sGetContainerBuildStatus,
  execInPod,
} from "../../../../../../src/plugins/kubernetes/container/build"
import { getDeploymentPodName } from "../../../../../../src/plugins/kubernetes/util"
import { PluginContext } from "../../../../../../src/plugin-context"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { expect } from "chai"
import { getContainerTestGarden } from "./container"
import { containerHelpers } from "../../../../../../src/plugins/container/helpers"
import {
  dockerDaemonDeploymentName,
  dockerDaemonContainerName,
} from "../../../../../../src/plugins/kubernetes/constants"
import { ContainerProvider } from "../../../../../../src/plugins/container/container"

describe("kubernetes build flow", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let containerProvider: ContainerProvider
  let ctx: PluginContext

  after(async () => {
    if (garden) {
      await garden.close()
    }
  })

  const init = async (environmentName: string) => {
    garden = await getContainerTestGarden(environmentName)
    graph = await garden.getConfigGraph(garden.log)
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    containerProvider = <ContainerProvider>await garden.resolveProvider(garden.log, "container")
    ctx = garden.getPluginContext(provider)
  }

  context("local mode", () => {
    before(async () => {
      await init("local")
    })

    it("should build a simple container", async () => {
      const module = graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })
  })

  grouped("remote-only").context("local-remote-registry mode", () => {
    before(async () => {
      await init("local-remote-registry")
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      const module = graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      const remoteId = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
      // This throws if the image doesn't exist
      await containerHelpers.dockerCli({
        cwd: module.buildPath,
        args: ["manifest", "inspect", remoteId],
        log: garden.log,
        containerProvider,
      })
    })

    it("should get the build status from the deploymentRegistry", async () => {
      const module = graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      const remoteId = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
      await containerHelpers.dockerCli({
        cwd: module.buildPath,
        args: ["rmi", remoteId],
        log: garden.log,
        containerProvider,
      })

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.true
    })
  })

  grouped("cluster-docker").context("cluster-docker mode", () => {
    before(async () => {
      await init("cluster-docker")
    })

    it("should build a simple container", async () => {
      const module = graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      const module = graph.getModule("private-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = graph.getModule("inaccessible-base")
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
      const module = graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      // Clear the image tag from the in-cluster builder
      const remoteId = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
      const podName = await getDeploymentPodName(dockerDaemonDeploymentName, provider, garden.log)
      const containerName = dockerDaemonContainerName
      const args = ["docker", "rmi", remoteId]
      await execInPod({ provider, log: garden.log, args, timeout: 300, podName, containerName })

      // This should still report the build as ready, because it's in the registry
      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.true
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("simple-service")
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

  grouped("cluster-docker").context("cluster-docker-remote-registry mode", () => {
    before(async () => {
      await init("cluster-docker-remote-registry")
    })

    grouped("remote-only").it("should push to configured deploymentRegistry if specified", async () => {
      const module = graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    grouped("remote-only").it("should get the build status from the registry", async () => {
      const module = graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      // Clear the image tag from the in-cluster builder
      const remoteId = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
      const podName = await getDeploymentPodName(dockerDaemonDeploymentName, provider, garden.log)
      const containerName = dockerDaemonContainerName
      const args = ["docker", "rmi", remoteId]
      await execInPod({ provider, log: garden.log, args, timeout: 300, podName, containerName })

      // This should still report the build as ready, because it's in the registry
      const status = await k8sGetContainerBuildStatus({
        ctx,
        log: garden.log,
        module,
      })

      expect(status.ready).to.be.true
    })

    grouped("remote-only").it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("remote-registry-test")
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

  grouped("cluster-docker").context("cluster-docker mode with BuildKit", () => {
    before(async () => {
      await init("cluster-docker-buildkit")
    })

    it("should build a simple container", async () => {
      const module = graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      const result = await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })

      // Make sure we're actually using BuildKit
      expect(result.buildLog!).to.include("load build definition from Dockerfile")
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      const module = graph.getModule("private-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const module = graph.getModule("inaccessible-base")
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

  grouped("kaniko").context("kaniko mode", () => {
    before(async () => {
      await init("kaniko")
    })

    it("should build a simple container", async () => {
      const module = graph.getModule("simple-service")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should get the build status from the registry", async () => {
      const module = graph.getModule("simple-service")
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

    grouped("remote-only").it("should support pulling from private registries", async () => {
      const module = graph.getModule("private-base")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("simple-service")
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
      const module = graph.getModule("inaccessible-base")
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

  grouped("kaniko", "remote-only").context("kaniko-remote-registry mode", () => {
    before(async () => {
      await init("kaniko-remote-registry")
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      const module = graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should get the build status from the registry", async () => {
      const module = graph.getModule("remote-registry-test")
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

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = graph.getModule("remote-registry-test")
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

  grouped("kaniko", "image-override", "remote-only").context("kaniko - image - override mode", () => {
    before(async () => {
      await init("kaniko-image-override")
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      const module = graph.getModule("remote-registry-test")
      await garden.buildDir.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })
  })
})
