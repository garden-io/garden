/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerService, ContainerServiceSpec, ServicePortSpec } from "../container/config"
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
import { getTargetResource } from "./port-forward"
import chalk from "chalk"
import { existsSync, rmSync } from "fs"
import { execSync } from "child_process"
import { join, resolve } from "path"
import { ensureDir, readFileSync } from "fs-extra"
import { PluginContext } from "../../plugin-context"
import { kubectl } from "./kubectl"
import { OsCommand, RetriableProcess } from "../../util/process"
import pRetry = require("p-retry")
import getPort = require("get-port")

export const builtInExcludes = ["/**/*.git", "**/*.garden"]

export const localModeGuideLink = "https://docs.garden.io/guides/running-service-in-local-mode.md"

const defaultReverseForwardingPortName = "http"

interface ConfigureLocalModeParams {
  target: HotReloadableResource
  service: ContainerService
  log: LogEntry
}

class ProxySshKeystore {
  private readonly proxySshKeyDirPath: string
  private readonly log: LogEntry

  constructor(proxySshKeyDirPath: string, log: LogEntry) {
    this.proxySshKeyDirPath = proxySshKeyDirPath
    this.log = log
  }

  private async buildProxySshKeysPathForModule(moduleName: string): Promise<string> {
    await ensureDir(this.proxySshKeyDirPath)
    const path = resolve(this.proxySshKeyDirPath, moduleName)
    await ensureDir(path)
    return path
  }

  public async getPrivateSshKeyPath(service: ContainerService): Promise<string> {
    const moduleName = service.module.name
    const serviceName = service.name
    const moduleSshKeyDirPath = await this.buildProxySshKeysPathForModule(moduleName)
    return `${join(moduleSshKeyDirPath, serviceName)}`
  }

  public async getPublicSshKeyPath(service: ContainerService): Promise<string> {
    const privateSshKeyPath = await this.getPrivateSshKeyPath(service)
    return `${privateSshKeyPath}.pub`
  }

  public async getPublicSshKey(service: ContainerService): Promise<string> {
    const publicSshKeyPath = await this.getPublicSshKeyPath(service)
    return ProxySshKeystore.readSshKeyFromFile(publicSshKeyPath)
  }

  public async generateSshKeys(
    service: ContainerService
  ): Promise<{ publicSshKeyPath: string; privateSshKeyPath: string }> {
    const publicSshKeyPath = await this.getPublicSshKeyPath(service)
    const privateSshKeyPath = await this.getPrivateSshKeyPath(service)
    if (!existsSync(privateSshKeyPath)) {
      await pRetry(() => execSync(`ssh-keygen -N "" -f ${privateSshKeyPath}`), {
        retries: 5,
        minTimeout: 2000,
        onFailedAttempt: async (err) => {
          this.log.warn({
            status: "active",
            section: service.name,
            msg: `Failed to create an ssh key pair for reverse proxy container. ${err.retriesLeft} attempts left.`,
          })
        },
      })
    }
    process.on("exit", () => {
      this.deleteFile(publicSshKeyPath)
      this.deleteFile(privateSshKeyPath)
    })
    return { privateSshKeyPath, publicSshKeyPath }
  }

  private deleteFile(filePath: string): void {
    try {
      rmSync(filePath, { force: true })
    } catch (err) {
      this.log.warn(`Could not remove file: ${filePath}; cause: ${err.message}`)
    }
  }

  private static readSshKeyFromFile(filePath: string): string {
    try {
      return readFileSync(filePath).toString("utf-8")
    } catch (err) {
      const message = !!err.message ? err.message.toString() : "unknown"
      throw new ConfigurationError(`Could not read public key file from path ${filePath}; cause: ${message}`, err)
    }
  }
}

function findPortByName(serviceSpec: ContainerServiceSpec, portName: string): ServicePortSpec | undefined {
  return serviceSpec.ports.find((portSpec) => portSpec.name === portName)
}

