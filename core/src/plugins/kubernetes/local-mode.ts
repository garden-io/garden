/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerLocalModeSpec, ContainerService } from "../container/config"
import { gardenAnnotationKey } from "../../util/string"
import { find, remove, set } from "lodash"
import { SyncableResource } from "./hot-reload/hot-reload"
import { PrimitiveMap } from "../../config/common"
import {
  PROXY_CONTAINER_SSH_TUNNEL_PORT,
  PROXY_CONTAINER_SSH_TUNNEL_PORT_NAME,
  PROXY_CONTAINER_USER_NAME,
  reverseProxyImageName,
} from "./constants"
import { ConfigurationError, RuntimeError } from "../../exceptions"
import { getResourceContainer, prepareEnvVars } from "./util"
import { V1Container, V1ContainerPort } from "@kubernetes/client-node"
import { KubernetesPluginContext } from "./config"
import { LogEntry } from "../../logger/log-entry"
import chalk from "chalk"
import { rmSync } from "fs"
import { execSync } from "child_process"
import { isAbsolute, join } from "path"
import { ensureDir, readFile } from "fs-extra"
import { PluginContext } from "../../plugin-context"
import { kubectl } from "./kubectl"
import { OsCommand, ProcessMessage, RecoverableProcess, RetryInfo } from "../../util/recoverable-process"
import { isConfiguredForLocalMode } from "./status/status"
import { exec, registerCleanupFunction, shutdown } from "../../util/util"
import { KubernetesService } from "./kubernetes-module/config"
import { HelmService } from "./helm/config"
import getPort = require("get-port")
import touch = require("touch")

// export const localModeGuideLink = "https://docs.garden.io/guides/running-service-in-local-mode.md"
export const localModeGuideLink =
  "https://github.com/garden-io/garden/blob/master/docs/guides/running-service-in-local-mode.md"

const localhost = "127.0.0.1"

const AsyncLock = require("async-lock")
const sshKeystoreAsyncLock = new AsyncLock()

const portForwardRetryTimeoutMs = 5000

interface ConfigureLocalModeParams {
  ctx: PluginContext
  spec: ContainerLocalModeSpec
  targetResource: SyncableResource
  gardenService: ContainerService | KubernetesService | HelmService
  log: LogEntry
  containerName?: string
}

interface StartLocalModeParams {
  ctx: PluginContext
  spec: ContainerLocalModeSpec
  targetResource: SyncableResource
  gardenService: ContainerService | KubernetesService | HelmService
  namespace: string
  log: LogEntry
  containerName?: string
}

export class KeyPair {
  public readonly publicKeyPath: string
  public readonly privateKeyPath: string

  constructor(sshDirPath: string, sshKeyName: string) {
    this.publicKeyPath = join(sshDirPath, `${sshKeyName}.pub`)
    this.privateKeyPath = join(sshDirPath, sshKeyName)
  }

  private static async readSshKeyFromFile(filePath: string): Promise<string> {
    try {
      return (await readFile(filePath)).toString()
    } catch (err) {
      throw new ConfigurationError(`Could not read public key file from path ${filePath}; cause: ${err}`, err)
    }
  }

  public async readPublicSshKey(): Promise<string> {
    return await KeyPair.readSshKeyFromFile(this.publicKeyPath)
  }
}

export class ProxySshKeystore {
  private static readonly PROXY_CONTAINER_SSH_DIR = ".ssh"
  private static readonly TEMP_KNOWN_HOSTS_FILENAME = "ssh_proxy_known_hosts"

  /**
   * Stores service specific {@link KeyPair} instances.
   * Each Garden service, which is running in local mode, has its own ssh keys directory.
   * The lifecycle of each ssh key pair for a proxy container is the same as the Garden CLI application's lifecycle.
   * Thus, there is no need to invalidate this cache. It just memoizes each module specific existing keystore.
   */
  private readonly serviceKeyPairs: Map<string, KeyPair>
  private readonly localSshPorts: Set<number>
  private readonly knownHostsFilePaths: Set<string>

