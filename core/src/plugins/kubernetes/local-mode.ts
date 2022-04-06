/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerLocalModeSchema, ContainerService, ContainerServiceSpec, ServicePortSpec } from "../container/config"
import { gardenAnnotationKey } from "../../util/string"
import { set } from "lodash"
import { HotReloadableResource } from "./hot-reload/hot-reload"
import { PrimitiveMap } from "../../config/common"
import { PROXY_CONTAINER_SSH_TUNNEL_PORT, reverseProxyImageName } from "./constants"
import { ConfigurationError } from "../../exceptions"
import { getResourceContainer, prepareEnvVars } from "./util"
import { V1Container } from "@kubernetes/client-node"
import { KubernetesPluginContext } from "./config"
import { LogEntry } from "../../logger/log-entry"
import { getAppNamespace } from "./namespace"
import { getPortForward, getTargetResource } from "./port-forward"
import chalk from "chalk"
import fs from "fs"

export const builtInExcludes = ["/**/*.git", "**/*.garden"]

export const localModeGuideLink = "https://docs.garden.io/guides/..." // todo

interface ConfigureLocalModeParams {
  target: HotReloadableResource
  originalServiceSpec: ContainerServiceSpec
}

export const kubernetesLocalModeSchema = () => containerLocalModeSchema()

function prepareLocalModeEnvVars(originalServiceSpec: ContainerServiceSpec): PrimitiveMap {
  const localModeSpec = originalServiceSpec.localMode!
  if (!localModeSpec) {
    return {}
  }

  // todo: is it a good way to pick up the right port?
  const httpPortSpec = originalServiceSpec.ports.find((portSpec) => portSpec.name === "http")
  if (!httpPortSpec) {
    throw new ConfigurationError(
      `Could not find http port defined for service ${originalServiceSpec.name}`,
      originalServiceSpec.ports
    )
  }

  const proxyContainerSpec = localModeSpec.proxyContainer
  try {
    const publicKey = fs.readFileSync(proxyContainerSpec.publicKeyFilePath).toString("utf-8")

    return {
      APP_PORT: httpPortSpec.containerPort,
      PUBLIC_KEY: publicKey,
      USER_NAME: proxyContainerSpec.username,
    }
  } catch (err) {
    const message = !!err.message ? err.message.toString() : "unknown"
    throw new ConfigurationError(
      `Could not read public key file from path ${proxyContainerSpec.publicKeyFilePath}; cause: ${message}`,
      err
    )
  }
}

function prepareLocalModePorts(originalServiceSpec: ContainerServiceSpec): ServicePortSpec[] {
  if (!originalServiceSpec.localMode) {
    return []
  }

  const hasSshPort = originalServiceSpec.ports.some((portSpec) => portSpec.name === "ssh")
  if (hasSshPort) {
    return []
  }

  return [
    {
      name: "ssh",
      protocol: "TCP",
      containerPort: PROXY_CONTAINER_SSH_TUNNEL_PORT,
      servicePort: PROXY_CONTAINER_SSH_TUNNEL_PORT,
    },
  ]
}

/**
 * Patches the original service spec by adding localMode-specific settings like ports, environment variables,
 * and readiness probe settings.
 * The original service spec which is used to define k8s service
 * in `core/src/plugins/kubernetes/container/deployment.ts`
 *
 * TODO: check if it would be possible to use `workload` instead of `service` in the line
 *       const kubeservices = await createServiceResources(service, namespace, blueGreen)
 *       see the impl of createContainerManifests() in core/src/plugins/kubernetes/container/deployment.ts
 *       It would allow to avoid the same changes in 2 places
 *
 * TODO: Consider configuring service specific part in
 *       core/src/plugins/kubernetes/container/service.ts -> createServiceResources()
 * @param originalServiceSpec the original service spec
 * @param localModeEnvVars the list of localMode-specific environment variables
 * @param localModePorts the list of localMode-specific ports (e.g. ssh port for tunnel setup)
 */
