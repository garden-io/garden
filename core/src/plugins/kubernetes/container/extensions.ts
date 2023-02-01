/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeepPrimitiveMap } from "../../../config/common"
import {
  BuildActionExtension,
  DeployActionExtension,
  RunActionExtension,
  TestActionExtension,
} from "../../../plugin/action-types"
import {
  ContainerBuildAction,
  ContainerDeployAction,
  ContainerRunAction,
  ContainerTestAction,
} from "../../container/config"
import { ContainerBuildMode, KubernetesProvider } from "../config"
import { getPortForwardHandler } from "../port-forward"
import { k8sGetRunResult } from "../run-results"
import { k8sGetTestResult } from "../test-results"
import { getBuildkitBuildStatus, buildkitBuildHandler } from "./build/buildkit"
import { BuildStatusHandler, BuildHandler } from "./build/common"
import { getKanikoBuildStatus, kanikoBuild } from "./build/kaniko"
import { getLocalBuildStatus, localBuild } from "./build/local"
import { deleteContainerDeploy, k8sContainerDeploy } from "./deployment"
import { execInContainer } from "./exec"
import { k8sGetContainerBuildActionOutputs, validateDeploySpec } from "./handlers"
import { k8sGetContainerDeployLogs } from "./logs"
import { k8sPublishContainerBuild } from "./publish"
import { k8sContainerRun } from "./run"
import { k8sGetContainerDeployStatus } from "./status"
import { k8sContainerTest } from "./test"

export const k8sContainerBuildExtension = (): BuildActionExtension<ContainerBuildAction> => ({
  name: "container",
  handlers: {
    async getOutputs({ ctx, action }) {
      const provider = ctx.provider as KubernetesProvider
      // TODO-G2B: figure out why this cast is needed here
      return {
        outputs: (k8sGetContainerBuildActionOutputs({ action, provider }) as unknown) as DeepPrimitiveMap,
      }
    },

    build: async (params) => {
      const { ctx } = params

      const provider = <KubernetesProvider>ctx.provider
      const handler = buildHandlers[provider.config.buildMode]

      return handler(params)
    },

    getStatus: async (params) => {
      const { ctx } = params
      const provider = <KubernetesProvider>ctx.provider

      const handler = buildStatusHandlers[provider.config.buildMode]
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
    getPortForward: async (params) => getPortForwardHandler({ ...params, namespace: undefined }),
    getStatus: k8sGetContainerDeployStatus,
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
  },
})

export const k8sContainerTestExtension = (): TestActionExtension<ContainerTestAction> => ({
  name: "container",
  handlers: {
    run: k8sContainerTest,
    getResult: k8sGetTestResult,
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
