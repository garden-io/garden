/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expectError, grouped } from "../../../../../../helpers"
import { Garden } from "../../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../../src/graph/config-graph"
import {
  k8sBuildContainer,
  k8sGetContainerBuildStatus,
} from "../../../../../../../src/plugins/kubernetes/container/build/build"
import { PluginContext } from "../../../../../../../src/plugin-context"
import { KubernetesProvider } from "../../../../../../../src/plugins/kubernetes/config"
import { expect } from "chai"
import { getContainerTestGarden } from "../container"
import { containerHelpers } from "../../../../../../../src/plugins/container/helpers"
import { k8sPublishContainerModule } from "../../../../../../../src/plugins/kubernetes/container/publish"
import { LogEntry } from "../../../../../../../src/logger/log-entry"
import { cloneDeep } from "lodash"

describe("kubernetes build flow", () => {
  let garden: Garden
  let log: LogEntry
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext
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
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext(provider)
  }

  async function buildImage(moduleName: string) {
    const module = cloneDeep(graph.getModule(moduleName))
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

      const remoteId = module.outputs["deployment-image-id"]
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

      const remoteId = module.outputs["deployment-image-id"]

      await containerHelpers.dockerCli({
        cwd: module.buildPath,
        args: ["rmi", remoteId],
        log,
        ctx,
      })
      builtImages[`${currentEnv}.${module.name}.${module.version.versionString}`] = false

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.state).to.equal("ready")
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

      it("should set custom tag if specified", async () => {
        const module = await buildImage("remote-registry-test")

        const { message } = await k8sPublishContainerModule({
          ctx,
          module,
          log,
          tag: "foo",
        })

        expect(message).to.eql("Published gardendev/remote-registry-test:foo")
      })
    })
  })

  grouped("kaniko", "remote-only").context("kaniko-project-namespace mode", () => {
    before(async () => {
      await init("kaniko-project-namespace")
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

      expect(status.state).to.equal("ready")
    })
  })

  grouped("kaniko", "remote-only").context("kaniko", () => {
    before(async () => {
      await init("kaniko-remote-registry")
    })

    it("should build and push to configured deploymentRegistry", async () => {
      await buildImage("remote-registry-test")
    })

    it("should get the build status from the registry", async () => {
      const module = await buildImage("remote-registry-test")

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.state).to.equal("ready")
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const module = cloneDeep(graph.getModule("remote-registry-test"))
      await garden.buildStaging.syncFromSrc(module, garden.log)

      module.version.versionString = "v-0000000000"

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.state).to.equal("not-ready")
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
          expect(err.message).to.include("UNAUTHORIZED")
        }
      )
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

      it("should set custom tag if specified", async () => {
        const module = await buildImage("remote-registry-test")

        const { message } = await k8sPublishContainerModule({
          ctx,
          module,
          log,
          tag: "foo",
        })

        expect(message).to.eql("Published gardendev/remote-registry-test:foo")
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

  // TODO: Reenable these tests e.g. for Minikube?
  grouped("cluster-buildkit", "remote-only").context("cluster-buildkit mode", () => {
    before(async () => {
      await init("cluster-buildkit")
    })

    it("should build and push a simple container", async () => {
      await buildImage("simple-service")
    })

    it("should get the build status from the registry", async () => {
      const module = await buildImage("simple-service")

      const status = await k8sGetContainerBuildStatus({
        ctx,
        log,
        module,
      })

      expect(status.state).to.equal("ready")
    })

    it("should support pulling from private registries", async () => {
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

      expect(status.state).to.equal("not-ready")
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

      it("should set custom tag if specified", async () => {
        const module = await buildImage("remote-registry-test")

        const { message } = await k8sPublishContainerModule({
          ctx,
          module,
          log,
          tag: "foo",
        })

        expect(message).to.eql("Published gardendev/remote-registry-test:foo")
      })
    })
  })

  // TODO: Reenable these tests e.g. for Minikube?
  grouped("cluster-buildkit", "remote-only").context("cluster-buildkit-rootless mode", () => {
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

      expect(status.state).to.equal("ready")
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

      expect(status.state).to.equal("not-ready")
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
})
