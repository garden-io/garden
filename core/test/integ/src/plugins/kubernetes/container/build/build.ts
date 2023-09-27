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
import { deleteGoogleArtifactImage, listGoogleArtifactImageTags } from "../../../../../helpers"

describe("Kubernetes Container Build Extension", () => {
  const builder = k8sContainerBuildExtension()

  let garden: Garden
  let cleanup: (() => void) | undefined
  let log: ActionLog
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext
  let currentEnv: string

  after(async () => {
    if (garden) {
      garden.close()
    }
  })

  const init = async (environmentName: string, remoteContainerAuth: boolean = false) => {
    currentEnv = environmentName
    ;({ garden, cleanup } = await getContainerTestGarden(environmentName, { remoteContainerAuth }))
    log = createActionLog({ log: garden.log, actionName: "", actionKind: "" })
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
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

      const imageExists = await containerHelpers.imageExistsLocally("simple-service", log, ctx)
      expect(imageExists?.identifier).to.equal("simple-service")
    })
  })

  grouped("remote-only").context("local-remote-registry mode", () => {
    const serviceImageName = "remote-registry-test"
    const localImageName = `garden-integ-tests/${serviceImageName}`
    const remoteImageName = `europe-west3-docker.pkg.dev/garden-ci/${localImageName}`

    beforeEach(async () => {
      await init("local-remote-registry", true)

      await deleteGoogleArtifactImage(serviceImageName)
      await containerHelpers.removeLocalImage(localImageName, log, ctx)
      await containerHelpers.removeLocalImage(remoteImageName, log, ctx)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }

      await containerHelpers.removeLocalImage(localImageName, log, ctx)
      await containerHelpers.removeLocalImage(remoteImageName, log, ctx)
      await deleteGoogleArtifactImage(serviceImageName)
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      const action = await executeBuild(serviceImageName)

      const remoteId = action.getOutput("deployment-image-id")
      const tag = action.versionString()
      const taggedLocalName = `${localImageName}:${tag}`
      const taggedRemoteName = `${remoteImageName}:${tag}`

      expect(remoteId).to.equal(taggedRemoteName)

      const remoteNameExists = await containerHelpers.imageExistsLocally(taggedRemoteName, log, ctx)
      expect(remoteNameExists?.identifier).to.equal(taggedRemoteName)

      const localNameExists = await containerHelpers.imageExistsLocally(taggedLocalName, log, ctx)
      expect(localNameExists?.identifier).to.equal(taggedLocalName)

      const remoteTags = await listGoogleArtifactImageTags(serviceImageName)
      expect(remoteTags).has.length(1)
      expect(remoteTags[0]).to.equal(tag)
    })

    it("should get the build status from the remote deploymentRegistry", async () => {
      const action = await executeBuild(serviceImageName)

      await containerHelpers.removeLocalImage(localImageName, log, ctx)
      await containerHelpers.removeLocalImage(remoteImageName, log, ctx)

      const resultExists = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultExists.state).to.equal("ready")

      await deleteGoogleArtifactImage(serviceImageName)

      const resultNotExists = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(resultNotExists.state).to.equal("not-ready")
    })

    context("publish handler", () => {
      it("should publish the built image", async () => {
        const action = await executeBuild(serviceImageName)

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
        })

        expect(result.detail?.message).to.eql(`Published ${remoteImageName}:${action.versionString()}`)

        const remoteTags = await listGoogleArtifactImageTags(serviceImageName)
        expect(remoteTags).has.length(1)
        expect(remoteTags[0]).to.equal(action.versionString())
      })

      it("should set custom tag if specified", async () => {
        const action = await executeBuild(serviceImageName)

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
          tag: "foo",
        })

        expect(result.detail?.message).to.eql(`Published ${remoteImageName}:foo`)

        const remoteTags = await listGoogleArtifactImageTags(serviceImageName)
        expect(remoteTags).has.length(1)
        expect(remoteTags[0]).to.equal(action.versionString())
      })
    })
  })

  grouped("kaniko", "remote-only").context("kaniko-project-namespace mode", () => {
    const serviceImageName = "simple-service"

    beforeEach(async () => {
      await init("kaniko-project-namespace", true)

      await deleteGoogleArtifactImage(serviceImageName)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }

      await deleteGoogleArtifactImage(serviceImageName)
    })

    it("should build a simple container", async () => {
      const action = await executeBuild("simple-service")

      const remoteTags = await listGoogleArtifactImageTags(serviceImageName)
      expect(remoteTags).has.length(1)
      expect(remoteTags[0]).to.equal(action.versionString())
    })

    it("should get the build status from the registry", async () => {
      const action = await executeBuild("simple-service")

      const status = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(status.state).to.equal("ready")
    })
  })

  grouped("kaniko", "remote-only").context("kaniko", () => {
    const serviceImageName = "remote-registry-test"
    const localImageName = `garden-integ-tests/${serviceImageName}`

    beforeEach(async () => {
      await init("kaniko-remote-registry", true)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }

      await deleteGoogleArtifactImage(serviceImageName)
      await deleteGoogleArtifactImage("simple-service")
      await containerHelpers.removeLocalImage("simple-service", log, ctx)
      await containerHelpers.removeLocalImage(localImageName, log, ctx)
    })

    it("should build and push to configured remote deploymentRegistry", async () => {
      const action = await executeBuild(serviceImageName)

      const remoteTags = await listGoogleArtifactImageTags(serviceImageName)
      expect(remoteTags).has.length(1)
      expect(remoteTags[0]).to.equal(action.versionString())
    })

    it("should get the build status from the registry", async () => {
      const action = await executeBuild(serviceImageName)

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
      const result = await k8sPublishContainerBuild({
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
          "Published europe-west3-docker.pkg.dev/garden-ci/garden-integ-tests/remote-registry-test:" +
            action.versionString()
        )
      })

      it("should set custom tag if specified", async () => {
        const action = await executeBuild("remote-registry-test")

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
          tag: "foo",
        })

        expect(result.detail?.message).to.eql(
          "Published europe-west3-docker.pkg.dev/garden-ci/garden-integ-tests/remote-registry-test:foo"
        )
      })
    })
  })

  grouped("kaniko", "image-override", "remote-only").context("kaniko - image - override mode", () => {
    before(async () => {
      await init("kaniko-image-override")
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    it("should push to configured deploymentRegistry if specified", async () => {
      await executeBuild("remote-registry-test")
    })
  })

  // TODO: Reenable these tests e.g. for Minikube?
  grouped("cluster-buildkit", "remote-only").context("cluster-buildkit mode", () => {
    before(async () => {
      await init("cluster-buildkit")
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    it("should build and push a simple container", async () => {
      await executeBuild("simple-service")
    })

    it("should get the build status from the registry", async () => {
      const action = await executeBuild("simple-service")

      const status = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(status.state).to.equal("ready")
    })

    it("should support pulling from private registries", async () => {
      await executeBuild("private-base")
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const action = graph.getBuild("simple-service")
      await garden.buildStaging.syncFromSrc({ action, log: garden.log })

      action["_config"].spec.localId = "skee-ba-dee-skoop"

      const status = await builder.handlers.getStatus!({
        ctx,
        log,
        action: await garden.resolveAction<ContainerBuildAction>({ action, log: garden.log, graph }),
      })

      expect(status.state).to.equal("not-ready")
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
      it("should publish the built image", async () => {
        const action = await executeBuild("remote-registry-test")

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
        })

        expect(result.detail?.message).to.eql(
          "Published europe-west3-docker.pkg.dev/garden-ci/garden-integ-tests/remote-registry-test:" +
            action.versionString()
        )
      })

      it("should set custom tag if specified", async () => {
        const action = await executeBuild("remote-registry-test")

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
          tag: "foo",
        })

        expect(result.detail?.message).to.eql(
          "Published europe-west3-docker.pkg.dev/garden-ci/garden-integ-tests/remote-registry-test:foo"
        )
      })
    })
  })

  // TODO: Reenable these tests e.g. for Minikube?
  grouped("cluster-buildkit", "remote-only").context("cluster-buildkit-rootless mode", () => {
    before(async () => {
      await init("cluster-buildkit-rootless", true)
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    it("should build a simple container", async () => {
      await executeBuild("simple-service")
    })

    it("should get the build status from the registry", async () => {
      const action = await executeBuild("simple-service")

      const status = await builder.handlers.getStatus!({
        ctx,
        log,
        action,
      })

      expect(status.state).to.equal("ready")
    })

    grouped("remote-only").it("should support pulling from private registries", async () => {
      await executeBuild("private-base")
    })

    it("should return ready=false status when image doesn't exist in registry", async () => {
      const action = graph.getBuild("simple-service")
      await garden.buildStaging.syncFromSrc({ action, log: garden.log })

      action["_config"].spec.localId = "skee-ba-dee-skoop"

      const status = await builder.handlers.getStatus!({
        ctx,
        log,
        action: await garden.resolveAction<ContainerBuildAction>({ action, log: garden.log, graph }),
      })

      expect(status.state).to.equal("not-ready")
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
