/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expectError, grouped } from "../../../../../../helpers"
import { Garden } from "../../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../../src/graph/config-graph"
import { PluginContext } from "../../../../../../../src/plugin-context"
import { KubernetesProvider } from "../../../../../../../src/plugins/kubernetes/config"
import { expect } from "chai"
import { getContainerTestGarden } from "../container"
import { containerHelpers } from "../../../../../../../src/plugins/container/helpers"
import { k8sPublishContainerBuild } from "../../../../../../../src/plugins/kubernetes/container/publish"
import { ActionLog, createActionLog } from "../../../../../../../src/logger/log-entry"
import { ContainerBuildAction } from "../../../../../../../src/plugins/container/config"
import { BuildTask } from "../../../../../../../src/tasks/build"
import { k8sContainerBuildExtension } from "../../../../../../../src/plugins/kubernetes/container/extensions"
import { deleteGoogleArtifactImage, deleteNamespace, listGoogleArtifactImageTags } from "../../../../../helpers"
import { KubeApi } from "../../../../../../../src/plugins/kubernetes/api"

describe("Kubernetes Container Build Extension", () => {
  const builder = k8sContainerBuildExtension()

  let garden: Garden
  let cleanup: (() => void) | undefined
  let log: ActionLog
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext
  let deploymentRegistry: string | undefined
  let api: KubeApi

  after(async () => {
    if (cleanup) {
      cleanup()
      await deleteNamespace(api, "container-default")
    }
  })

  const init = async (environmentName: string, remoteContainerAuth = false) => {
    ;({ garden, cleanup } = await getContainerTestGarden(environmentName, { remoteContainerAuth }))
    log = createActionLog({ log: garden.log, actionName: "", actionKind: "" })
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    api = await KubeApi.factory(garden.log, ctx, provider)

    deploymentRegistry = provider.config.deploymentRegistry
      ? `${provider.config.deploymentRegistry.hostname}/${provider.config.deploymentRegistry.namespace}`
      : undefined
  }

  async function executeBuild(buildActionName: string) {
    const action = await garden.resolveAction({ action: graph.getBuild(buildActionName), graph, log })
    const result = await garden.processTask(new BuildTask({ action, force: true, garden, graph, log }), log, {
      throwOnError: true,
    })
    return result?.result?.executedAction!
  }

  context("local mode", () => {
    beforeEach(async () => {
      await init("local")

      await containerHelpers.removeLocalImage("simple-service", log, ctx)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }

      await containerHelpers.removeLocalImage("simple-service", log, ctx)
    })

    it("should build a simple container", async () => {
      await executeBuild("simple-service")

      const imageExists = await containerHelpers.getLocalImageInfo("simple-service", log, ctx)
      expect(imageExists?.identifier).to.equal("simple-service")
    })
  })

  grouped("remote-only").context("local-remote-registry mode", () => {
    const localImageName = "remote-registry-test"
    let remoteImageName: string

    beforeEach(async () => {
      await init("local-remote-registry", true)

      remoteImageName = `${deploymentRegistry}/${localImageName}`

      await deleteGoogleArtifactImage(remoteImageName)
      await containerHelpers.removeLocalImage(localImageName, log, ctx)
      await containerHelpers.removeLocalImage(remoteImageName, log, ctx)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()

        await containerHelpers.removeLocalImage(localImageName, log, ctx)
        await containerHelpers.removeLocalImage(remoteImageName, log, ctx)
        await deleteGoogleArtifactImage(remoteImageName)
      }
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      const action = await executeBuild(localImageName)

      const remoteId = action.getOutput("deployment-image-id")
      const tag = action.versionString()
      const taggedLocalName = `${localImageName}:${tag}`
      const taggedRemoteName = `${remoteImageName}:${tag}`

      expect(remoteId).to.equal(taggedRemoteName)

      const remoteNameExists = await containerHelpers.getLocalImageInfo(taggedRemoteName, log, ctx)
      expect(remoteNameExists?.identifier).to.equal(taggedRemoteName)

      const localNameExists = await containerHelpers.getLocalImageInfo(taggedLocalName, log, ctx)
      expect(localNameExists?.identifier).to.equal(taggedLocalName)

      const remoteTags = await listGoogleArtifactImageTags(remoteImageName)
      expect(remoteTags).has.length(1)
      expect(remoteTags[0]).to.equal(tag)
    })

    it("should get the build status from the private deploymentRegistry", async () => {
      const action = await executeBuild(localImageName)

      // delete any local images to make sure we are not fetching from the wrong place
      await containerHelpers.removeLocalImage(localImageName, log, ctx)
      await containerHelpers.removeLocalImage(remoteImageName, log, ctx)

      const resultReady = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultReady.state).to.equal("ready")

      await deleteGoogleArtifactImage(remoteImageName)

      const resultNotReady = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultNotReady.state).to.equal("not-ready")
    })

    context("publish handler", () => {
      it("should publish the built image", async () => {
        const action = await executeBuild(localImageName)

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
        })

        expect(result.detail?.message).to.eql(`Published ${remoteImageName}:${action.versionString()}`)

        const remoteTags = await listGoogleArtifactImageTags(remoteImageName)
        expect(remoteTags).has.length(1)
        expect(remoteTags[0]).to.equal(action.versionString())
      })

      it("should set custom tag if specified", async () => {
        const action = await executeBuild(localImageName)

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
          tag: "foo",
        })

        expect(result.detail?.message).to.eql(`Published ${remoteImageName}:foo`)

        const remoteTags = await listGoogleArtifactImageTags(remoteImageName)
        expect(remoteTags).has.length(2)
        expect(remoteTags).to.have.members(["foo", action.versionString()])
      })
    })
  })

  grouped("kaniko", "remote-only").context("kaniko-project-namespace mode", () => {
    beforeEach(async () => {
      await init("kaniko-project-namespace", true)

      await deleteGoogleArtifactImage(`${deploymentRegistry}/simple-service`)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }

      await deleteGoogleArtifactImage(`${deploymentRegistry}/simple-service`)
    })

    it("should build a simple container", async () => {
      const action = await executeBuild("simple-service")

      const remoteTags = await listGoogleArtifactImageTags(`${deploymentRegistry}/simple-service`)
      expect(remoteTags).has.length(1)
      expect(remoteTags[0]).to.equal(action.versionString())
    })

    it("should get the build status from the private deploymentRegistry", async () => {
      const action = await executeBuild("simple-service")

      const resultReady = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultReady.state).to.equal("ready")

      await deleteGoogleArtifactImage(`${deploymentRegistry}/simple-service`)

      const resultNotReady = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultNotReady.state).to.equal("not-ready")
    })
  })

  grouped("kaniko", "remote-only").context("kaniko", () => {
    const localImageName = "remote-registry-test"

    beforeEach(async () => {
      await init("kaniko-remote-registry", true)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }

      await deleteGoogleArtifactImage(`${deploymentRegistry}/${localImageName}`)
      await deleteGoogleArtifactImage(`${deploymentRegistry}/simple-service`)
      await containerHelpers.removeLocalImage("simple-service", log, ctx)
      await containerHelpers.removeLocalImage(localImageName, log, ctx)
    })

    it("should build and push to configured private deploymentRegistry", async () => {
      const action = await executeBuild(localImageName)

      const remoteTags = await listGoogleArtifactImageTags(`${deploymentRegistry}/${localImageName}`)
      expect(remoteTags).has.length(1)
      expect(remoteTags[0]).to.equal(action.versionString())
    })

    it("should get the build status from the private deploymentRegistry", async () => {
      const action = await executeBuild(localImageName)

      const status = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(status.state).to.equal("ready")
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      // Ensure the simple service image exists, this is referenced from the private-base dockerfile
      const action = await executeBuild("simple-service")

      // Relies on the publish and tagging to work
      await k8sPublishContainerBuild({
        ctx,
        action,
        log,
        tag: "0.1.0",
      })

      await executeBuild("private-base")
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const action = graph.getBuild("inaccessible-base")
      await garden.buildStaging.syncFromSrc({ action, log: garden.log })

      await expectError(
        async () =>
          await builder.handlers.build!({
            ctx,
            log,
            action: await garden.resolveAction<ContainerBuildAction>({ action, log: garden.log, graph }),
          }),
        (err) => {
          expect(err.message).to.include("UNAUTHORIZED")
        }
      )
    })

    context("publish handler", () => {
      it("should publish the built image", async () => {
        const action = await executeBuild("remote-registry-test")

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
        })

        expect(result.detail?.message).to.eql(
          `Published ${deploymentRegistry}/remote-registry-test:` + action.versionString()
        )

        const remoteTags = await listGoogleArtifactImageTags(`${deploymentRegistry}/remote-registry-test`)
        expect(remoteTags).has.length(1)
        expect(remoteTags[0]).to.equal(action.versionString())
      })

      it("should set custom tag if specified", async () => {
        const action = await executeBuild("remote-registry-test")

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
          tag: "foo",
        })

        expect(result.detail?.message).to.eql(`Published ${deploymentRegistry}/remote-registry-test:foo`)

        const remoteTags = await listGoogleArtifactImageTags(`${deploymentRegistry}/remote-registry-test`)
        expect(remoteTags).has.length(2)
        expect(remoteTags).to.have.members(["foo", action.versionString()])
      })
    })
  })

  grouped("kaniko", "image-override", "remote-only").context("kaniko - image - override mode", () => {
    before(async () => {
      await init("kaniko-image-override", true)
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }

      await deleteGoogleArtifactImage(`${deploymentRegistry}/remote-registry-test`)
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      const action = await executeBuild("remote-registry-test")

      const remoteTags = await listGoogleArtifactImageTags(`${deploymentRegistry}/remote-registry-test`)
      expect(remoteTags).has.length(1)
      expect(remoteTags[0]).to.equal(action.versionString())
    })
  })

  // TODO: Reenable these tests e.g. for Minikube?
  grouped("cluster-buildkit", "remote-only").context("cluster-buildkit mode", () => {
    before(async () => {
      await init("cluster-buildkit", true)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }

      await deleteGoogleArtifactImage(`${deploymentRegistry}/simple-service`)
      await containerHelpers.removeLocalImage("simple-service", log, ctx)
    })

    it("should build and push a simple container", async () => {
      const action = await executeBuild("simple-service")

      const remoteTags = await listGoogleArtifactImageTags(`${deploymentRegistry}/simple-service`)
      expect(remoteTags).has.length(2)
      expect(remoteTags).to.have.members([action.versionString(), "_buildcache"])
    })

    it("should get the build status from the private deploymentRegistry", async () => {
      const action = await executeBuild("simple-service")

      const resultReady = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultReady.state).to.equal("ready")

      await deleteGoogleArtifactImage(`${deploymentRegistry}/simple-service`)

      const resultNotExists = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultNotExists.state).to.equal("not-ready")
    })

    it("should support pulling from private registries", async () => {
      // Ensure the simple service image exists, this is referenced from the private-base dockerfile
      const action = await executeBuild("simple-service")

      // Relies on the publish and tagging to work
      await k8sPublishContainerBuild({
        ctx,
        action,
        log,
        tag: "0.1.0",
      })

      await executeBuild("private-base")
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const action = graph.getBuild("inaccessible-base")
      await garden.buildStaging.syncFromSrc({ action, log: garden.log })

      await expectError(
        async () =>
          await builder.handlers.build!({
            ctx,
            log,
            action: await garden.resolveAction<ContainerBuildAction>({ action, log: garden.log, graph }),
          }),
        (err) => {
          expect(err.message).to.include("authorization failed")
        }
      )
    })

    context("publish handler", () => {
      afterEach(async () => {
        await deleteGoogleArtifactImage(`${deploymentRegistry}/remote-registry-test`)
        await containerHelpers.removeLocalImage("remote-registry-test", log, ctx)
        await containerHelpers.removeLocalImage(`${deploymentRegistry}/remote-registry-test`, log, ctx)
      })

      it("should publish the built image", async () => {
        const action = await executeBuild("remote-registry-test")

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
        })

        expect(result.detail?.message).to.eql(
          `Published ${deploymentRegistry}/remote-registry-test:` + action.versionString()
        )

        const remoteTags = await listGoogleArtifactImageTags(`${deploymentRegistry}/remote-registry-test`)
        expect(remoteTags).has.length(2)
        expect(remoteTags).to.have.members([action.versionString(), "_buildcache"])
      })

      it("should set custom tag if specified", async () => {
        const action = await executeBuild("remote-registry-test")

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
          tag: "foo",
        })

        expect(result.detail?.message).to.eql(`Published ${deploymentRegistry}/remote-registry-test:foo`)

        const remoteTags = await listGoogleArtifactImageTags(`${deploymentRegistry}/remote-registry-test`)
        expect(remoteTags).has.length(3)
        expect(remoteTags).to.have.members(["foo", action.versionString(), "_buildcache"])
      })
    })
  })

  // TODO: Reenable these tests e.g. for Minikube?
  grouped("cluster-buildkit", "remote-only").context("cluster-buildkit-rootless mode", () => {
    before(async () => {
      await init("cluster-buildkit-rootless", true)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }

      await deleteGoogleArtifactImage(`${deploymentRegistry}/simple-service`)
    })

    it("should build a simple container", async () => {
      const action = await executeBuild("simple-service")

      const remoteTags = await listGoogleArtifactImageTags(`${deploymentRegistry}/simple-service`)
      expect(remoteTags).has.length(2)
      expect(remoteTags).to.have.members([action.versionString(), "_buildcache"])
    })

    it("should get the build status from the private deploymentRegistry", async () => {
      const action = await executeBuild("simple-service")

      const resultReady = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultReady.state).to.equal("ready")

      await deleteGoogleArtifactImage(`${deploymentRegistry}/simple-service`)

      const resultNotExists = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultNotExists.state).to.equal("not-ready")
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      // Ensure the simple service image exists, this is referenced from the private-base dockerfile
      const action = await executeBuild("simple-service")

      // Relies on the publish and tagging to work
      await k8sPublishContainerBuild({
        ctx,
        action,
        log,
        tag: "0.1.0",
      })

      await executeBuild("private-base")
    })

    it("should throw if attempting to pull from private registry without access", async () => {
      const action = graph.getBuild("inaccessible-base")
      await garden.buildStaging.syncFromSrc({ action, log: garden.log })

      await expectError(
        async () =>
          await builder.handlers.build!({
            ctx,
            log,
            action: await garden.resolveAction<ContainerBuildAction>({ action, log: garden.log, graph }),
          }),
        (err) => {
          expect(err.message).to.include("authorization failed")
        }
      )
    })
  })
})