  private constructor() {
    if (!!ProxySshKeystore.instance) {
      throw new RuntimeError("Cannot init singleton twice, use ProxySshKeystore.getInstance()", {})
    }
    this.serviceKeyPairs = new Map<string, KeyPair>()
    this.localSshPorts = new Set<number>()
    /*
     * Effectively, this is a singleton set, because all knows hosts file paths in one garden project
     * point to the same file in the current project's `.garden` dir.
     */
    this.knownHostsFilePaths = new Set<string>()
  }

  private static instance?: ProxySshKeystore = undefined

  public static getInstance(log: LogEntry): ProxySshKeystore {
    if (!ProxySshKeystore.instance) {
      const newInstance = new ProxySshKeystore()
      registerCleanupFunction("shutdown-proxy-ssh-keystore", () => newInstance.shutdown(log))
      ProxySshKeystore.instance = newInstance
    }
    return ProxySshKeystore.instance
  }

  private static deleteFileFailSafe(filePath: string, log: LogEntry): void {
    try {
      rmSync(filePath, { force: true })
    } catch (err) {
      log.warn(`Could not remove file: ${filePath}; cause: ${err.message}`)
    }
  }

  private static async generateSshKeys(keyPair: KeyPair, log: LogEntry): Promise<KeyPair> {
    // Empty pass-phrase, explicit filename,
    // and auto-overwrite to rewrite old keys if the cleanup exit-hooks failed for some reason.
    const sshKeyGenCmd = `yes 'y' | ssh-keygen -N "" -f ${keyPair.privateKeyPath}`
    // ensure /bin/sh shell to make the command above work properly
    const sshKeyGenProc = exec(sshKeyGenCmd, [], { shell: "/bin/sh" })
    const sshKeygenOutput = (await sshKeyGenProc).toString()
    log.debug(`Executed ssh keys generation command "${sshKeyGenCmd}" with output: ${sshKeygenOutput}`)
    return keyPair
  }

  public static getSshDirPath(gardenDirPath: string): string {
    return join(gardenDirPath, ProxySshKeystore.PROXY_CONTAINER_SSH_DIR)
  }

  private removePortFromKnownHosts(localPort: number, log: LogEntry): void {
    for (const knownHostsFilePath of this.knownHostsFilePaths) {
      const localhostEscaped = localhost.split(".").join("\\.")
      const command = `sed -i -r '/^\\[${localhostEscaped}\\]:${localPort}/d' ${knownHostsFilePath}`
      try {
        log.debug(`Cleaning temporary entries from ${knownHostsFilePath} file...`)
        execSync(command)
      } catch (err) {
        log.warn(`Unable to clean temporary entries from ${knownHostsFilePath} file: ${err}`)
      }
    }
  }

  public async getKeyPair(gardenDirPath: string, sshKeyName: string, log: LogEntry): Promise<KeyPair> {
    const sshDirPath = ProxySshKeystore.getSshDirPath(gardenDirPath)

    if (!this.serviceKeyPairs.has(sshKeyName)) {
      await sshKeystoreAsyncLock.acquire(`proxy-ssh-key-pair-${sshKeyName}`, async () => {
        if (!this.serviceKeyPairs.has(sshKeyName)) {
          await ensureDir(sshDirPath)
          const keyPair = new KeyPair(sshDirPath, sshKeyName)
          await ProxySshKeystore.generateSshKeys(keyPair, log)
          this.serviceKeyPairs.set(sshKeyName, keyPair)
        }
      })
    }
    return this.serviceKeyPairs.get(sshKeyName)!
  }

