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
import { PROXY_CONTAINER_SSH_TUNNEL_PORT, PROXY_CONTAINER_USER_NAME, reverseProxyImageName } from "./constants"
import { ConfigurationError } from "../../exceptions"
import { getResourceContainer, prepareEnvVars } from "./util"
import { V1Container } from "@kubernetes/client-node"
import { KubernetesPluginContext } from "./config"
import { LogEntry } from "../../logger/log-entry"
import { getAppNamespace } from "./namespace"
import { getPortForward, getTargetResource, PortForward } from "./port-forward"
import chalk from "chalk"
import fs from "fs"
import { ChildProcess, exec, ExecException } from "child_process"
import pRetry = require("p-retry")

export const builtInExcludes = ["/**/*.git", "**/*.garden"]

export const localModeGuideLink = "https://docs.garden.io/guides/..." // todo

const defaultReverseForwardingPortName = "http"

interface ConfigureLocalModeParams {
  target: HotReloadableResource
  originalServiceSpec: ContainerServiceSpec
}

export const kubernetesLocalModeSchema = () => containerLocalModeSchema()

function readSshKeyFromFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath).toString("utf-8")
  } catch (err) {
    const message = !!err.message ? err.message.toString() : "unknown"
    throw new ConfigurationError(`Could not read public key file from path ${filePath}; cause: ${message}`, err)
  }
}

function findPortByName(serviceSpec: ContainerServiceSpec, portName: string): ServicePortSpec | undefined {
  return serviceSpec.ports.find((portSpec) => portSpec.name === portName)
}

