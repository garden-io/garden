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
import { generateTestNamespace } from "../../../../helpers.js"
import { deleteHelmDeploy, helmDeploy } from "../../../../../../src/plugins/kubernetes/helm/deployment.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config.js"
import {
  gardenCloudAECPauseAnnotation,
  getHelmGardenMetadataConfigMapData,
  getReleaseStatus,
  getRenderedResources,
} from "../../../../../../src/plugins/kubernetes/helm/status.js"
import {
  getReleaseName,
  prepareManifests,
  prepareTemplates,
  filterManifests,
} from "../../../../../../src/plugins/kubernetes/helm/common.js"
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
import { checkResourceStatuses, waitForResources } from "../../../../../../src/plugins/kubernetes/status/status.js"
import { helm } from "../../../../../../src/plugins/kubernetes/helm/helm-cli.js"

describe("helmDeploy", () => {
  let garden: TestGarden
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext
  let graph: ConfigGraph
  const createdNamespaces: string[] = []

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

      if (createdNamespaces.length > 0) {
        const api = await KubeApi.factory(garden.log, ctx, provider)
        for (const namespace of createdNamespaces) {
          // Don't await - let Kubernetes clean up in the background. We generate unique namespace names in this suite, so this is safe.
          api.core.deleteNamespace({ name: namespace }).catch(() => {
            // Ignore errors if namespace doesn't exist or already deleted
          })
        }
      }

      if (garden) {
        garden.close()
      }
    } catch {}
  })

  /**
   * Wait for a Helm release to reach a stable state (deployed or failed).
   * This helps avoid race conditions with Helm's locking mechanism when doing
   * multiple deployments of the same release in quick succession.
   */
  async function waitForReleaseStable(
    releaseName: string,
    namespace: string,
    timeoutMs: number = 30000
  ): Promise<void> {
    const startTime = Date.now()
    const stableStatuses = ["deployed", "failed", "uninstalled", "superseded"]

    while (Date.now() - startTime < timeoutMs) {
      try {
        const statusJson = await helm({
          ctx,
          log: garden.log,
          namespace,
          args: ["status", releaseName, "--output", "json"],
          emitLogEvents: false,
        })
        const status = JSON.parse(statusJson)

        if (status?.info?.status && stableStatuses.includes(status.info.status)) {
          return
        }
      } catch (error) {
        // Release might not exist yet or be in transition, continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error(`Timeout waiting for Helm release '${releaseName}' to reach stable state after ${timeoutMs}ms`)
  }

  context("normal behaviour", () => {
    for (const deployName of ["api", "oci-url", "oci-url-with-version"]) {
      it(`should deploy chart ${deployName} successfully`, async () => {
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        // Pick the raw action from the graph so we can set a per-test namespace **before** resolution
        const rawAction = graph.getDeploy(deployName) as HelmDeployAction
        const testNamespace = generateTestNamespace()
        createdNamespaces.push(testNamespace)
        rawAction._config.spec.namespace = testNamespace

        // Use a unique hostname for api deploy to avoid conflicts with other tests
        if (deployName === "api") {
          const uniqueHostname = `api-${randomString(4)}.local.demo.garden`
          rawAction._config.spec.values = {
            ...rawAction._config.spec.values,
            ingress: {
              enabled: true,
              paths: ["/"],
              hosts: [uniqueHostname],
            },
          }
        }

        const action = await garden.resolveAction<HelmDeployAction>({
          action: rawAction,
          log: garden.log,
          graph,
        })
        const actionLog = createActionLog({ log: garden.log, action })

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
        expect(namespaceStatus!.namespaceName).to.eql(testNamespace)

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
          version: action.versionString(actionLog),
          mode: "default",
        })
      })
    }

    it("should deploy a chart from a converted Helm module referencing a container module version in its image tag", async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      // Set namespace before resolution
      const rawAction = graph.getDeploy("api-module") as HelmDeployAction
      const testNamespace = generateTestNamespace()
      createdNamespaces.push(testNamespace)
      rawAction._config.spec.namespace = testNamespace
      // Use a unique hostname to avoid conflicts with other tests
      const uniqueHostname = `api-module-${randomString(4)}.local.demo.garden`
      rawAction._config.spec.values = {
        ...rawAction._config.spec.values,
        ingress: {
          enabled: true,
          paths: ["/api-module/"],
          hosts: [uniqueHostname],
        },
      }

      const action = await garden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({ log: garden.log, action })

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
      expect(namespaceStatus!.namespaceName).to.eql(testNamespace)

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
        version: action.versionString(actionLog),
        mode: "default",
      })
    })

    it("should deploy a chart with sync enabled", async () => {
      graph = await garden.getConfigGraph({
        log: garden.log,
        emit: false,
        actionModes: { sync: ["deploy.api"] }, // <-----
      })
      // Deploy into a per-test namespace to avoid interfering with other tests
      const rawAction = graph.getDeploy("api") as HelmDeployAction
      const testNamespace = generateTestNamespace()
      createdNamespaces.push(testNamespace)
      rawAction._config.spec.namespace = testNamespace
      // Use a unique hostname to avoid conflicts with other tests
      const uniqueHostname = `api-${randomString(4)}.local.demo.garden`
      rawAction._config.spec.values = {
        ...rawAction._config.spec.values,
        ingress: {
          enabled: true,
          paths: ["/"],
          hosts: [uniqueHostname],
        },
      }
      const action = await garden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({ log: garden.log, action })

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
        version: action.versionString(actionLog),
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
      const actionLog = createActionLog({ log: garden.log, action })

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
      const rawAction = graph.getDeploy("api") as HelmDeployAction
      // Use a unique hostname to avoid conflicts with other tests
      const uniqueHostname = `api-${randomString(4)}.local.demo.garden`
      rawAction._config.spec.values = {
        ...rawAction._config.spec.values,
        ingress: {
          enabled: true,
          paths: ["/"],
          hosts: [uniqueHostname],
        },
      }
      const action = await garden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({ log: garden.log, action })
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
      const rawAction = graph.getDeploy("api") as HelmDeployAction
      // Use a unique hostname to avoid conflicts with other tests
      const uniqueHostname = `api-${randomString(4)}.local.demo.garden`
      rawAction._config.spec.values = {
        ...rawAction._config.spec.values,
        ingress: {
          enabled: true,
          paths: ["/"],
          hosts: [uniqueHostname],
        },
      }
      const action = await garden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({ log: garden.log, action })
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

      const rawAction = graph.getDeploy("api") as HelmDeployAction
      // Use a unique hostname to avoid conflicts with other tests
      const uniqueHostname = `api-${randomString(4)}.local.demo.garden`
      rawAction._config.spec.values = {
        ...rawAction._config.spec.values,
        ingress: {
          enabled: true,
          paths: ["/"],
          hosts: [uniqueHostname],
        },
      }
      const action = await garden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({
        log: gardenWithCloudApi.log,
        action,
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
        version: action.versionString(actionLog),
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
      const namespace = await getActionNamespace({
        ctx: ctxWithCloudApi,
        log: gardenWithCloudApi.log,
        action,
        provider: ctxWithCloudApi.provider,
      })

      const apiDeployment = (
        await Promise.all(
          workloads.map((workload) => api.readBySpec({ log: gardenWithCloudApi.log, namespace, manifest: workload }))
        )
      )[0]
      const existingAnnotations = apiDeployment.metadata.annotations
      apiDeployment.metadata.annotations = {
        ...existingAnnotations,
        [gardenCloudAECPauseAnnotation]: "paused",
      }

      await api.apps.patchNamespacedDeployment({
        name: apiDeployment.metadata?.name,
        namespace,
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

      const rawAction = graph.getDeploy("api") as HelmDeployAction
      // Use a unique hostname to avoid conflicts with other tests
      const uniqueHostname = `api-${randomString(4)}.local.demo.garden`
      rawAction._config.spec.values = {
        ...rawAction._config.spec.values,
        ingress: {
          enabled: true,
          paths: ["/"],
          hosts: [uniqueHostname],
        },
      }
      const resolvedAction = await garden.resolveAction({
        action: rawAction,
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({
        log: garden.log,
        action: resolvedAction,
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
    function makeAlternativeApiDeployConfig(name: string, hostname?: string): HelmDeployConfig {
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
              hosts: [hostname || "api.local.demo.garden"],
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
        action: resolvedAction,
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
        action: resolvedAction,
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
        const uniqueHostname = `${name}.local.demo.garden`
        const deployConfig = makeAlternativeApiDeployConfig(name, uniqueHostname)

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
          action: resolvedAction,
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
          action: resolvedAction,
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
          action: resolvedAction,
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

      it("should not fail early when replacing an unhealthy Deployment with a healthy one", async () => {
        // Use a unique namespace for this test to avoid Helm lock conflicts
        const testNamespace = generateTestNamespace()
        createdNamespaces.push(testNamespace)

        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        // Step 1: Deploy an unhealthy version
        const unhealthyAction = graph.getDeploy("api") as HelmDeployAction
        unhealthyAction._config.timeout = 30
        unhealthyAction._config.spec.waitForUnhealthyResources = false // Enable fail-fast
        unhealthyAction._config.spec.atomic = false // Required for fail-fast
        unhealthyAction._config.spec.namespace = testNamespace // Use test-specific namespace
        unhealthyAction._config.spec.values = {
          ...unhealthyAction._config.spec.values,
          args: ["/bin/sh", "-c", "exit 1"], // Causes immediate failure
          ingress: { enabled: false }, // Disable ingress to avoid conflicts with other tests
        }

        const resolvedUnhealthyAction = await garden.resolveAction<HelmDeployAction>({
          action: unhealthyAction,
          log: garden.log,
          graph,
        })
        const unhealthyActionLog = createActionLog({
          log: garden.log,
          action: resolvedUnhealthyAction,
        })

        // Deploy the unhealthy version - expect it to fail
        await expectError(
          () =>
            helmDeploy({
              ctx,
              log: unhealthyActionLog,
              action: resolvedUnhealthyAction,
              force: false,
            }),
          (err) => {
            // Verify it failed as expected
            expect(err).to.exist
          }
        )

        // Wait for Helm to release its lock after the failed deployment
        const releaseName = getReleaseName(resolvedUnhealthyAction)
        const releaseNamespace = await getActionNamespace({
          ctx,
          log: garden.log,
          action: resolvedUnhealthyAction,
          provider,
        })
        await waitForReleaseStable(releaseName, releaseNamespace)

        // Step 2: Prepare manifests for the healthy deployment
        const namespace = await getActionNamespace({
          ctx,
          log: garden.log,
          action: resolvedUnhealthyAction,
          provider,
        })
        const api = await KubeApi.factory(garden.log, ctx, provider)

        // Get preparedTemplates and manifests for verification
        const preparedTemplates = await prepareTemplates({
          ctx,
          action: resolvedUnhealthyAction,
          log: garden.log,
        })
        const preparedManifests = await prepareManifests({
          ctx,
          log: garden.log,
          action: resolvedUnhealthyAction,
          ...preparedTemplates,
        })
        const manifests = await filterManifests(preparedManifests)

        // Step 3: Verify the Deployment is unhealthy
        const initialStatuses = await checkResourceStatuses({
          api,
          namespace,
          waitForJobs: false,
          manifests,
          log: garden.log,
        })

        const deploymentStatus = initialStatuses.find(
          (s) =>
            s.resource.kind === "Deployment" && s.resource.metadata.name === getReleaseName(resolvedUnhealthyAction)
        )
        expect(deploymentStatus).to.exist
        expect(deploymentStatus!.state).to.equal("unhealthy")
        expect(isWorkload(deploymentStatus!.resource)).to.be.true

        const initialGeneration = deploymentStatus!.resource.metadata.generation

        // Step 4: Deploy the healthy version
        const healthyAction = graph.getDeploy("api") as HelmDeployAction
        healthyAction._config.timeout = 30
        healthyAction._config.spec.waitForUnhealthyResources = false // Keep fail-fast enabled
        healthyAction._config.spec.atomic = false
        healthyAction._config.spec.namespace = testNamespace // Use the same test-specific namespace
        // Remove the failing args - use default behavior (just omit args from values)
        const { args: _args, ...restValues } = healthyAction._config.spec.values || {}
        healthyAction._config.spec.values = {
          ...restValues,
          ingress: { enabled: false }, // Disable ingress to avoid conflicts with other tests
        }

        const resolvedHealthyAction = await garden.resolveAction<HelmDeployAction>({
          action: healthyAction,
          log: garden.log,
          graph,
        })
        const healthyActionLog = createActionLog({
          log: garden.log,
          action: resolvedHealthyAction,
        })

        // This should succeed - the key assertion of the test
        const deployResult = await helmDeploy({
          ctx,
          log: healthyActionLog,
          action: resolvedHealthyAction,
          force: false,
        })

        // Step 5: Verify success
        expect(deployResult.state).to.equal("ready")
        expect(deployResult.detail).to.exist
        expect(deployResult.detail!.detail.helmCommandSuccessful).to.be.true

        // Verify the deployment is now healthy
        const finalStatuses = await checkResourceStatuses({
          api,
          namespace,
          waitForJobs: false,
          manifests,
          log: garden.log,
        })

        const finalDeploymentStatus = finalStatuses.find(
          (s) => s.resource.kind === "Deployment" && s.resource.metadata.name === getReleaseName(resolvedHealthyAction)
        )
        expect(finalDeploymentStatus).to.exist
        expect(finalDeploymentStatus!.state).to.equal("ready")

        // Verify generation incremented (proving a new deployment happened)
        expect(finalDeploymentStatus!.resource.metadata.generation).to.be.greaterThan(initialGeneration!)
      })

      it("should correctly detect spec changes using specChanged helper", async () => {
        // Use a unique action name to avoid conflicts with other tests
        const name = `api-${randomString(4)}`
        const deployConfig = makeAlternativeApiDeployConfig(name)
        deployConfig.spec.waitForUnhealthyResources = false
        deployConfig.spec.atomic = false
        // Disable ingress to avoid conflicts with other tests
        deployConfig.spec.values.ingress = { enabled: false }

        garden.addAction(deployConfig)

        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        // Step 1: Deploy the initial version
        const action = graph.getDeploy(name) as HelmDeployAction
        const resolvedAction = await garden.resolveAction<HelmDeployAction>({
          action,
          log: garden.log,
          graph,
        })
        const actionLog = createActionLog({
          log: garden.log,
          action: resolvedAction,
        })

        await helmDeploy({
          ctx,
          log: actionLog,
          action: resolvedAction,
          force: false,
        })

        // Step 2: Get the deployed resources
        const api = await KubeApi.factory(garden.log, ctx, provider)
        const namespace = await getActionNamespace({
          ctx,
          log: garden.log,
          action: resolvedAction,
          provider,
        })
        const releaseName = getReleaseName(resolvedAction)

        // Get the manifest templates
        const preparedTemplates = await prepareTemplates({
          ctx,
          action: resolvedAction,
          log: garden.log,
        })
        const preparedManifests = await prepareManifests({
          ctx,
          log: garden.log,
          action: resolvedAction,
          ...preparedTemplates,
        })
        const manifests = await filterManifests(preparedManifests)

        // Wait for resources to be ready to ensure Kubernetes has fully processed the deployment
        await waitForResources({
          namespace,
          ctx,
          provider,
          logContext: "Test",
          resources: manifests,
          log: garden.log,
          timeoutSec: 300,
          waitForJobs: false,
        })

        // Get deployed resources
        const deployedResources = await Promise.all(
          manifests.map((manifest) => api.readBySpec({ log: garden.log, namespace, manifest }).catch(() => null))
        )

        // Step 3: Test no-op deployment - same manifests should not show spec changes
        const { specChanged } = await import("../../../../../../src/plugins/kubernetes/status/status.js")

        const unchangedChecks = manifests
          .map((manifest, idx) => {
            const deployed = deployedResources[idx]
            if (!deployed) return null

            const hasChanged = specChanged({ manifest, deployedResource: deployed })

            return {
              kind: manifest.kind,
              name: manifest.metadata.name,
              hasChanged,
            }
          })
          .filter((check) => check !== null)

        // All unchanged checks should return false (no spec changes)
        const anyUnchangedFailed = unchangedChecks.some((check) => check!.hasChanged)
        if (anyUnchangedFailed) {
          const failedChecks = unchangedChecks.filter((check) => check!.hasChanged)
          throw new Error(
            `specChanged incorrectly detected changes for unchanged resources: ${failedChecks.map((c) => `${c!.kind}/${c!.name}`).join(", ")}`
          )
        }

        // Step 4: Modify the spec (change replica count)
        const modifiedAction = graph.getDeploy(name) as HelmDeployAction
        modifiedAction._config.spec.waitForUnhealthyResources = false
        modifiedAction._config.spec.atomic = false
        // Change the replica count to trigger a spec change
        modifiedAction._config.spec.values = {
          ...modifiedAction._config.spec.values,
          replicaCount: 2, // Change replica count instead of image tag to avoid ImagePullBackOff
        }

        const resolvedModifiedAction = await garden.resolveAction<HelmDeployAction>({
          action: modifiedAction,
          log: garden.log,
          graph,
        })
        const modifiedActionLog = createActionLog({
          log: garden.log,
          action: resolvedModifiedAction,
        })

        // Get modified manifest templates
        const modifiedPreparedTemplates = await prepareTemplates({
          ctx,
          action: resolvedModifiedAction,
          log: garden.log,
        })
        const modifiedPreparedManifests = await prepareManifests({
          ctx,
          log: garden.log,
          action: resolvedModifiedAction,
          ...modifiedPreparedTemplates,
        })
        const modifiedManifests = await filterManifests(modifiedPreparedManifests)

        // Step 5: Test modified deployment - should detect spec changes for Deployment
        const changedChecks = modifiedManifests
          .map((manifest, idx) => {
            const deployed = deployedResources[idx]
            if (!deployed) return null
            const hasChanged = specChanged({ manifest, deployedResource: deployed })
            return {
              kind: manifest.kind,
              name: manifest.metadata.name,
              hasChanged,
            }
          })
          .filter((check) => check !== null)

        // Find the Deployment - it should have spec changes
        const deploymentCheck = changedChecks.find((check) => check!.kind === "Deployment")
        expect(deploymentCheck).to.exist
        expect(deploymentCheck!.hasChanged).to.be.true

        // Step 6: Deploy the modified version
        await helmDeploy({
          ctx,
          log: modifiedActionLog,
          action: resolvedModifiedAction,
          force: false,
        })

        // Step 7: Verify the deployment succeeded and generation incremented
        const finalStatuses = await checkResourceStatuses({
          api,
          namespace,
          waitForJobs: false,
          manifests: modifiedManifests,
          log: garden.log,
        })

        const finalDeploymentStatus = finalStatuses.find(
          (s) => s.resource.kind === "Deployment" && s.resource.metadata.name === releaseName
        )
        expect(finalDeploymentStatus).to.exist
        expect(finalDeploymentStatus!.state).to.equal("ready")

        // Clean up the deployment to avoid conflicts with other tests
        await deleteHelmDeploy({ ctx, log: actionLog, action: resolvedAction })
      })

      it("should wait for workloads with changed specs before checking health", async () => {
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        // Step 1: Deploy the initial healthy version
        const action = graph.getDeploy("api") as HelmDeployAction
        action._config.timeout = 300
        action._config.spec.waitForUnhealthyResources = true // Enable spec-change waiting
        action._config.spec.atomic = false
        // Ensure a known baseline replica count to avoid interference from other tests
        action._config.spec.values = {
          ...action._config.spec.values,
          replicaCount: 1,
          ingress: { enabled: false }, // Disable ingress to avoid conflicts with other tests
        }

        const resolvedAction = await garden.resolveAction<HelmDeployAction>({
          action,
          log: garden.log,
          graph,
        })
        const actionLog = createActionLog({
          log: garden.log,
          action: resolvedAction,
        })

        await helmDeploy({
          ctx,
          log: actionLog,
          action: resolvedAction,
          force: false,
        })

        // Step 2: Get the initial deployed state
        const api = await KubeApi.factory(garden.log, ctx, provider)
        const namespace = await getActionNamespace({
          ctx,
          log: garden.log,
          action: resolvedAction,
          provider,
        })
        const releaseName = getReleaseName(resolvedAction)

        // Get initial status
        const initialStatuses = await checkResourceStatuses({
          api,
          namespace,
          waitForJobs: false,
          manifests: await filterManifests(
            await prepareManifests({
              ctx,
              log: garden.log,
              action: resolvedAction,
              ...(await prepareTemplates({ ctx, action: resolvedAction, log: garden.log })),
            })
          ),
          log: garden.log,
        })

        const initialDeploymentStatus = initialStatuses.find(
          (s) => s.resource.kind === "Deployment" && s.resource.metadata.name === releaseName
        )
        expect(initialDeploymentStatus).to.exist
        expect(initialDeploymentStatus!.state).to.equal("ready")
        const initialGeneration = initialDeploymentStatus!.resource.metadata.generation
        expect(initialGeneration).to.be.greaterThan(0)

        // Step 3: Deploy a modified version with changed spec (change replicas to trigger spec change)
        const modifiedAction = graph.getDeploy("api") as HelmDeployAction
        modifiedAction._config.timeout = 300
        modifiedAction._config.spec.waitForUnhealthyResources = true
        modifiedAction._config.spec.atomic = false
        modifiedAction._config.spec.values = {
          ...modifiedAction._config.spec.values,
          replicaCount: 2, // Change replica count to trigger spec change
          ingress: { enabled: false }, // Disable ingress to avoid conflicts with other tests
        }

        const resolvedModifiedAction = await garden.resolveAction<HelmDeployAction>({
          action: modifiedAction,
          log: garden.log,
          graph,
        })
        const modifiedActionLog = createActionLog({
          log: garden.log,
          action: resolvedModifiedAction,
        })

        // Deploy with spec changes - should wait for generation increment before checking health
        const startTime = Date.now()
        await helmDeploy({
          ctx,
          log: modifiedActionLog,
          action: resolvedModifiedAction,
          force: false,
        })
        const deployTime = Date.now() - startTime

        // Step 4: Verify the deployment waited appropriately
        // The deployment should take some time (waiting for generation increment)
        // but should succeed because we're deploying a healthy version
        expect(deployTime).to.be.greaterThan(100) // At least 100ms (showing it waited for generation increment)

        // Step 5: Verify the deployment succeeded and generation incremented
        const finalStatuses = await checkResourceStatuses({
          api,
          namespace,
          waitForJobs: false,
          manifests: await filterManifests(
            await prepareManifests({
              ctx,
              log: garden.log,
              action: resolvedModifiedAction,
              ...(await prepareTemplates({ ctx, action: resolvedModifiedAction, log: garden.log })),
            })
          ),
          log: garden.log,
        })

        const finalDeploymentStatus = finalStatuses.find(
          (s) => s.resource.kind === "Deployment" && s.resource.metadata.name === releaseName
        )
        expect(finalDeploymentStatus).to.exist
        expect(finalDeploymentStatus!.state).to.equal("ready")

        // Verify generation incremented (proving the spec change was detected and deployment updated)
        const finalGeneration = finalDeploymentStatus!.resource.metadata.generation
        expect(finalGeneration).to.be.greaterThan(initialGeneration!)
      })
    })
  })
})