  public async getKnownHostsFile(gardenDirPath: string): Promise<string> {
    const sshDirPath = ProxySshKeystore.getSshDirPath(gardenDirPath)
    const knownHostsFilePath = join(sshDirPath, ProxySshKeystore.TEMP_KNOWN_HOSTS_FILENAME)

    if (!this.knownHostsFilePaths.has(knownHostsFilePath)) {
      await sshKeystoreAsyncLock.acquire(knownHostsFilePath, async () => {
        if (!this.knownHostsFilePaths.has(knownHostsFilePath)) {
          await ensureDir(sshDirPath)
          this.knownHostsFilePaths.add(knownHostsFilePath)
          await touch(knownHostsFilePath)
        }
      })
    }
    return knownHostsFilePath
  }

  public registerLocalPort(port: number, log: LogEntry): void {
    // ensure the temporary known hosts is not "dirty"
    this.removePortFromKnownHosts(port, log)
    this.localSshPorts.add(port)
  }

  public shutdown(log: LogEntry): void {
    this.serviceKeyPairs.forEach((value) => {
      ProxySshKeystore.deleteFileFailSafe(value.privateKeyPath, log)
      ProxySshKeystore.deleteFileFailSafe(value.publicKeyPath, log)
    })
    this.serviceKeyPairs.clear()

    this.localSshPorts.forEach((port) => this.removePortFromKnownHosts(port, log))
    this.localSshPorts.clear()

    this.knownHostsFilePaths.clear()
  }
}

/*
 * This can be changed to a "global" registry for all processes,
 * but now recoverable processes are used in local mode only.
 */
export class LocalModeProcessRegistry {
  private recoverableProcesses: RecoverableProcess[]

  private constructor() {
    if (!!LocalModeProcessRegistry.instance) {
      throw new RuntimeError("Cannot init singleton twice, use LocalModeProcessRegistry.getInstance()", {})
    }
    this.recoverableProcesses = []
  }

  private static instance?: LocalModeProcessRegistry = undefined

  public static getInstance(): LocalModeProcessRegistry {
    if (!LocalModeProcessRegistry.instance) {
      const newInstance = new LocalModeProcessRegistry()
      registerCleanupFunction("shutdown-local-mode-process-registry", () => newInstance.shutdown())
      LocalModeProcessRegistry.instance = newInstance
    }
    return LocalModeProcessRegistry.instance
  }

  public register(process: RecoverableProcess): void {
    this.recoverableProcesses.push(process.getTreeRoot())
  }

  public shutdown(): void {
    this.recoverableProcesses.forEach((process) => process.stopAll())
    this.recoverableProcesses = []
  }
}

// todo: proxy container should expose all ports instead of a single one
function findFirstForwardablePort(container: V1Container): V1ContainerPort {
  if (!container.ports || container.ports.length === 0) {
    throw new ConfigurationError(
      `Cannot configure the local mode for container ${container.name}: it does not expose any ports.`,
      { container }
    )
  }
  const firstTcpPort = container.ports.find((portSpec) => portSpec.protocol === "TCP")
  return firstTcpPort || container.ports[0]
}

export namespace LocalModeEnv {
  /**
   * Stores the port of the target container which should be executed in local mode.
   * The proxy container has to expose the same port.
   */
  export const GARDEN_REMOTE_CONTAINER_PORT = "GARDEN_REMOTE_CONTAINER_PORT"
  /**
   * Stores the generated SSH public key for the local mode's SSH connection.
   * This env variable is supported by the openssh-server,
   * see https://docs.linuxserver.io/images/docker-openssh-server for the details.
   */
  export const GARDEN_PROXY_CONTAINER_PUBLIC_KEY = "PUBLIC_KEY"
  /**
   * Stores the username for the local mode's SSH connection.
   * This env variable is supported by the openssh-server,
   * see https://docs.linuxserver.io/images/docker-openssh-server for the details.
   */
  export const GARDEN_PROXY_CONTAINER_USER_NAME = "USER_NAME"
}

