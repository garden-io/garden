/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerLocalModeSpec, ContainerService, ContainerServiceSpec, ServicePortSpec } from "../container/config"
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
import { getTargetResource } from "./port-forward"
import chalk from "chalk"
import { existsSync, rmSync } from "fs"
import { execSync } from "child_process"
import { join, resolve } from "path"
import { ensureDir, readFileSync } from "fs-extra"
import { PluginContext } from "../../plugin-context"
import { kubectl } from "./kubectl"
import { OsCommand, RetriableProcess } from "../../util/process"
import { isConfiguredForLocalMode } from "./status/status"
import pRetry = require("p-retry")
import getPort = require("get-port")

export const builtInExcludes = ["/**/*.git", "**/*.garden"]

export const localModeGuideLink = "https://docs.garden.io/guides/running-service-in-local-mode.md"

const defaultReverseForwardingPortName = "http"
const localhost = "127.0.0.1"

interface ConfigureLocalModeParams {
  target: HotReloadableResource
  spec: ContainerLocalModeSpec
  service: ContainerService
  log: LogEntry
}

interface StartLocalModeParams extends ConfigureLocalModeParams {
  ctx: PluginContext
  namespace: string
}

// todo: init it once per service, now it's being created a few times
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
    process.once("exit", () => {
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

function cleanupKnownHosts(localPort: number, log: LogEntry): void {
  const localhostEscaped = localhost.split(".").join("\\.")
  const command = `sed -i -r '/^\\[${localhostEscaped}\\]:${localPort}/d' $\{HOME}/.ssh/known_hosts`
  try {
    log.debug("Cleaning up .ssh/known_hosts file...")
    execSync(command)
    log.debug("Cleaned up .ssh/known_hosts successfully!")
  } catch (err) {
    log.warn(`Error cleaning up .ssh/known_hosts file: ${err}`)
  }
}

function findPortByName(serviceSpec: ContainerServiceSpec, portName: string): ServicePortSpec | undefined {
  return serviceSpec.ports.find((portSpec) => portSpec.name === portName)
}

async function prepareLocalModeEnvVars(
  { service }: ConfigureLocalModeParams,
  proxySshKeystore: ProxySshKeystore
): Promise<PrimitiveMap> {
  const originalServiceSpec = service.spec

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

function prepareLocalModePorts({ service }: ConfigureLocalModeParams): ServicePortSpec[] {
  const hasSshPort = service.spec.ports.some((portSpec) => portSpec.name === "ssh")
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
export async function configureLocalMode(configParams: ConfigureLocalModeParams): Promise<void> {
  const { target, service, spec: localModeSpec, log } = configParams
  set(target, ["metadata", "annotations", gardenAnnotationKey("local-mode")], "true")

  log.info({
    section: service.name,
    msg: chalk.gray(
      `Configuring in local mode, proxy container ${chalk.underline(reverseProxyImageName)} will be deployed.`
    ),
  })

  const remoteContainerName = localModeSpec.containerName
  const mainContainer = getResourceContainer(target, remoteContainerName)
  if (!!remoteContainerName && !mainContainer) {
    throw new ConfigurationError(
      `Could not find remote k8s container for name '${remoteContainerName}'. ` +
        `Please check the localMode configuration.`,
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

  const localModeEnvVars = await prepareLocalModeEnvVars(configParams, proxySshKeystore)
  const localModePorts = prepareLocalModePorts(configParams)

  patchOriginalServiceSpec(service.spec, localModeEnvVars, localModePorts)
  patchMainContainer(mainContainer, proxyContainerName, localModeEnvVars, localModePorts)

  // todo: check if anything else should be configured here
}

function getLocalServiceCommand({ spec: localModeSpec }: StartLocalModeParams): OsCommand | undefined {
  const command = localModeSpec.command
  if (!command || command.length === 0) {
    return undefined
  }
  return { command: command.join(" ") }
}

async function getSshPortForwardCommand(
  { target, service, log, ctx, namespace }: StartLocalModeParams,
  localPort: number
): Promise<OsCommand> {
  const k8sCtx = <KubernetesPluginContext>ctx

  const targetNamespace = target.metadata.namespace || namespace
  const targetResource = getTargetResource(service)

  const portMapping = `${localPort}:${PROXY_CONTAINER_SSH_TUNNEL_PORT}`

  // TODO: use the API directly instead of kubectl (need to reverse-engineer kubectl quite a bit for that)
  const { args: portForwardArgs } = kubectl(k8sCtx, k8sCtx.provider).prepareArgs({
    namespace: targetNamespace,
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
 */
async function getReversePortForwardingCommand(
  { service, spec: localModeSpec, log }: StartLocalModeParams,
  localSshPort: number
): Promise<OsCommand> {
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
    `${remoteContainerPort}:${localhost}:${localAppPort}`,
    `${PROXY_CONTAINER_USER_NAME}@${localhost}`,
    `-p${localSshPort}`,
    `-i ${privateSshKeyPath}`,
    "-oStrictHostKeyChecking=accept-new",
  ]
  return { command: sshCommandName, args: sshCommandArgs }
}

function composeProcessTree(
  localService: RetriableProcess | undefined,
  sshTunnel: RetriableProcess,
  reversePortForward: RetriableProcess
): RetriableProcess {
  sshTunnel.addDescendantProcess(reversePortForward)

  if (!!localService) {
    localService.addDescendantProcess(sshTunnel)
    return localService
  } else {
    return sshTunnel
  }
}

/**
 * Configures the necessary port forwarding to replace remote k8s service by a local one:
 *   1. Opens SSH tunnel between the local machine and the remote k8s service.
 *   2. Starts reverse port forwarding from the remote proxy's containerPort to the local app port.
 */
export async function startServiceInLocalMode(configParams: StartLocalModeParams): Promise<void> {
  const { target, service, log } = configParams

  // Validate the target
  if (!isConfiguredForLocalMode(target)) {
    const resourceName = `${target.kind}/${target.metadata.name}`
    throw new ConfigurationError(`Resource ${resourceName} is not deployed in local mode`, {
      target,
    })
  }

  const localSshPort = await getPort()
  process.once("exit", () => {
    cleanupKnownHosts(localSshPort, log)
  })

  const localServiceCmd = getLocalServiceCommand(configParams)
  const sshTunnelCmd = await getSshPortForwardCommand(configParams, localSshPort)
  const reversePortForwardingCmd = await getReversePortForwardingCommand(configParams, localSshPort)

  const localService = !!localServiceCmd
    ? new RetriableProcess({
        osCommand: localServiceCmd,
        maxRetries: 6,
        minTimeoutMs: 5000,
        log,
      })
    : undefined
  const sshTunnel = new RetriableProcess({ osCommand: sshTunnelCmd, maxRetries: 6, minTimeoutMs: 5000, log })
  const reversePortForward = new RetriableProcess({
    osCommand: reversePortForwardingCmd,
    maxRetries: 6,
    minTimeoutMs: 5000,
    log,
    stderrListener: {
      hasErrors: (chunk: any) => {
        const output = chunk.toString()
        return !output.toLowerCase().includes("warning: permanently added")
      },
      onError: (chunk: any) => {
        const output = chunk.toString()
        if (output.toLowerCase().includes('unsupported option "accept-new"')) {
          log.error({
            status: "warn",
            section: service.name,
            msg: chalk.yellow(
              "It looks like you're using too old SSH version " +
                "which doesn't support option -oStrictHostKeyChecking=accept-new. " +
                "Consider upgrading to OpenSSH 7.6 or higher."
            ),
          })
        }
      },
    },
  })

  const processTree: RetriableProcess = composeProcessTree(localService, sshTunnel, reversePortForward)
  log.info({
    status: "active",
    section: service.name,
    msg: chalk.gray(`→ Starting local mode process tree:\n` + `${chalk.white(`${processTree.renderProcessTree()}`)}`),
  })
  processTree.start()
}