async function prepareLocalModeEnvVars(
  service: ContainerService,
  proxySshKeystore: ProxySshKeystore
): Promise<PrimitiveMap> {
  const originalServiceSpec = service.spec
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

  const publicSshKey = await proxySshKeystore.getPublicSshKey(service)

  return {
    APP_PORT: httpPortSpec.containerPort,
    PUBLIC_KEY: publicSshKey,
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
export async function configureLocalMode({ target, service, log }: ConfigureLocalModeParams): Promise<void> {
  const originalServiceSpec = service.spec
  const localModeSpec = originalServiceSpec.localMode
  if (!localModeSpec) {
    return
  }

  log.info({
    section: service.name,
    msg: chalk.gray(
      `Configuring in local mode, proxy container ${chalk.underline(reverseProxyImageName)} will be deployed`
    ),
  })

  set(target, ["metadata", "annotations", gardenAnnotationKey("local-mode")], "true")

  const remoteContainerName = localModeSpec.containerName
  const mainContainer = getResourceContainer(target, remoteContainerName)
  if (!!remoteContainerName && !mainContainer) {
    throw new ConfigurationError(
      `Could not find remote k8s container for name '${remoteContainerName}'. Please check the localMode configuration`,
      {}
    )
  }
  const proxyContainerName = !!remoteContainerName ? remoteContainerName : mainContainer.name

  const proxySshKeystore = new ProxySshKeystore(service.module.proxySshKeyDirPath, log)
  const { publicSshKeyPath, privateSshKeyPath } = await proxySshKeystore.generateSshKeys(service)
  log.debug({
    section: service.name,
    msg: `Created ssh key pair for reverse proxy container: "${publicSshKeyPath}" and "${privateSshKeyPath}".`,
  })

  const localModeEnvVars = await prepareLocalModeEnvVars(service, proxySshKeystore)
  const localModePorts = prepareLocalModePorts(originalServiceSpec)

  patchOriginalServiceSpec(originalServiceSpec, localModeEnvVars, localModePorts)
  patchMainContainer(mainContainer, proxyContainerName, localModeEnvVars, localModePorts)

  // todo: check if anything else should be configured here
}

async function getSshPortForwardCommand(
  ctx: PluginContext,
  log: LogEntry,
  service: ContainerService,
  localPort: number
): Promise<OsCommand> {
  const k8sCtx = <KubernetesPluginContext>ctx

  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const targetResource = getTargetResource(service)

  const portMapping = `${localPort}:${PROXY_CONTAINER_SSH_TUNNEL_PORT}`

  // TODO: use the API directly instead of kubectl (need to reverse-engineer kubectl quite a bit for that)
  const { args: portForwardArgs } = kubectl(k8sCtx, k8sCtx.provider).prepareArgs({
    namespace,
    args: ["port-forward", targetResource, portMapping],
    log,
  })

  // Need to use execa directly to use its cleanup mechanism, otherwise processes can linger on Windows
  const kubectlPath = await kubectl(k8sCtx, k8sCtx.provider).getPath(log)

  return { command: kubectlPath, args: portForwardArgs }
}

/**
 * Starts reverse port forwarding from the remote service's containerPort to the local app port.
 * This reverse port forwarding works on top of the existing ssh tunnel.
 * @param service the remote proxy container which replaces the actual k8s service
 * @param localSshPort the local ssh tunnel port
 * @param log the logger
 */
async function getReversePortForwardingCommand(
  log: LogEntry,
  service: ContainerService,
  localSshPort: number
): Promise<OsCommand> {
  const localModeSpec = service.spec.localMode!
  const proxySshKeystore = new ProxySshKeystore(service.module.proxySshKeyDirPath, log)
  const privateSshKeyPath = await proxySshKeystore.getPrivateSshKeyPath(service)

  const localAppPort = localModeSpec.localAppPort
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
    /*
     Always disable pseudo-terminal allocation to avoid warnings like
     "Pseudo-terminal will not be allocated because stdin is not a terminal".
     */
    "-T",
    "-R",
    `${remoteContainerPort}:127.0.0.1:${localAppPort}`,
    `${PROXY_CONTAINER_USER_NAME}@127.0.0.1`,
    `-p${localSshPort}`,
    `-i ${privateSshKeyPath}`,
    "-oStrictHostKeyChecking=accept-new",
  ]
  return { command: sshCommandName, args: sshCommandArgs }

  // const reversePortForward = startChildProcess(
  //   reversePortForwardingCommand,
  //   function (error: ExecException | null, stdout: string, stderr: string): void {
  //     if (stderr) {
  //       if (stderr.includes('unsupported option "accept-new"')) {
  //         log.error({
  //           status: "warn",
  //           section: service.name,
  //           msg: chalk.yellow(
  //             "It looks like you're using too old SSH version " +
  //             "which doesn't support option -oStrictHostKeyChecking=accept-new. " +
  //               "Consider upgrading to OpenSSH 7.6 or higher."
  //           ),
  //         })
  //       }
  //
  //       log.error({
  //         status: "error",
  //         section: service.name,
  //         msg: chalk.red(`Reverse port-forwarding failed with error: ${stderr}.`),
  //       })
  //     }
  //     if (error) {
  //       log.error({
  //         status: "error",
  //         section: service.name,
  //         msg: chalk.red(`Exception details: ${JSON.stringify(error)}.`),
  //       })
  //     }
  //     if (stdout) {
  //       log.info({
  //         status: "active",
  //         section: service.name,
  //         msg: `Reverse port-forwarding is running> ${stdout}`,
  //       })
  //     }
  //   }
  // )
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
}): Promise<void> {
  if (!service.spec.localMode) {
    return
  }
  const localSshPort = await getPort()

  const sshTunnelCommand = await getSshPortForwardCommand(ctx, log, service, localSshPort)
  const reversePortForwardingCommand = await getReversePortForwardingCommand(log, service, localSshPort)

  const sshTunnel = new RetriableProcess(sshTunnelCommand, 10, 3000, log)
  const reversePortForward = new RetriableProcess(reversePortForwardingCommand, 10, 3000, log)
  sshTunnel.addDescendantProcess(reversePortForward)
  sshTunnel.start()
  // todo: check if we need this
  // process.on("exit", () => {
  //   sshTunnel.proc.kill()
  // })

  const sshTunnelCommandString = `${sshTunnelCommand.command} ${sshTunnelCommand.args?.join(" ")}`
  log.info({
    status: "active",
    section: service.name,
    msg: chalk.gray(
      `→ Started ssh tunnel between the local machine and the remote k8s proxy with PID ${sshTunnel.getPid()}: ` +
        `${chalk.white(sshTunnelCommandString)}`
    ),
  })

  const reversePortForwardingCommandString = `${
    reversePortForwardingCommand.command
  } ${reversePortForwardingCommand.args?.join(" ")}`
  log.info({
    status: "active",
    section: service.name,
    msg: chalk.gray(
      `→ Started reverse port forwarding between the local machine and the remote k8s proxy ` +
        `with PID ${reversePortForward.getPid()}: ` +
        `${chalk.white(reversePortForwardingCommandString)}`
    ),
  })
}