async function prepareLocalModeEnvVars(targetContainer: V1Container, keyPair: KeyPair): Promise<PrimitiveMap> {
  // todo: expose all original ports in the proxy container
  const portSpec = findFirstForwardablePort(targetContainer)
  const publicSshKey = await keyPair.readPublicSshKey()

  const env = {}
  env[LocalModeEnv.GARDEN_REMOTE_CONTAINER_PORT] = portSpec.containerPort
  env[LocalModeEnv.GARDEN_PROXY_CONTAINER_PUBLIC_KEY] = publicSshKey
  env[LocalModeEnv.GARDEN_PROXY_CONTAINER_USER_NAME] = PROXY_CONTAINER_USER_NAME
  return env
}

function prepareLocalModePorts(): V1ContainerPort[] {
  return [
    {
      name: PROXY_CONTAINER_SSH_TUNNEL_PORT_NAME,
      protocol: "TCP",
      containerPort: PROXY_CONTAINER_SSH_TUNNEL_PORT,
    },
  ]
}

/**
 * Patches the target Kubernetes Workload or Pod manifest by changing localMode-specific settings
 * like ports, environment variables, probes, etc.
 *
 * @param targetManifest the Kubernetes workload manifest to be patched
 * @param containerName the name of the target container
 * @param localModeEnvVars the list of localMode-specific environment variables
 * @param localModePorts the list of localMode-specific ports (e.g. ssh port for tunnel setup)
 */
function patchSyncableManifest(
  targetManifest: SyncableResource,
  containerName: string,
  localModeEnvVars: PrimitiveMap,
  localModePorts: V1ContainerPort[]
): void {
  const targetContainer = getResourceContainer(targetManifest, containerName)

  // use reverse proxy container image
  targetContainer.image = reverseProxyImageName
  // erase the original container arguments, the proxy container won't recognize them
  targetContainer.args = []

  const extraEnvVars = prepareEnvVars(localModeEnvVars)
  if (!targetContainer.env) {
    targetContainer.env = []
  }
  // prevent duplicate env vars
  const extraEnvVarNames = new Set(extraEnvVars.map((v) => v.name))
  remove(targetContainer.env, (v) => extraEnvVarNames.has(v.name))
  targetContainer.env.push(...extraEnvVars)

  if (!targetContainer.ports) {
    targetContainer.ports = []
  }
  // prevent duplicate ports
  const localModePortNames = new Set(localModePorts.map((v) => v.name))
  remove(targetContainer.ports, (p) => localModePortNames.has(p.name))
  targetContainer.ports.push(...localModePorts)

  /*
   Both readiness and liveness probes do not make much sense for the services running in local mode.
   A user can completely control the lifecycle of a local service. Thus, these checks may be unwanted.

   The readiness probe can cause the failure of local mode startup,
   because the local service has not been connected to the target cluster yet.

   The liveness probe can cause unnecessary re-deployment of the proxy container in the target cluster.
   Also, it can create unnecessary noisy traffic to the local service is running in the debugger.
   */
  delete targetContainer.readinessProbe
  delete targetContainer.livenessProbe
}

/**
 * Configures the specified Deployment, DaemonSet or StatefulSet for local mode.
 */
export async function configureLocalMode(configParams: ConfigureLocalModeParams): Promise<void> {
  const { ctx, targetResource, gardenService, log, containerName } = configParams

  // Logging this on the debug level because it can be displayed multiple times due to getServiceStatus checks
  log.debug({
    section: gardenService.name,
    msg: chalk.gray(
      `Configuring in local mode, proxy container ${chalk.underline(reverseProxyImageName)} will be deployed.`
    ),
  })

  set(targetResource, ["metadata", "annotations", gardenAnnotationKey("local-mode")], "true")

  const keyPair = await ProxySshKeystore.getInstance(log).getKeyPair(ctx.gardenDirPath, gardenService.name, log)
  log.debug({
    section: gardenService.name,
    msg: `Created ssh key pair for proxy container: "${keyPair.publicKeyPath}" and "${keyPair.privateKeyPath}".`,
  })

  const targetContainer = getResourceContainer(targetResource, containerName)
  const localModeEnvVars = await prepareLocalModeEnvVars(targetContainer, keyPair)
  const localModePorts = prepareLocalModePorts()

  patchSyncableManifest(targetResource, targetContainer.name, localModeEnvVars, localModePorts)
}

