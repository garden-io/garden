/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { TestGarden } from "../../../../../helpers.js"
import { expectError, getDataDir, makeTestGarden } from "../../../../../helpers.js"
import { deleteHelmDeploy, helmDeploy } from "../../../../../../src/plugins/kubernetes/helm/deployment.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config.js"
import {
  gardenCloudAECPauseAnnotation,
  getHelmGardenMetadataConfigMapData,
  getReleaseStatus,
  getRenderedResources,
} from "../../../../../../src/plugins/kubernetes/helm/status.js"
import { getReleaseName } from "../../../../../../src/plugins/kubernetes/helm/common.js"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api.js"
import { buildHelmModules, getHelmTestGarden } from "./common.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import { isWorkload } from "../../../../../../src/plugins/kubernetes/util.js"
import type { HelmDeployAction, HelmDeployConfig } from "../../../../../../src/plugins/kubernetes/helm/config.js"
import { createActionLog } from "../../../../../../src/logger/log-entry.js"
import { getActionNamespace } from "../../../../../../src/plugins/kubernetes/namespace.js"
import stripAnsi from "strip-ansi"
import { randomString } from "../../../../../../src/util/string.js"
import { ChildProcessError, DeploymentError } from "../../../../../../src/exceptions.js"
import { parseTemplateCollection } from "../../../../../../src/template/templated-collections.js"
import { DEFAULT_DEPLOY_TIMEOUT_SEC } from "../../../../../../src/constants.js"
import { join } from "node:path"
import type { EventNamespaceStatus } from "../../../../../../src/plugin-context.js"