function prepareLocalModeEnvVars(originalServiceSpec: ContainerServiceSpec): PrimitiveMap {
  const localModeSpec = originalServiceSpec.localMode!
  if (!localModeSpec) {
    return {}
  }

  // todo: is it a good way to pick up the right port?
  const httpPortSpec = findPortByName(originalServiceSpec, defaultReverseForwardingPortName)
  if (!httpPortSpec) {
    throw new ConfigurationError(
      `Could not find ${defaultReverseForwardingPortName} port defined for service ${originalServiceSpec.name}`,
      originalServiceSpec.ports
    )
  }
  return {
    APP_PORT: httpPortSpec.containerPort,
    PUBLIC_KEY: readSshKeyFromFile(localModeSpec.proxyContainer.publicKeyFilePath),
    USER_NAME: PROXY_CONTAINER_USER_NAME,
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
    if (!originalServiceSpec.env[key]) {
      originalServiceSpec.env[key] = localModeEnvVars[key]
    }
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
  const existingEnvVarNames = new Set(mainContainer.env.map((v) => v.name))
  extraEnvVars.filter((v) => !existingEnvVarNames.has(v.name)).forEach((v) => mainContainer.env!.push(v))

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

  const remoteContainerName = localModeSpec.remoteContainerName
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
async function openSshTunnel({
  ctx,
  log,
  service,
}: {
  ctx: KubernetesPluginContext
  log: LogEntry
  service: ContainerService
}): Promise<PortForward> {
  const namespace = await getAppNamespace(ctx, log, ctx.provider)
  const targetResource = getTargetResource(service)
  const port = PROXY_CONTAINER_SSH_TUNNEL_PORT

  return pRetry(async () => await getPortForward({ ctx, log, namespace, targetResource, port }), {
    retries: 3,
    minTimeout: 2000,
    onFailedAttempt: async (err) => {
      log.warn({
        status: "active",
        section: service.name,
        msg: `Failed to start ssh tunnel between the local machine and the remote k8s cluster. ${err.retriesLeft} attempts left.`,
      })
    },
  })
}

function executeCommand(
  command: string,
  callback?: (error: ExecException | null, stdout: string, stderr: string) => void
): ChildProcess {
  const childProcess = exec(command, callback)
  process.on("exit", () => {
    childProcess.kill()
  })
  return childProcess
}

/**
 * Starts reverse port forwarding from the remote service's containerPort to the local app port.
 * This reverse port forwarding works on top of the existing ssh tunnel.
 * @param service the remote proxy container which replaces the actual k8s service
 * @param portForward the ssh tunnel details
 * @param log the logger
 */
function startReversePortForwarding(service: ContainerService, portForward: PortForward, log: LogEntry): void {
  const localModeSpec = service.spec.localMode!
  const proxyContainer = localModeSpec.proxyContainer
  const privateKeyFilePath = proxyContainer.privateKeyFilePath
  const localAppPort = localModeSpec.localAppPort
  const localSshPort = portForward.localPort
  const remoteContainerPortSpec = findPortByName(service.spec, defaultReverseForwardingPortName)
  if (!remoteContainerPortSpec) {
    throw new ConfigurationError(
      `Could not find ${defaultReverseForwardingPortName} port defined for service ${service.name}`,
      service.spec.ports
    )
  }
  const remoteContainerPort = remoteContainerPortSpec.containerPort

  const sshCommandName = "ssh"
  const sshCommandArgs = [
    "-R",
    `${remoteContainerPort}:127.0.0.1:${localAppPort}`,
    `${PROXY_CONTAINER_USER_NAME}@127.0.0.1`,
    `-p${localSshPort}`,
    `-i ${privateKeyFilePath}`,
    "-oStrictHostKeyChecking=accept-new",
  ]
  const reversePortForwardingCommand = `${sshCommandName} ${sshCommandArgs.join(" ")}`

  try {
    // The command { exec } from "../../util/util" does not work here.
    // Despite the key files have the right access permissions, it fails with the following error:
    // > Warning: Identity file  ${privateKeyFilePath} not accessible: No such file or directory

    const reversePortForward = executeCommand(
      reversePortForwardingCommand,
      function (error: ExecException | null, stdout: string, stderr: string): void {
        error &&
          log.error({
            status: "active",
            section: service.name,
            msg: chalk.red(
              `Reverse port-forwarding failed with error: ${JSON.stringify(error)}. ` +
                `Consider running it manually: ${chalk.white(reversePortForwardingCommand)}`
            ),
          })
        stderr &&
          log.warn({
            status: "active",
            section: service.name,
            msg: chalk.red(
              `Reverse port-forwarding failed with error: ${stderr}. ` +
                `Consider running it manually: ${chalk.white(reversePortForwardingCommand)}`
            ),
          })
        stdout &&
          log.info({
            status: "active",
            section: service.name,
            msg: `Reverse port-forwarding output> ${stdout}`,
          })
      }
    )

    log.info({
      status: "active",
      section: service.name,
      msg: chalk.gray(
        `→ Started reverse port forwarding between the local machine and the remote k8s proxy ` +
          `with PID ${reversePortForward.pid}: ` +
          `${chalk.white(reversePortForward.spawnargs.join(" "))}`
      ),
    })
  } catch (err) {
    log.warn({
      status: "active",
      section: service.name,
      msg: chalk.red(
        `Reverse port-forwarding failed with error: ${err.message}. ` +
          `Consider running it manually: ${chalk.white(reversePortForwardingCommand)}`
      ),
    })
  }
}

/**
 * Configures the necessary port forwarding to replace remote k8s service by a local one:
 *   1. Opens SSH tunnel between the local machine and the remote k8s service.
 *   2. Starts reverse port forwarding from the remote proxy's containerPort to the local app port.
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

  const portForward = await openSshTunnel({ ctx, log, service })
  const localSshUrl = chalk.underline(`ssh://localhost:${portForward.localPort}`)
  const remoteSshUrl = chalk.underline(`ssh://${service.name}:${portForward.port}`)
  log.info({
    status: "active",
    section: service.name,
    msg: chalk.gray(`→ Forward: ${localSshUrl} → ${remoteSshUrl}`),
  })

  startReversePortForwarding(service, portForward, log)
}