const attemptsLeft = ({ maxRetries, minTimeoutMs, retriesLeft }: RetryInfo): string => {
  const retryingMsg = `retrying in ${minTimeoutMs}ms`
  if (maxRetries === Number.POSITIVE_INFINITY) {
    return retryingMsg
  }
  return !!retriesLeft ? `${retryingMsg}, ${retriesLeft} attempts left` : "no retries left"
}

const composeMessage = (customMessage: string, processMessage: ProcessMessage): string => {
  return `${customMessage} [PID=${processMessage.pid}]`
}

const composeErrorMessage = (customMessage: string, processMessage: ProcessMessage): string => {
  let message = composeMessage(customMessage, processMessage)
  if (!!processMessage.code) {
    message = `${message}, exited with code ${processMessage.code}`
  }
  if (!!processMessage.signal) {
    message = `${message}, killed with signal ${processMessage.signal}`
  }
  return !!processMessage.retryInfo ? `${message}, ${attemptsLeft(processMessage.retryInfo)}` : message
}

class FailureCounter {
  public readonly alarmThreshold: number
  private failures: number

  constructor(alarmThreshold: number) {
    this.alarmThreshold = alarmThreshold
    this.failures = 0
  }

  addFailure(onThreshold: () => void): number {
    if (this.failures === Number.MAX_VALUE) {
      return this.failures
    }
    this.failures++
    if (this.failures % this.alarmThreshold === 0) {
      onThreshold()
    }
    return this.failures
  }

  getFailures(): number {
    return this.failures
  }
}

function getLogsPath(ctx: PluginContext): string {
  return join(ctx.gardenDirPath, "logs")
}

function getLocalAppCommand({ spec: localModeSpec, gardenService }: StartLocalModeParams): OsCommand | undefined {
  const command = localModeSpec.command
  if (!command || command.length === 0) {
    return undefined
  }
  const commandName = command[0]
  const commandArgs = command.slice(1)
  const cwd = isAbsolute(commandName) ? undefined : gardenService.module.path
  return { command: commandName, args: commandArgs, cwd }
}

const localAppFailureCounter = new FailureCounter(10)

function getLocalAppProcess(configParams: StartLocalModeParams): RecoverableProcess | undefined {
  const localServiceCmd = getLocalAppCommand(configParams)
  const { ctx, gardenService, log } = configParams

  return !!localServiceCmd
    ? new RecoverableProcess({
        osCommand: localServiceCmd,
        retryConfig: {
          maxRetries: configParams.spec.restart.max,
          minTimeoutMs: configParams.spec.restart.delayMsec,
        },
        log,
        stderrListener: {
          hasErrors: (_chunk: any) => true,
          onError: (msg: ProcessMessage) => {
            if (msg.code || msg.signal) {
              log.error({
                status: "error",
                section: gardenService.name,
                msg: chalk.red(composeErrorMessage("Local app stopped", msg)),
              })
            } else {
              log.error({
                status: "error",
                section: gardenService.name,
                msg: chalk.red(
                  composeErrorMessage(
                    `Error running local app, check the local app logs and the Garden logs in ${getLogsPath(ctx)}`,
                    msg
                  )
                ),
              })
            }
            localAppFailureCounter.addFailure(() => {
              log.error({
                status: "warn",
                symbol: "warning",
                section: gardenService.name,
                msg: chalk.yellow(
                  `Local app hasn't started after ${localAppFailureCounter.getFailures()} attempts. Please check the logs in ${getLogsPath(
                    ctx
                  )} and consider restarting Garden.`
                ),
              })
            })
          },
          onMessage: (_msg: ProcessMessage) => {},
        },
      })
    : undefined
}

