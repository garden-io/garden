/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expectError, grouped } from "../../../../../../helpers.js"
import type { Garden } from "../../../../../../../src/garden.js"
import type { ConfigGraph } from "../../../../../../../src/graph/config-graph.js"
import type {
  ClusterBuildkitCacheConfig,
  KubernetesPluginContext,
  KubernetesProvider,
} from "../../../../../../../src/plugins/kubernetes/config.js"
import { expect } from "chai"
import { getContainerTestGarden } from "../container.js"
import { containerHelpers } from "../../../../../../../src/plugins/container/helpers.js"
import { k8sPublishContainerBuild } from "../../../../../../../src/plugins/kubernetes/container/publish.js"
import type { ActionLog } from "../../../../../../../src/logger/log-entry.js"
import { createActionLog } from "../../../../../../../src/logger/log-entry.js"
import type { ContainerBuildAction } from "../../../../../../../src/plugins/container/config.js"
import { BuildTask } from "../../../../../../../src/tasks/build.js"
import { k8sContainerBuildExtension } from "../../../../../../../src/plugins/kubernetes/container/extensions.js"
import { deleteGoogleArtifactImage, listGoogleArtifactImageTags } from "../../../../../helpers.js"
import {
  ensureServiceAccount,
  getBuilderServiceAccountSpec,
} from "../../../../../../../src/plugins/kubernetes/container/build/common.js"
import { compareDeployedResources } from "../../../../../../../src/plugins/kubernetes/status/status.js"
import { KubeApi } from "../../../../../../../src/plugins/kubernetes/api.js"
import { ensureBuildkit } from "../../../../../../../src/plugins/kubernetes/container/build/buildkit.js"
import { uuidv4 } from "../../../../../../../src/util/random.js"

describe.skip("Kubernetes Container Build Extension", () => {
  const builder = k8sContainerBuildExtension()

  let garden: Garden
  let cleanup: (() => void) | undefined
  let log: ActionLog
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext

  after(async () => {
    if (garden) {
      garden.close()
    }
  })

  const init = async (environmentName: string, remoteContainerAuth = false) => {
    ;({ garden, cleanup } = await getContainerTestGarden(environmentName, { remoteContainerAuth }))
    log = createActionLog({ log: garden.log, action: { name: "", kind: "Build", uid: uuidv4() } })
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    ctx = (await garden.getPluginContext({
      provider,
      templateContext: undefined,
      events: undefined,
    })) as KubernetesPluginContext
  }

  async function executeBuild(buildActionName: string) {
    const action = await garden.resolveAction({ action: graph.getBuild(buildActionName), graph, log })
    const { result } = await garden.processTask(new BuildTask({ action, force: true, garden, graph, log }), {
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
      garden && garden.close()
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
    const remoteImageName = `europe-west3-docker.pkg.dev/garden-ci/garden-integ-tests/${localImageName}`

    beforeEach(async () => {
      await init("local-remote-registry", true)

      await deleteGoogleArtifactImage(localImageName)
      await containerHelpers.removeLocalImage(localImageName, log, ctx)
      await containerHelpers.removeLocalImage(remoteImageName, log, ctx)
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()

        await containerHelpers.removeLocalImage(localImageName, log, ctx)
        await containerHelpers.removeLocalImage(remoteImageName, log, ctx)
        await deleteGoogleArtifactImage(localImageName)
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

      const remoteTags = await listGoogleArtifactImageTags(localImageName)
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

      await deleteGoogleArtifactImage(localImageName)

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

        const remoteTags = await listGoogleArtifactImageTags(localImageName)
        expect(remoteTags).has.length(1)
        expect(remoteTags[0]).to.equal(action.versionString())
      })

      it("should set custom tag if specified", async () => {
        const action = await executeBuild(localImageName)

        const result = await k8sPublishContainerBuild({
          ctx,
          action,
          log,
          tagOverride: "foo",
        })

        expect(result.detail?.message).to.eql(`Published ${remoteImageName}:foo`)

        const remoteTags = await listGoogleArtifactImageTags(localImageName)
        expect(remoteTags).has.length(2)
        expect(remoteTags).to.have.members(["foo", action.versionString()])
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

      await deleteGoogleArtifactImage("simple-service")
    })

    it("should build a simple container", async () => {
      const action = await executeBuild("simple-service")

      const remoteTags = await listGoogleArtifactImageTags("simple-service")
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

      await deleteGoogleArtifactImage("simple-service")

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
        tagOverride: "0.1.0",
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

describe("Ensure serviceAccount annotations for in-cluster building", () => {
  let garden: Garden
  let cleanup: (() => void) | undefined
  let log: ActionLog
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext
  let api: KubeApi

  after(async () => {
    if (garden) {
      garden.close()
    }
  })

  const init = async (environmentName: string, remoteContainerAuth = false) => {
    ;({ garden, cleanup } = await getContainerTestGarden(environmentName, { remoteContainerAuth }))
    log = createActionLog({ log: garden.log, action: { name: "", kind: "Build", uid: uuidv4() } })
    provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    ctx = (await garden.getPluginContext({
      provider,
      templateContext: undefined,
      events: undefined,
    })) as KubernetesPluginContext
    api = await KubeApi.factory(log, ctx, provider)
  }

  grouped("cluster-buildkit").context("cluster-buildkit service account annotations", () => {
    beforeEach(async () => {
      await init("cluster-buildkit")
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    const defaultCacheConfig: ClusterBuildkitCacheConfig[] = [
      {
        type: "registry",
        mode: "auto",
        tag: "_buildcache",
        export: true,
      },
    ]

    it("should deploy a garden builder serviceAccount with specified annotations in the project namespace", async () => {
      const annotations = {
        "iam.gke.io/gcp-service-account": "workload-identity-gar@garden-ci.iam.gserviceaccount.com",
      }
      const projectNamespace = ctx.namespace

      provider.config.clusterBuildkit = { serviceAccountAnnotations: annotations, cache: defaultCacheConfig }
      const serviceAccount = getBuilderServiceAccountSpec(projectNamespace, annotations)

      await ensureServiceAccount({ ctx, log, api, namespace: projectNamespace })

      const status = await compareDeployedResources({
        ctx: ctx as KubernetesPluginContext,
        api,
        namespace: projectNamespace,
        manifests: [serviceAccount],
        log: garden.log,
      })

      expect(status.state).to.equal("ready")
    })

    it("should cycle the buildkit deployment when the serviceAccount annotations changed", async () => {
      const originalAnnotations = {
        "iam.gke.io/gcp-service-account": "workload-identity-gar@garden-ci.iam.gserviceaccount.com",
      }
      const projectNamespace = ctx.namespace
      provider.config.buildMode = "cluster-buildkit"
      provider.config.clusterBuildkit = { serviceAccountAnnotations: originalAnnotations, cache: defaultCacheConfig }

      await ensureBuildkit({ ctx, provider, log, api, namespace: projectNamespace })

      const updatedAnnotations = {
        "iam.gke.io/gcp-service-account": "a-different-service-account@garden-ci.iam.gserviceaccount.com",
      }
      provider.config.clusterBuildkit = { serviceAccountAnnotations: updatedAnnotations, cache: defaultCacheConfig }
      const { updated } = await ensureBuildkit({ ctx, provider, log: garden.log, api, namespace: projectNamespace })

      expect(updated).to.be.true
    })
  })
})