function patchOriginalServiceSpec(
  originalServiceSpec: ContainerServiceSpec,
  localModeEnvVars: PrimitiveMap,
  localModePorts: ServicePortSpec[]
) {
  const hasSshPort = originalServiceSpec.ports.some((portSpec) => portSpec.name === "ssh")
  if (!hasSshPort) {
    originalServiceSpec.ports.push(...localModePorts)
  }

  for (const key in localModeEnvVars) {
    originalServiceSpec.env[key] = localModeEnvVars[key]
  }

  delete originalServiceSpec.healthCheck
}

/**
 * Patches the main container by adding localMode-specific settings like ports, environment variables,
 * docker image name and readiness probe settings.
 * @param mainContainer the main container object to be patched
 * @param proxyContainerName the target container name
 * @param localModeEnvVars the list of localMode-specific environment variables
 * @param localModePorts the list of localMode-specific ports (e.g. ssh port for tunnel setup)
 */
function patchMainContainer(
  mainContainer: V1Container,
  proxyContainerName: string,
  localModeEnvVars: PrimitiveMap,
  localModePorts: ServicePortSpec[]
) {
  mainContainer.name = proxyContainerName
  mainContainer.image = reverseProxyImageName

  const extraEnvVars = prepareEnvVars(localModeEnvVars)
  if (!mainContainer.env) {
    mainContainer.env = []
  }
  mainContainer.env.push(...extraEnvVars)

  if (!mainContainer.ports) {
    mainContainer.ports = []
  }
  for (const port of localModePorts) {
    mainContainer.ports.push({
      name: port.name,
      protocol: port.protocol,
      containerPort: port.containerPort,
    })
  }

  // fixme: disabled health checks for proxy container, should those be enabled?
  delete mainContainer.readinessProbe
}

/**
 * Configures the specified Deployment, DaemonSet or StatefulSet for local mode.
 */
export function configureLocalMode({ target, originalServiceSpec }: ConfigureLocalModeParams): void {
  const localModeSpec = originalServiceSpec.localMode
  if (!localModeSpec) {
    return
  }

  set(target, ["metadata", "annotations", gardenAnnotationKey("local-mode")], "true")

  const remoteContainerName = localModeSpec.proxyContainer.remoteContainerName
  const mainContainer = getResourceContainer(target, remoteContainerName)
  if (!!remoteContainerName && !mainContainer) {
    throw new ConfigurationError(
      `Could not find remote k8s container for name '${remoteContainerName}'. Please check the localMode configuration`,
      {}
    )
  }
  const proxyContainerName = !!remoteContainerName ? remoteContainerName : mainContainer.name

  const localModeEnvVars = prepareLocalModeEnvVars(originalServiceSpec)
  const localModePorts = prepareLocalModePorts(originalServiceSpec)

  patchOriginalServiceSpec(originalServiceSpec, localModeEnvVars, localModePorts)
  patchMainContainer(mainContainer, proxyContainerName, localModeEnvVars, localModePorts)

  // todo: check if anything else should be configured here
}

/**
 * Creates SSH tunnel between the local machine and the target container in the k8s cluster.
 * @param ctx the k8s plugin context
 * @param log the logger
 * @param service the target k8s service container
 */
export async function startLocalModePortForwarding({
  ctx,
  log,
  service,
}: {
  ctx: KubernetesPluginContext
  log: LogEntry
  service: ContainerService
}) {
  if (!service.spec.localMode) {
    return
  }

  const namespace = await getAppNamespace(ctx, log, ctx.provider)
  const targetResource = getTargetResource(service)
  const port = PROXY_CONTAINER_SSH_TUNNEL_PORT
  const fwd = await getPortForward({ ctx, log, namespace, targetResource, port })
  const localSshUrl = chalk.underline(`ssh://localhost:${fwd.localPort}`)
  const remoteSshUrl = chalk.underline(`ssh://${targetResource}:${fwd.port}`)
  const logEntry = log.info({
    status: "active",
    section: service.name,
    msg: chalk.gray(`→ Forward: ${localSshUrl} → ${remoteSshUrl}`),
  })
  logEntry.setSuccess()
}