async function getKubectlPortForwardCommand(
  { ctx, log }: StartLocalModeParams,
  localPort: number,
  targetNamespace: string,
  targetResource: string
): Promise<OsCommand> {
  const portMapping = `${localPort}:${PROXY_CONTAINER_SSH_TUNNEL_PORT}`

  // TODO: use the API directly instead of kubectl (need to reverse-engineer kubectl quite a bit for that)
  const k8sCtx = <KubernetesPluginContext>ctx
  const { args: portForwardArgs } = kubectl(k8sCtx, k8sCtx.provider).prepareArgs({
    namespace: targetNamespace,
    args: ["port-forward", targetResource, portMapping],
    log,
  })

  const kubectlPath = await kubectl(k8sCtx, k8sCtx.provider).getPath(log)
  return { command: kubectlPath, args: portForwardArgs }
}

const kubectlPortForwardFailureCounter = new FailureCounter(10)

async function getKubectlPortForwardProcess(
  configParams: StartLocalModeParams,
  localSshPort: number,
  targetNamespace: string,
  targetResource: string
): Promise<RecoverableProcess> {
  const kubectlPortForwardCmd = await getKubectlPortForwardCommand(
    configParams,
    localSshPort,
    targetNamespace,
    targetResource
  )
  const { ctx, gardenService, log } = configParams

  let lastSeenSuccessMessage = ""

  return new RecoverableProcess({
    osCommand: kubectlPortForwardCmd,
    retryConfig: {
      maxRetries: Number.POSITIVE_INFINITY,
      minTimeoutMs: portForwardRetryTimeoutMs,
    },
    log,
    stderrListener: {
      catchCriticalErrors: (_chunk: any) => false,
      hasErrors: (_chunk: any) => true,
      onError: (msg: ProcessMessage) => {
        log.error({
          status: "error",
          section: gardenService.name,
          msg: chalk.red(composeErrorMessage("Kubectl SSH port-forward failed", msg)),
        })
        kubectlPortForwardFailureCounter.addFailure(() => {
          log.error({
            status: "warn",
            symbol: "warning",
            section: gardenService.name,
            msg: chalk.yellow(
              `Kubectl SSH port-forward hasn't started after ${kubectlPortForwardFailureCounter.getFailures()} attempts. Please check the logs in ${getLogsPath(
                ctx
              )} and consider restarting Garden.`
            ),
          })
        })
      },
      onMessage: (_msg: ProcessMessage) => {},
    },
    stdoutListener: {
      catchCriticalErrors: (_chunk) => false,
      hasErrors: (_chunk: any) => false,
      onError: (_msg: ProcessMessage) => {},
      onMessage: (msg: ProcessMessage) => {
        const consoleMessage = composeMessage("Kubectl SSH port-forward is up and running", msg)
        if (consoleMessage === lastSeenSuccessMessage) {
          return
        }

        if (msg.message.includes("Handling connection for")) {
          log.info({
            status: "success",
            section: gardenService.name,
            msg: chalk.white(consoleMessage),
          })
          lastSeenSuccessMessage = consoleMessage
        }
      },
    },
  })
}

