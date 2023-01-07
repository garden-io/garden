/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "url"
import { getPortForward } from "../port-forward"
import { CLUSTER_REGISTRY_DEPLOYMENT_NAME, CLUSTER_REGISTRY_PORT } from "../constants"
import { LogEntry } from "../../../logger/log-entry"
import { KuberetesResourceConfig, KubernetesPluginContext, KubernetesProvider, KubernetesResourceSpec } from "../config"
import { getSystemNamespace } from "../namespace"
import { got, GotTextOptions } from "../../../util/http"
import {
  ContainerBuildAction,
  ContainerResourcesSpec,
  ContainerRuntimeAction,
  ServiceLimitSpec,
} from "../../container/moduleConfig"
import { V1ResourceRequirements, V1SecurityContext } from "@kubernetes/client-node"
import { ConfigurationError } from "../../../exceptions"
import { Resolved } from "../../../actions/types"
import { containerHelpers } from "../../container/helpers"
import { kilobytesToString, megabytesToString, millicpuToString } from "../util"

export function getDeployedImageId(action: Resolved<ContainerRuntimeAction>, provider: KubernetesProvider): string {
  const explicitImage = action.getSpec().image
  const build = action.getResolvedBuildAction<Resolved<ContainerBuildAction>>()

  if (explicitImage) {
    return explicitImage
  } else if (build) {
    // TODO-G2: we can get this off the BuildAction when static outputs are implemented
    return containerHelpers.getBuildDeploymentImageId(
      build.name,
      undefined,
      build.getFullVersion(),
      provider.config.deploymentRegistry
    )
  } else {
    throw new ConfigurationError(`${action.longDescription()} specifies neither a \`build\` nor \`spec.image\``, {
      config: action.getConfig(),
    })
  }
}

export async function queryRegistry(ctx: KubernetesPluginContext, log: LogEntry, path: string, opts?: GotTextOptions) {
  const registryFwd = await getRegistryPortForward(ctx, log)
  const baseUrl = `http://localhost:${registryFwd.localPort}/v2/`
  const url = resolve(baseUrl, path)

  return got(url, opts)
}

export async function getRegistryPortForward(ctx: KubernetesPluginContext, log: LogEntry) {
  const systemNamespace = await getSystemNamespace(ctx, ctx.provider, log)

  return getPortForward({
    ctx,
    log,
    namespace: systemNamespace,
    targetResource: `Deployment/${CLUSTER_REGISTRY_DEPLOYMENT_NAME}`,
    port: CLUSTER_REGISTRY_PORT,
  })
}

export function getResourceRequirements(
  resources: ContainerResourcesSpec,
  limits?: ServiceLimitSpec
): V1ResourceRequirements {
  const maxCpu = limits?.cpu || resources.cpu.max
  const maxMemory = limits?.memory || resources.memory.max

  const resourceReq: V1ResourceRequirements = {
    requests: {
      cpu: millicpuToString(resources.cpu.min),
      memory: kilobytesToString(resources.memory.min * 1024),
    },
  }
  if (maxMemory || maxCpu) {
    resourceReq.limits = {}
  }
  if (maxMemory) {
    resourceReq.limits!.memory = kilobytesToString(maxMemory * 1024)
  }
  if (maxCpu) {
    resourceReq.limits!.cpu = millicpuToString(maxCpu)
  }

  return resourceReq
}

export function getSecurityContext(
  privileged: boolean | undefined,
  addCapabilities: string[] | undefined,
  dropCapabilities: string[] | undefined
): V1SecurityContext | null {
  if (!privileged && !addCapabilities && !dropCapabilities) {
    return null
  }
  const ctx: V1SecurityContext = {}
  if (privileged) {
    ctx.privileged = privileged
  }
  if (addCapabilities) {
    ctx.capabilities = { add: addCapabilities }
  }
  if (dropCapabilities) {
    ctx.capabilities = { ...(ctx.capabilities || {}), drop: dropCapabilities }
  }
  return ctx
}

export function stringifyResources(resources: KubernetesResourceSpec) {
  const stringify = (r: KuberetesResourceConfig) => ({
    cpu: millicpuToString(r.cpu),
    memory: megabytesToString(r.memory),
    ...(r.ephemeralStorage ? { "ephemeral-storage": megabytesToString(r.ephemeralStorage) } : {}),
  })

  return {
    limits: stringify(resources.limits),
    requests: stringify(resources.requests),
  }
}
