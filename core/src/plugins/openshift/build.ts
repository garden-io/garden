/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeepPrimitiveMap } from "@garden-io/platform-api-types"
import { BuildActionExtension } from "../../plugin/action-types"
import { ContainerBuildAction } from "../container/config"
import { ContainerBuildMode, KubernetesProvider } from "../kubernetes/config"
import { k8sGetContainerBuildActionOutputs } from "../kubernetes/container/handlers"
import { k8sPublishContainerBuild } from "../kubernetes/container/publish"
import { BuildHandler, BuildStatusHandler } from "../kubernetes/container/build/common"
import { getLocalBuildStatus, localBuild } from "../kubernetes/container/build/local"
import { getKanikoBuildStatus, kanikoBuild } from "../kubernetes/container/build/kaniko"
import { NotImplementedError } from "../../exceptions"

export const openshiftContainerBuildExtension = (): BuildActionExtension<ContainerBuildAction> => ({
  name: "container",
  handlers: {
    async getOutputs({ ctx, action }) {
      const provider = ctx.provider as KubernetesProvider
      return {
        outputs: k8sGetContainerBuildActionOutputs({ action, provider }) as unknown as DeepPrimitiveMap,
      }
    },

    build: async (params) => {
      const { ctx } = params

      const provider = <KubernetesProvider>ctx.provider
      const buildMode = provider.config.buildMode || "local-docker"
      const handler = buildHandlers[buildMode]

      return handler(params)
    },

    getStatus: async (params) => {
      const { ctx } = params
      const provider = <KubernetesProvider>ctx.provider

      const buildMode = provider.config.buildMode || "local-docker"
      const handler = buildStatusHandlers[buildMode]
      return handler(params)
    },

    publish: k8sPublishContainerBuild,
  },
})

const unimplemented = () => {
  throw new NotImplementedError({ message: "Unimplemented handler called in OpenShift Build" })
}

const buildStatusHandlers: { [mode in ContainerBuildMode]: BuildStatusHandler } = {
  "local-docker": getLocalBuildStatus,
  "cluster-buildkit": unimplemented,
  "kaniko": getKanikoBuildStatus,
}

const buildHandlers: { [mode in ContainerBuildMode]: BuildHandler } = {
  "local-docker": localBuild,
  "cluster-buildkit": unimplemented,
  "kaniko": kanikoBuild,
}