async function getReversePortForwardCommand(
  { ctx, spec: localModeSpec, log }: StartLocalModeParams,
  localSshPort: number,
  targetContainer: V1Container
): Promise<OsCommand> {
  const localPort = localModeSpec.localPort
  const effectiveContainerName = targetContainer.name

  // todo: get all forwardable ports and set up ssh tunnels for all
  const remoteContainerPortEnvVar = find(
    targetContainer.env,
    (v) => v.name === LocalModeEnv.GARDEN_REMOTE_CONTAINER_PORT
  )
  if (!remoteContainerPortEnvVar || !remoteContainerPortEnvVar.value) {
    // this should never happen, because the manifests must have been patched properly before calling this
    throw new RuntimeError(
      `Container ${effectiveContainerName} does not define a mandatory local mode environment variable ${LocalModeEnv.GARDEN_REMOTE_CONTAINER_PORT}`,
      { targetContainer }
    )
  }
  const remoteContainerPort = remoteContainerPortEnvVar.value
  const keyPair = await ProxySshKeystore.getInstance(log).getKeyPair(ctx.gardenDirPath, effectiveContainerName, log)
  const knownHostsFilePath = await ProxySshKeystore.getInstance(log).getKnownHostsFile(ctx.gardenDirPath)

  const sshCommandName = "ssh"
  const sshCommandArgs = [
    /*
     Always disable pseudo-terminal allocation to avoid warnings like
     "Pseudo-terminal will not be allocated because stdin is not a terminal".
     */
    "-T",
    "-R",
    `${remoteContainerPort}:${localhost}:${localPort}`,
    `${PROXY_CONTAINER_USER_NAME}@${localhost}`,
    `-p${localSshPort}`,
    `-i ${keyPair.privateKeyPath}`,
    "-oStrictHostKeyChecking=accept-new",
    `-oUserKnownHostsFile=${knownHostsFilePath}`,
    "-oServerAliveInterval=60",
  ]
  return { command: sshCommandName, args: sshCommandArgs }
}

const reversePortForwardFailureCounter = new FailureCounter(10)

async function getReversePortForwardProcess(
  configParams: StartLocalModeParams,
  localSshPort: number,
  targetContainer: V1Container
): Promise<RecoverableProcess> {
  const reversePortForwardingCmd = await getReversePortForwardCommand(configParams, localSshPort, targetContainer)
  const { ctx, gardenService, log } = configParams

  return new RecoverableProcess({
    osCommand: reversePortForwardingCmd,
    retryConfig: {
      maxRetries: Number.POSITIVE_INFINITY,
      minTimeoutMs: portForwardRetryTimeoutMs,
    },
    log,
    stderrListener: {
      catchCriticalErrors: (chunk: any) => {
        const output = chunk.toString()
        const lowercaseOutput = output.toLowerCase()
        if (lowercaseOutput.includes('unsupported option "accept-new"')) {
          log.error({
            status: "error",
            section: gardenService.name,
            msg: chalk.red(
              "It looks like you're using too old SSH version which doesn't support option -oStrictHostKeyChecking=accept-new. Consider upgrading to OpenSSH 7.6 or higher. Local mode will not work."
            ),
          })
          return true
        }
        const criticalErrorIndicators = [
          "permission denied",
          "remote host identification has changed",
          "bad configuration option",
        ]
        const hasCriticalErrors = criticalErrorIndicators.some((indicator) => {
          lowercaseOutput.includes(indicator)
        })
        if (hasCriticalErrors) {
          log.error({
            status: "error",
            section: gardenService.name,
            msg: chalk.red(output),
          })
        }
        return hasCriticalErrors
      },
      hasErrors: (chunk: any) => {
        const output = chunk.toString()
        // A message containing "warning: permanently added" is printed by ssh command
        // when the connection is established and the public key is added to the temporary known hosts file.
        // This message is printed to stderr, but it should not be considered as an error.
        // It indicates the successful connection.
        return !output.toLowerCase().includes("warning: permanently added")
      },
      onError: (msg: ProcessMessage) => {
        log.error({
          status: "error",
          section: gardenService.name,
          msg: chalk.red(composeErrorMessage("Reverse SSH port-forward failed", msg)),
        })
        reversePortForwardFailureCounter.addFailure(() => {
          log.error({
            status: "warn",
            symbol: "warning",
            section: gardenService.name,
            msg: chalk.yellow(
              `Reverse SSH port-forward hasn't started after ${reversePortForwardFailureCounter.getFailures()} attempts. Please check the logs in ${getLogsPath(
                ctx
              )} and consider restarting Garden.`
            ),
          })
        })
      },
      onMessage: (msg: ProcessMessage) => {
        log.info({
          status: "success",
          section: gardenService.name,
          msg: chalk.white(composeMessage("Reverse SSH port-forward is up and running", msg)),
        })
      },
    },
    stdoutListener: {
      catchCriticalErrors: (_chunk: any) => false,
      hasErrors: (_chunk: any) => false,
      onError: (_msg: ProcessMessage) => {},
      onMessage: (msg: ProcessMessage) => {
        log.info({
          status: "success",
          section: gardenService.name,
          msg: chalk.white(composeMessage("Reverse port-forward is up and running", msg)),
        })
      },
    },
  })
}