describe("helmDeploy", () => {
  let garden: TestGarden
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    await buildHelmModules(garden, graph)
  })

  after(async () => {
    // https://app.circleci.com/pipelines/github/garden-io/garden/15885/workflows/6026638c-7544-45a8-bc07-16f8963c5b9f/jobs/265663?invite=true#step-113-577
    // sometimes the release is already purged
    try {
      const actions = await garden.getActionRouter()
      await actions.deleteDeploys({ graph, log: garden.log })
      if (garden) {
        garden.close()
      }
    } catch {}
  })

  context("normal behaviour", () => {
    for (const deployName of ["api", "oci-url", "oci-url-with-version"]) {
      it(`should deploy chart ${deployName} successfully`, async () => {
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const action = await garden.resolveAction<HelmDeployAction>({
          action: graph.getDeploy(deployName),
          log: garden.log,
          graph,
        })
        const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

        // Here, we're not going through a router, so we listen for the `namespaceStatus` event directly.
        let namespaceStatus: EventNamespaceStatus | null = null
        ctx.events.once("namespaceStatus", (status) => (namespaceStatus = status))
        await helmDeploy({
          ctx,
          log: actionLog,
          action,
          force: false,
        })
        expect(namespaceStatus).to.exist
        expect(namespaceStatus!.namespaceName).to.eql("helm-test-default")

        const releaseName = getReleaseName(action)
        const releaseStatus = await getReleaseStatus({
          ctx,
          action,
          releaseName,
          log: garden.log,
        })

        expect(releaseStatus.state).to.equal("ready")
        // getReleaseStatus fetches these details from a configmap in the action namespace.
        // This means we are testing that the configmap is created correctly every time we
        // test the gardenMetadata details from getReleaseStatus.
        expect(releaseStatus.detail.gardenMetadata).to.eql({
          actionName: deployName,
          projectName: garden.projectName,
          version: action.versionString(),
          mode: "default",
        })
      })
    }

    it("should deploy a chart from a converted Helm module referencing a container module version in its image tag", async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = await garden.resolveAction<HelmDeployAction>({
        action: graph.getDeploy("api-module"),
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      // Here, we're not going through a router, so we listen for the `namespaceStatus` event directly.
      let namespaceStatus: EventNamespaceStatus | null = null
      ctx.events.once("namespaceStatus", (status) => (namespaceStatus = status))
      await helmDeploy({
        ctx,
        log: actionLog,
        action,
        force: false,
      })
      expect(namespaceStatus).to.exist
      expect(namespaceStatus!.namespaceName).to.eql("helm-test-default")

      const releaseName = getReleaseName(action)
      const releaseStatus = await getReleaseStatus({
        ctx,
        action,
        releaseName,
        log: garden.log,
      })

      expect(releaseStatus.state).to.equal("ready")
      expect(releaseStatus.detail.gardenMetadata).to.eql({
        actionName: "api-module",
        projectName: garden.projectName,
        version: action.versionString(),
        mode: "default",
      })
    })

    it("should deploy a chart with sync enabled", async () => {
      graph = await garden.getConfigGraph({
        log: garden.log,
        emit: false,
        actionModes: { sync: ["deploy.api"] }, // <-----
      })
      const action = await garden.resolveAction<HelmDeployAction>({
        action: graph.getDeploy("api"),
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      const releaseName = getReleaseName(action)
      await helmDeploy({
        ctx,
        log: actionLog,
        action,
        force: false,
      })

      const status = await getReleaseStatus({
        ctx,
        action,
        releaseName,
        log: garden.log,
      })

      expect(status.state).to.equal("ready")
      expect(status.detail.mode).to.eql("sync")
      expect(status.detail.gardenMetadata).to.eql({
        actionName: "api",
        projectName: garden.projectName,
        version: action.versionString(),
        mode: "sync",
      })
    })

    it("should deploy a chart with an alternate namespace set", async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = await garden.resolveAction<HelmDeployAction>({
        action: graph.getDeploy("chart-with-namespace"),
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      const namespace = action.getSpec().namespace!
      expect(namespace).to.equal(provider.config.namespace!.name + "-extra")

      await helmDeploy({
        ctx,
        log: actionLog,
        action,
        force: false,
      })

      const releaseName = getReleaseName(action)
      const status = await getReleaseStatus({
        ctx,
        action,
        releaseName,
        log: garden.log,
      })

      expect(status.state).to.equal("ready")

      const api = await KubeApi.factory(garden.log, ctx, provider)

      // Namespace should exist
      await api.core.readNamespace({ name: namespace })

      // Deployment should exist
      await api.apps.readNamespacedDeployment({ name: "chart-with-namespace", namespace })
    })

    it("should mark a chart that is deployed but does not have a matching configmap as outdated", async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = await garden.resolveAction<HelmDeployAction>({
        action: graph.getDeploy("api"),
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })
      const namespace = await getActionNamespace({
        ctx,
        log: garden.log,
        action,
        provider: ctx.provider,
      })
      // Here, we're not going through a router, so we listen for the `namespaceStatus` event directly.
      await helmDeploy({
        ctx,
        log: actionLog,
        action,
        force: false,
      })

      const releaseName = getReleaseName(action)
      const releaseStatus = await getReleaseStatus({
        ctx,
        action,
        releaseName,
        log: garden.log,
      })

      expect(releaseStatus.state).to.equal("ready")
      // delete the configmap
      const api = await KubeApi.factory(actionLog, ctx, ctx.provider)
      await api.core.deleteNamespacedConfigMap({
        namespace,
        name: `garden-helm-metadata-${action.name}`,
      })

      const releaseStatusAfterDelete = await getReleaseStatus({
        ctx,
        action,
        releaseName,
        log: garden.log,
      })

      expect(releaseStatusAfterDelete.state).to.equal("outdated")
    })

    it("should remove the garden metadata configmap associated with a helm deploy action when the chart is uninstalled", async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = await garden.resolveAction<HelmDeployAction>({
        action: graph.getDeploy("api"),
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })
      const namespace = await getActionNamespace({
        ctx,
        log: garden.log,
        action,
        provider: ctx.provider,
      })
      // Here, we're not going through a router, so we listen for the `namespaceStatus` event directly.
      await helmDeploy({
        ctx,
        log: actionLog,
        action,
        force: false,
      })

      const releaseName = getReleaseName(action)
      const releaseStatus = await getReleaseStatus({
        ctx,
        action,
        releaseName,
        log: garden.log,
      })

      expect(releaseStatus.state).to.equal("ready")

      await deleteHelmDeploy({ ctx, log: actionLog, action })
      await expectError(
        async () =>
          await getHelmGardenMetadataConfigMapData({
            ctx,
            action,
            log: actionLog,
            namespace,
          })
      )
    })

    it("should mark a chart that has been paused by Garden Cloud AEC as outdated", async () => {
      const projectRoot = getDataDir("test-projects", "helm")
      const gardenWithCloudApi = await makeTestGarden(projectRoot, {
        noCache: true,
      })

      graph = await gardenWithCloudApi.getConfigGraph({ log: gardenWithCloudApi.log, emit: false })
      const providerWithApi = <KubernetesProvider>(
        await garden.resolveProvider({ log: gardenWithCloudApi.log, name: "local-kubernetes" })
      )
      const ctxWithCloudApi = <KubernetesPluginContext>await gardenWithCloudApi.getPluginContext({
        provider: providerWithApi,
        templateContext: undefined,
        events: undefined,
      })

      const action = await garden.resolveAction<HelmDeployAction>({
        action: graph.getDeploy("api"),
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({
        log: gardenWithCloudApi.log,
        actionName: action.name,
        actionKind: action.kind,
      })

      await helmDeploy({
        ctx: ctxWithCloudApi,
        log: actionLog,
        action,
        force: false,
      })

      const releaseName = getReleaseName(action)
      const releaseStatus = await getReleaseStatus({
        ctx: ctxWithCloudApi,
        action,
        releaseName,
        log: gardenWithCloudApi.log,
      })

      expect(releaseStatus.state).to.equal("ready")
      expect(releaseStatus.detail.gardenMetadata).to.eql({
        actionName: "api",
        projectName: gardenWithCloudApi.projectName,
        version: action.versionString(),
        mode: "default",
      })

      const api = await KubeApi.factory(gardenWithCloudApi.log, ctxWithCloudApi, ctxWithCloudApi.provider)
      const renderedResources = await getRenderedResources({
        ctx: ctxWithCloudApi,
        action,
        releaseName,
        log: gardenWithCloudApi.log,
      })
      const workloads = renderedResources.filter(
        (resource) => isWorkload(resource) && resource.metadata.name === "api-release"
      )
      const apiDeployment = (
        await Promise.all(
          workloads.map((workload) =>
            api.readBySpec({ log: gardenWithCloudApi.log, namespace: "helm-test-default", manifest: workload })
          )
        )
      )[0]
      const existingAnnotations = apiDeployment.metadata.annotations
      apiDeployment.metadata.annotations = {
        ...existingAnnotations,
        [gardenCloudAECPauseAnnotation]: "paused",
      }

      await api.apps.patchNamespacedDeployment({
        name: apiDeployment.metadata?.name,
        namespace: "helm-test-default",
        body: apiDeployment,
      })

      const releaseStatusAfterScaleDown = await getReleaseStatus({
        ctx: ctxWithCloudApi,
        action,
        releaseName,
        log: gardenWithCloudApi.log,
      })
      expect(releaseStatusAfterScaleDown.state).to.equal("outdated")
    })

    it("should wait for the Helm command to complete if there are no resource errors", async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const action = graph.getDeploy("api") as HelmDeployAction
      const resolvedAction = await garden.resolveAction({
        action,
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({
        log: garden.log,
        actionName: resolvedAction.name,
        actionKind: resolvedAction.kind,
      })

      const res = await helmDeploy({
        ctx,
        log: actionLog,
        action: resolvedAction,
        force: false,
      })

      expect(res.detail?.detail.helmCommandSuccessful).to.eql(true)
    })
  })

  context("errors and failures", () => {
    function makeAlternativeApiDeployConfig(name: string): HelmDeployConfig {
      // based on 'deploy.api' action defined in the disk-based project
      const helmDeployConfig = {
        kind: "Deploy" as const,
        name,
        type: "helm" as const,
        description: "The API backend for the voting UI",
        dependencies: ["build.api-image"],
        internal: {
          // Use the same config dir as the deploy.api action
          basePath: join(garden.projectRoot, "api"),
        },
        timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
        spec: {
          releaseName: name,
          sync: {
            paths: [
              {
                containerPath: "/app",
              },
            ],
          },
          defaultTarget: {
            kind: "Deployment",
            name,
          },
          values: {
            args: ["python", "app.py"],
            image: {
              repository: "api-image",
              tag: "${actions.build.api-image.version}",
            },
            ingress: {
              enabled: true,
              paths: ["/"],
              hosts: ["api.local.demo.garden"],
            },
          },
        },
      }

      // @ts-expect-error todo: correct types for unresolved configs
      return parseTemplateCollection({ value: helmDeployConfig, source: { path: [] } })
    }

    it("should include K8s events and Pod logs with errors", async () => {
      const name = `api-${randomString(4)}`
      const deployConfig = makeAlternativeApiDeployConfig(name)

      deployConfig.spec.values["args"] = ["/bin/sh", "-c", "echo 'hello' && exit 1"]
      deployConfig.spec.values["ingress"]!["enabled"] = false

      garden.addAction(deployConfig)

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy(name) as HelmDeployAction
      const resolvedAction = await garden.resolveAction({
        action,
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({
        log: garden.log,
        actionName: resolvedAction.name,
        actionKind: resolvedAction.kind,
      })
      const releaseName = getReleaseName(resolvedAction)

      await expectError(
        () =>
          helmDeploy({
            ctx,
            log: actionLog,
            action: resolvedAction,
            force: false,
          }),
        (err) => {
          const message = stripAnsi(err.message)
          expect(message).to.include(`Latest events from Deployment ${releaseName}`)
          expect(message).to.include(`BackOff`)
          expect(message).to.include(`Latest logs from failed containers in each Pod in Deployment ${releaseName}`)
          expect(message).to.match(/api-.+\/api: hello/)
        }
      )
    })

    it("should fail fast if one of the resources is unhealthy", async () => {
      const name = `api-${randomString(4)}`
      const deployConfig = makeAlternativeApiDeployConfig(name)

      deployConfig.spec.values["args"] = ["/bin/sh", "-c", "echo 'hello' && exit 1"]
      deployConfig.spec.values["ingress"]!["enabled"] = false

      garden.addAction(deployConfig)

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy(name) as HelmDeployAction
      const resolvedAction = await garden.resolveAction({
        action,
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({
        log: garden.log,
        actionName: resolvedAction.name,
        actionKind: resolvedAction.kind,
      })

      await expectError(
        () =>
          helmDeploy({
            ctx,
            log: actionLog,
            action: resolvedAction,
            force: false,
          }),
        (err) => {
          expect(err).to.be.instanceOf(DeploymentError)
        }
      )
    })

    context("atomic=true", () => {
      it("should NOT fail fast if one of the resources is unhealthy but wait for the Helm command to complete", async () => {
        const name = `api-${randomString(4)}`
        const deployConfig = makeAlternativeApiDeployConfig(name)

        deployConfig.timeout = 5
        deployConfig.spec.atomic = true
        deployConfig.spec.values = {
          ...deployConfig.spec.values,
          args: ["/bin/sh", "-c", "echo 'hello' && exit 1"],
        }

        garden.addAction(deployConfig)

        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const action = graph.getDeploy(name) as HelmDeployAction
        const resolvedAction = await garden.resolveAction({
          action,
          log: garden.log,
          graph,
        })
        const actionLog = createActionLog({
          log: garden.log,
          actionName: resolvedAction.name,
          actionKind: resolvedAction.kind,
        })
        const releaseName = getReleaseName(resolvedAction)

        await expectError(
          () =>
            helmDeploy({
              ctx,
              log: actionLog,
              action: resolvedAction,
              force: false,
            }),
          (err) => {
            const message = stripAnsi(err.message)
            expect(err).to.be.instanceOf(ChildProcessError)
            expect(message).to.include(`release ${releaseName} failed`)
            expect(message).to.include(`due to atomic being set`)
          }
        )
      })
    })

    // TODO: this tests fail if we use clean action setup like in the tests above
    context("waitForUnhealthyResources=true", () => {
      it("should include K8s events and Pod logs with errors", async () => {
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        const action = graph.getDeploy("api") as HelmDeployAction
        action._config.timeout = 5
        action._config.spec.waitForUnhealthyResources = true
        action._config.spec.values = {
          ...action._config.spec.values,
          args: ["/bin/sh", "-c", "echo 'hello' && exit 1"],
        }
        const resolvedAction = await garden.resolveAction<HelmDeployAction>({
          action,
          log: garden.log,
          graph,
        })
        const actionLog = createActionLog({
          log: garden.log,
          actionName: resolvedAction.name,
          actionKind: resolvedAction.kind,
        })

        const releaseName = getReleaseName(resolvedAction)
        await expectError(
          () =>
            helmDeploy({
              ctx,
              log: actionLog,
              action: resolvedAction,
              force: false,
            }),
          (err) => {
            const message = stripAnsi(err.message)
            expect(message).to.include(`Latest events from Deployment ${releaseName}`)
            expect(message).to.include(`BackOff`)
            expect(message).to.include(`Latest logs from failed containers in each Pod in Deployment ${releaseName}`)
            expect(message).to.match(/api-release-.+\/api: hello/)
          }
        )
      })
      it("should NOT fail fast if one of the resources is unhealthy but wait for the Helm command to complete", async () => {
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        const action = graph.getDeploy("api") as HelmDeployAction
        action._config.timeout = 5
        action._config.spec.waitForUnhealthyResources = true
        action._config.spec.values = {
          ...action._config.spec.values,
          args: ["/bin/sh", "-c", "echo 'hello' && exit 1"],
        }
        const resolvedAction = await garden.resolveAction<HelmDeployAction>({
          action,
          log: garden.log,
          graph,
        })
        const actionLog = createActionLog({
          log: garden.log,
          actionName: resolvedAction.name,
          actionKind: resolvedAction.kind,
        })

        await expectError(
          () =>
            helmDeploy({
              ctx,
              log: actionLog,
              action: resolvedAction,
              force: false,
            }),
          (err) => {
            const message = stripAnsi(err.message)
            expect(err).to.be.instanceOf(ChildProcessError)
            expect(message).to.include(`Error: UPGRADE FAILED`)
          }
        )
      })
    })
  })
})
