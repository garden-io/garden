/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CloudBuilderAvailabilityV2 } from "../../../cloud/api-legacy/api.js"
import type { DeepPrimitiveMap } from "../../../config/common.js"
import type {
  BuildActionExtension,
  DeployActionExtension,
  RunActionExtension,
  TestActionExtension,
} from "../../../plugin/action-types.js"
import { cloudBuilder } from "../../container/cloudbuilder.js"
import type {
  ContainerBuildAction,
  ContainerDeployAction,
  ContainerRunAction,
  ContainerTestAction,
} from "../../container/config.js"
import {
  CONTAINER_BUILD_CONCURRENCY_LIMIT_CLOUD_BUILDER,
  CONTAINER_BUILD_CONCURRENCY_LIMIT_LOCAL,
  CONTAINER_STATUS_CONCURRENCY_LIMIT,
} from "../../container/container.js"
import type { ContainerBuildMode, KubernetesPluginContext, KubernetesProvider } from "../config.js"
import {
  CONTAINER_BUILD_CONCURRENCY_LIMIT_REMOTE_KUBERNETES,
  CONTAINER_STATUS_CONCURRENCY_LIMIT_REMOTE_KUBERNETES,
} from "../kubernetes.js"
import { getPortForwardHandler } from "../port-forward.js"
import { k8sGetRunResult } from "../run-results.js"
import { k8sGetTestResult } from "../test-results.js"
import { getBuildkitBuildStatus, buildkitBuildHandler } from "./build/buildkit.js"
import type { BuildStatusHandler, BuildHandler } from "./build/common.js"
import { getKanikoBuildStatus, kanikoBuild } from "./build/kaniko.js"
import { getLocalBuildStatus, localBuild } from "./build/local.js"
import { deleteContainerDeploy, k8sContainerDeploy, planContainerDeploy } from "./deployment.js"
import { execInContainer } from "./exec.js"
import { k8sGetContainerBuildActionOutputs, validateDeploySpec } from "./handlers.js"
import { k8sGetContainerDeployLogs } from "./logs.js"
import { k8sPublishContainerBuild } from "./publish.js"
import { k8sContainerRun, k8sContainerRunPlan } from "./run.js"
import { k8sGetContainerDeployStatus } from "./status.js"
import { k8sContainerGetSyncStatus, k8sContainerStartSync, k8sContainerStopSync } from "./sync.js"
import { k8sContainerTest, k8sContainerTestPlan } from "./test.js"

async function getBuildMode({
  ctx,
  availability,
}: {
  ctx: KubernetesPluginContext
  availability: CloudBuilderAvailabilityV2
}): Promise<ContainerBuildMode> {
  if (availability.available) {
    // Local build mode knows how to build using Container Builder
    return "local-docker"
  } else {
    const provider = ctx.provider
    return provider.config.buildMode
  }
}

export const k8sContainerBuildExtension = (): BuildActionExtension<ContainerBuildAction> => ({
  name: "container",
  handlers: {
    async getOutputs({ ctx, action }) {
      const provider = ctx.provider as KubernetesProvider
      // TODO: figure out why this cast is needed here
      return {
        outputs: k8sGetContainerBuildActionOutputs({ action, provider, log: ctx.log }) as unknown as DeepPrimitiveMap,
      }
    },

    validate: async ({ ctx, action }) => {
      const provider = ctx.provider as KubernetesProvider

      // override build task status concurrency
      if (provider.config.deploymentRegistry) {
        action.statusConcurrencyLimit = CONTAINER_STATUS_CONCURRENCY_LIMIT_REMOTE_KUBERNETES
      } else {
        // if there's no deployment registry, we are building locally.
        action.statusConcurrencyLimit = CONTAINER_STATUS_CONCURRENCY_LIMIT
      }

      return {}
    },

    build: async (params) => {
      const { ctx, action } = params

      const availability = await cloudBuilder.getAvailability(ctx, action)
      const buildMode = await getBuildMode({
        ctx,
        availability,
      })
      const handler = buildHandlers[buildMode]

      return handler(params)
    },

    getStatus: async (params) => {
      const { ctx, action } = params
      const provider = ctx.provider as KubernetesProvider

      // override build task execute concurrency
      const availability = await cloudBuilder.getAvailability(ctx, action)
      if (availability.available) {
        action.executeConcurrencyLimit = CONTAINER_BUILD_CONCURRENCY_LIMIT_CLOUD_BUILDER
      } else if (provider.config.buildMode === "local-docker") {
        action.executeConcurrencyLimit = CONTAINER_BUILD_CONCURRENCY_LIMIT_LOCAL
      } else {
        // build mode is remote
        action.executeConcurrencyLimit = CONTAINER_BUILD_CONCURRENCY_LIMIT_REMOTE_KUBERNETES
      }

      const buildMode = await getBuildMode({
        ctx,
        availability,
      })
      const handler = buildStatusHandlers[buildMode]

      return handler(params)
    },

    publish: k8sPublishContainerBuild,
  },
})

export const k8sContainerDeployExtension = (): DeployActionExtension<ContainerDeployAction> => ({
  name: "container",
  handlers: {
    deploy: k8sContainerDeploy,
    delete: deleteContainerDeploy,
    exec: execInContainer,
    getLogs: k8sGetContainerDeployLogs,
    getPortForward: async (params) => {
      return getPortForwardHandler({ ...params, namespace: undefined })
    },
    getStatus: k8sGetContainerDeployStatus,
    plan: planContainerDeploy,

    startSync: k8sContainerStartSync,
    stopSync: k8sContainerStopSync,
    getSyncStatus: k8sContainerGetSyncStatus,

    validate: async ({ ctx, action }) => {
      validateDeploySpec(action.name, <KubernetesProvider>ctx.provider, action.getSpec())
      return {}
    },
  },
})

export const k8sContainerRunExtension = (): RunActionExtension<ContainerRunAction> => ({
  name: "container",
  handlers: {
    run: k8sContainerRun,
    getResult: k8sGetRunResult,
    plan: k8sContainerRunPlan,
  },
})

export const k8sContainerTestExtension = (): TestActionExtension<ContainerTestAction> => ({
  name: "container",
  handlers: {
    run: k8sContainerTest,
    getResult: k8sGetTestResult,
    plan: k8sContainerTestPlan,
  },
})

const buildStatusHandlers: { [mode in ContainerBuildMode]: BuildStatusHandler } = {
  "local-docker": getLocalBuildStatus,
  "cluster-buildkit": getBuildkitBuildStatus,
  "kaniko": getKanikoBuildStatus,
}

const buildHandlers: { [mode in ContainerBuildMode]: BuildHandler } = {
  "local-docker": localBuild,
  "cluster-buildkit": buildkitBuildHandler,
  "kaniko": kanikoBuild,
}