function composeSshTunnelProcessTree(
  sshTunnel: RecoverableProcess,
  reversePortForward: RecoverableProcess,
  log: LogEntry
): RecoverableProcess {
  const root = sshTunnel
  root.addDescendantProcess(reversePortForward)
  root.setFailureHandler(async () => {
    log.error("Local mode failed, shutting down...")
    await shutdown(1)
  })
  return root
}

/**
 * Configures the necessary port forwarding to replace a k8s service by a local one:
 *   1. Starts a local service if a corresponding command is provided in local mode config.
 *   2. Opens SSH tunnel between the local machine and the k8s resource.
 *   3. Starts reverse port forwarding from the proxy's containerPort to the local app port.
 */
export async function startServiceInLocalMode(configParams: StartLocalModeParams): Promise<void> {
  const { targetResource, gardenService, namespace, log, containerName } = configParams
  const targetResourceId = `${targetResource.kind}/${targetResource.metadata.name}`

  // Validate the target
  if (!isConfiguredForLocalMode(targetResource)) {
    throw new ConfigurationError(`Resource ${targetResourceId} is not deployed in local mode`, {
      targetResource,
    })
  }

  log.info({
    status: "active",
    section: gardenService.name,
    msg: chalk.white("Starting in local mode..."),
  })

  registerCleanupFunction(`redeploy-alert-for-local-mode-${gardenService.name}`, () => {
    log.warn({
      status: "warn",
      symbol: "warning",
      section: gardenService.name,
      msg: chalk.yellow(
        `Local mode has been stopped for the service "${gardenService.name}". ` +
          "Please, re-deploy the original service to restore the original k8s cluster state: " +
          `${chalk.white(`\`garden deploy ${gardenService.name}\``)}`
      ),
    })
  })

  const localSshPort = await getPort()
  ProxySshKeystore.getInstance(log).registerLocalPort(localSshPort, log)

  const localApp = getLocalAppProcess(configParams)
  if (!!localApp) {
    LocalModeProcessRegistry.getInstance().register(localApp)
    log.info({
      status: "active",
      section: gardenService.name,
      msg: chalk.white("Starting local app, this can take a while"),
    })
    localApp.startAll()
  }

  const targetNamespace = targetResource.metadata.namespace || namespace
  const kubectlPortForward = await getKubectlPortForwardProcess(
    configParams,
    localSshPort,
    targetNamespace,
    targetResourceId
  )

  const targetContainer = getResourceContainer(targetResource, containerName)
  const reversePortForward = await getReversePortForwardProcess(configParams, localSshPort, targetContainer)

  const compositeSshTunnel = composeSshTunnelProcessTree(kubectlPortForward, reversePortForward, log)
  log.debug(`Starting local mode ssh tunnels:\n` + `${chalk.white(`${compositeSshTunnel.renderProcessTree()}`)}`)
  log.info({
    status: "active",
    section: gardenService.name,
    msg: chalk.white("Starting local mode ssh tunnels, some failures and retries are possible"),
  })
  LocalModeProcessRegistry.getInstance().register(compositeSshTunnel)
  compositeSshTunnel.startAll()
}
