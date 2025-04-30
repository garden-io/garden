/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesResourceConfig, KubernetesResourceSpec } from "../config.js"
import type {
  ContainerBuildAction,
  ContainerResourcesSpec,
  ContainerRuntimeAction,
  LegacyServiceLimitSpec,
} from "../../container/moduleConfig.js"
import type { V1ResourceRequirements, V1SecurityContext } from "@kubernetes/client-node"
import { ConfigurationError } from "../../../exceptions.js"
import type { Resolved } from "../../../actions/types.js"
import { kilobytesToString, megabytesToString, millicpuToString } from "../util.js"
import { deline, naturalList } from "../../../util/string.js"
import { styles } from "../../../logger/styles.js"

export function getDeployedImageId(action: Resolved<ContainerRuntimeAction>): string {
  const explicitImage = action.getSpec().image
  const build = action.getResolvedBuildAction<Resolved<ContainerBuildAction>>()

  // if there is a build, we had a configured dockerfile and should use that image
  if (build) {
    return build.getOutput("deployment-image-id")
  } else if (explicitImage) {
    return explicitImage
  } else {
    throw new ConfigurationError({
      message: `${action.longDescription()} specifies neither a \`build\` nor \`spec.image\``,
    })
  }
}

export function getResourceRequirements(resources: ContainerResourcesSpec): V1ResourceRequirements {
  const maxCpu = resources.cpu.max
  const maxMemory = resources.memory.max

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

/**
 * TODO(0.15): remove this
 * @param resources the resource limits defined via new config syntax
 * @param limits the resource limits defined via old config syntax
 */
export function resolveResourceLimits(
  resources: ContainerResourcesSpec,
  limits?: LegacyServiceLimitSpec
): { resolvedResources: ContainerResourcesSpec; warning: string | undefined } {
  const maxCpu = limits?.cpu || resources.cpu.max
  const maxMemory = limits?.memory || resources.memory.max

  const resolvedResources = {
    cpu: {
      min: resources.cpu.min,
      max: maxCpu,
    },
    memory: {
      min: resources.memory.min,
      max: maxMemory,
    },
  }

  const conflicts: ("memory" | "cpu")[] = []
  if (limits) {
    if (resources.cpu.max && limits.cpu) {
      conflicts.push("cpu")
    }
    if (resources.memory.max && limits.memory) {
      conflicts.push("memory")
    }
  }

  if (conflicts.length === 0) {
    return { resolvedResources, warning: undefined }
  }

  const legacyConfigFields: string[] = []
  const newConfigFields: string[] = []
  for (const conflict of conflicts) {
    legacyConfigFields.push(styles.highlight(`spec.limits.${conflict}`))
    newConfigFields.push(styles.highlight(`spec.${conflict}.max`))
  }

  const warning = deline`
      You have specified both ${naturalList(newConfigFields)} and ${styles.bold("deprecated")} ${naturalList(legacyConfigFields)}
      in your action config.

      ${styles.bold(`Garden will use the values defined in the deprecated ${styles.highlight("spec.limits")}!!!`)}.
      Please use only ${styles.highlight("spec.cpu")} and ${styles.highlight("spec.memory")} fields in your action configuration.`

  return { resolvedResources, warning }
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
  const stringify = (r: KubernetesResourceConfig) => ({
    cpu: millicpuToString(r.cpu),
    memory: megabytesToString(r.memory),
    ...(r.ephemeralStorage ? { "ephemeral-storage": megabytesToString(r.ephemeralStorage) } : {}),
  })

  return {
    limits: stringify(resources.limits),
    requests: stringify(resources.requests),
  }
}
