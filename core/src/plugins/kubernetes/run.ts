/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tar from "tar"
import tmp from "tmp-promise"
import { cloneDeep, omit, pick } from "lodash"
import { V1Container, V1ContainerStatus, V1Pod, V1PodSpec, V1PodStatus } from "@kubernetes/client-node"
import { RunResult } from "../../types/plugin/base"
import { GardenModule } from "../../types/module"
import { LogEntry } from "../../logger/log-entry"
import {
  PluginError,
  GardenBaseError,
  TimeoutError,
  RuntimeError,
  ConfigurationError,
  OutOfMemoryError,
} from "../../exceptions"
import { KubernetesProvider } from "./config"
import { Writable, Readable, PassThrough } from "stream"
import { uniqByName, sleep } from "../../util/util"
import { KubeApi } from "./api"
import { getPodLogs, checkPodStatus } from "./status/pod"
import { KubernetesResource, KubernetesPod, KubernetesServerResource } from "./types"
import { RunModuleParams } from "../../types/plugin/module/runModule"
import { ContainerEnvVars, ContainerResourcesSpec, ContainerVolumeSpec } from "../container/config"
import { prepareEnvVars, makePodName } from "./util"
import { deline, randomString } from "../../util/string"
import { ArtifactSpec } from "../../config/validation"
import { prepareSecrets } from "./secrets"
import { configureVolumes } from "./container/deployment"
import { PluginContext, PluginEventBroker } from "../../plugin-context"
import { waitForResources, ResourceStatus } from "./status/status"
import { RuntimeContext } from "../../runtime-context"
import { getResourceRequirements, getSecurityContext } from "./container/util"
import { KUBECTL_DEFAULT_TIMEOUT } from "./kubectl"
import { copy } from "fs-extra"
import { K8sLogFollower, PodLogEntryConverter, PodLogEntryConverterParams } from "./logs"
import { Stream } from "ts-stream"

// Default timeout for individual run/exec operations
const defaultTimeout = 600

/**
 * When a `podSpec` is passed to `runAndCopy`, only these fields will be used for the runner's pod spec
 * (and, in some cases, overridden/populated in `runAndCopy`).
 *
 * Additionally, the keys in `runContainerExcludeFields` below will be omitted from the container used in the
 * runner's pod spec.
 *
 * See: https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.19/#podspec-v1-core
 */
export const runPodSpecIncludeFields: (keyof V1PodSpec)[] = [
  // "activeDeadlineSeconds", // <-- for clarity, we leave the excluded fields here commented out.
  "affinity",
  "automountServiceAccountToken",
  "containers",
  "dnsConfig",
  "dnsPolicy",
  "enableServiceLinks",
  // "ephemeralContainers",
  "hostAliases",
  "hostIPC",
  "hostNetwork",
  "hostPID",
  "hostname",
  "imagePullSecrets",
  // "initContainers",
  "nodeName",
  "nodeSelector",
  "overhead",
  "preemptionPolicy",
  "priority",
  "priorityClassName",
  // "readinessGates",
  // "restartPolicy",
  "runtimeClassName",
  "schedulerName",
  "securityContext",
  "serviceAccount",
  "serviceAccountName",
  "shareProcessNamespace",
  "subdomain",
  // "terminationGracePeriodSeconds",
  "tolerations",
  "topologySpreadConstraints",
  "volumes",
]

export interface RunLogEntry {
  timestamp?: Date
  msg: string
}

export const makeRunLogEntry: PodLogEntryConverter<RunLogEntry> = ({ timestamp, msg }: PodLogEntryConverterParams) => {
  return { timestamp, msg }
}

export const runContainerExcludeFields: (keyof V1Container)[] = ["readinessProbe", "livenessProbe", "startupProbe"]

export async function runAndCopy({
  ctx,
  log,
  module,
  args,
  command,
  interactive,
  runtimeContext,
  timeout,
  image,
  container,
  podName,
  podSpec,
  artifacts = [],
  artifactsPath,
  envVars = {},
  resources,
  description,
  namespace,
  version,
  volumes,
  privileged,
  addCapabilities,
  dropCapabilities,
}: RunModuleParams & {
  image: string
  container?: V1Container
  podName?: string
  podSpec?: V1PodSpec
  artifacts?: ArtifactSpec[]
  artifactsPath?: string
  envVars?: ContainerEnvVars
  resources?: ContainerResourcesSpec
  description?: string
  namespace: string
  version: string
  volumes?: ContainerVolumeSpec[]
  privileged?: boolean
  addCapabilities?: string[]
  dropCapabilities?: string[]
}): Promise<RunResult> {
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  const getArtifacts = !!(!interactive && artifacts && artifacts.length > 0 && artifactsPath)
  const mainContainerName = "main"

  if (!description) {
    description = `Container module '${module.name}'`
  }

  const errorMetadata: any = { moduleName: module.name, description, args, artifacts }

  podSpec = await prepareRunPodSpec({
    podSpec,
    getArtifacts,
    log,
    module,
    args,
    command,
    api,
    provider,
    runtimeContext,
    envVars,
    resources,
    description,
    errorMetadata,
    mainContainerName,
    image,
    container,
    namespace,
    volumes,
    privileged,
    addCapabilities,
    dropCapabilities,
  })

  if (!podName) {
    podName = makePodName("run", module.name)
  }

  const runParams = {
    ctx,
    api,
    provider,
    log,
    module,
    args,
    command,
    interactive,
    runtimeContext,
    timeout,
    podSpec,
    podName,
    namespace,
    version,
  }

  if (getArtifacts) {
    const outputStream = new PassThrough()

    outputStream.on("error", () => {})
    outputStream.on("data", (data: Buffer) => {
      ctx.events.emit("log", { timestamp: new Date().getTime(), data })
    })

    return runWithArtifacts({
      ...runParams,
      mainContainerName,
      artifacts,
      artifactsPath: artifactsPath!,
      description,
      errorMetadata,
      stdout: outputStream,
      stderr: outputStream,
    })
  } else {
    return runWithoutArtifacts(runParams)
  }
}

// This helper was created to facilitate testing the pod spec generation in `runAndCopy`.
export async function prepareRunPodSpec({
  podSpec,
  getArtifacts,
  api,
  provider,
  log,
  module,
  args,
  command,
  runtimeContext,
  envVars,
  resources,
  description,
  errorMetadata,
  mainContainerName,
  image,
  container,
  namespace,
  volumes,
  privileged,
  addCapabilities,
  dropCapabilities,
}: {
  podSpec?: V1PodSpec
  getArtifacts: boolean
  log: LogEntry
  module: GardenModule
  args: string[]
  command: string[] | undefined
  api: KubeApi
  provider: KubernetesProvider
  runtimeContext: RuntimeContext
  envVars: ContainerEnvVars
  resources?: ContainerResourcesSpec
  description: string
  errorMetadata: any
  mainContainerName: string
  image: string
  container?: V1Container
  namespace: string
  volumes?: ContainerVolumeSpec[]
  privileged?: boolean
  addCapabilities?: string[]
  dropCapabilities?: string[]
}): Promise<V1PodSpec> {
  // Prepare environment variables
  envVars = { ...runtimeContext.envVars, ...envVars }
  const env = uniqByName([
    ...prepareEnvVars(envVars),
    // If `container` is specified, include its variables as well
    ...(container && container.env ? container.env : []),
  ])

  const resourceRequirements = resources ? { resources: getResourceRequirements(resources) } : {}
  const securityContext = getSecurityContext(privileged, addCapabilities, dropCapabilities)

  const containers: V1Container[] = [
    {
      ...omit(container || {}, runContainerExcludeFields),
      ...resourceRequirements,
      ...(securityContext ? { securityContext } : {}),
      // We always override the following attributes
      name: mainContainerName,
      image,
      env,
      // TODO: consider supporting volume mounts in ad-hoc runs (would need specific logic and testing)
      volumeMounts: [],
    },
  ]

  const imagePullSecrets = await prepareSecrets({ api, namespace, secrets: provider.config.imagePullSecrets, log })
  await prepareSecrets({ api, namespace, secrets: provider.config.copySecrets, log })

  const preparedPodSpec = {
    ...pick(podSpec || {}, runPodSpecIncludeFields),
    containers,
    imagePullSecrets,
  }

  if (volumes) {
    configureVolumes(module, preparedPodSpec, volumes)
  }

  if (getArtifacts) {
    if (!command) {
      throw new ConfigurationError(
        deline`
        ${description} specifies artifacts to export, but doesn't
        explicitly set a \`command\`. The kubernetes provider currently requires an explicit command to be set for
        tests and tasks that export artifacts, because the image's entrypoint cannot be inferred in that execution
        mode. Please set the \`command\` field and try again.
        `,
        errorMetadata
      )
    }

    // We start the container with a named pipe and tail that, to get the logs from the actual command
    // we plan on running. Then we sleep, so that we can copy files out of the container.
    preparedPodSpec.containers[0].command = ["sh", "-c", "mkfifo /tmp/output && cat /tmp/output && sleep 86400"]
  } else {
    if (args) {
      preparedPodSpec.containers[0].args = args
    }
    if (command) {
      preparedPodSpec.containers[0].command = command
    }
  }

  return preparedPodSpec
}

interface PodData {
  namespace: string
  podName: string
  podSpec: V1PodSpec
}

function getPodResourceAndRunner({
  ctx,
  api,
  provider,
  namespace,
  podName,
  podSpec,
}: PodData & { ctx: PluginContext; api: KubeApi; provider: KubernetesProvider }) {
  const pod: KubernetesResource<V1Pod> = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: podName,
      namespace,
    },
    spec: podSpec,
  }

  const runner = new PodRunner({
    ctx,
    api,
    pod,
    provider,
    namespace,
  })

  return { pod, runner }
}

async function runWithoutArtifacts({
  ctx,
  api,
  provider,
  log,
  module,
  timeout,
  podSpec,
  podName,
  namespace,
  interactive,
  version,
}: RunModuleParams &
  PodData & {
    api: KubeApi
    provider: KubernetesProvider
    version: string
  }): Promise<RunResult> {
  const { runner } = getPodResourceAndRunner({
    ctx,
    api,
    provider,
    namespace,
    podName,
    podSpec,
  })

  let result: RunResult
  const startedAt = new Date()

  try {
    const res = await runner.runAndWait({
      log,
      remove: true,
      events: ctx.events,
      timeoutSec: timeout || defaultTimeout,
      tty: interactive,
    })
    result = {
      ...res,
      moduleName: module.name,
      version,
    }
  } catch (err) {
    result = await runner.handlePodError({
      err,
      command: runner.getFullCommand(),
      startedAt,
      version,
      moduleName: module.name,
    })
  }

  return result
}

/**
 * Wraps a given {@code cmd} into a script to redirect its stdout and stderr to the same tmp file.
 * See https://stackoverflow.com/a/20564208
 * @param cmd the command to wrap
 */
function commandExecutionScript(cmd: string[]) {
  return `
exec 1<&-
exec 2<&-
exec 1<>/tmp/output
exec 2>&1

${cmd.join(" ")}
`
}

/**
 * For given {@code artifacts} prepares a script which will:
 *   1. Create temp directory in the container
 *   2. Create directories for each target, as necessary
 *   3. Recursively (and silently) copy all specified artifact files/directories into the temp directory
 *   4. Tarball the directory and pipe to stdout
 * @param artifacts the artifacts to be processed
 */
function artifactsTarScript(artifacts: ArtifactSpec[]) {
  // TODO: only interpret target as directory if it ends with a slash (breaking change, so slated for 0.13)
  const directoriesToCreate = artifacts.map((a) => a.target).filter((target) => !!target && target !== ".")
  const tmpPath = "/tmp/.garden-artifacts-" + randomString(8)

  // TODO: escape the user paths somehow?
  return `
rm -rf ${tmpPath} >/dev/null || true
mkdir -p ${tmpPath}
cd ${tmpPath}
touch .garden-placeholder
${directoriesToCreate.map((target) => `mkdir -p ${target}`).join("\n")}
${artifacts.map(({ source, target }) => `cp -r ${source} ${target || "."} >/dev/null || true`).join("\n")}
tar -c -z -f - . | cat
rm -rf ${tmpPath} >/dev/null || true
`
}

async function runWithArtifacts({
  ctx,
  api,
  provider,
  log,
  module,
  args,
  command,
  timeout,
  podSpec,
  podName,
  mainContainerName,
  artifacts,
  artifactsPath,
  description,
  errorMetadata,
  stdout,
  stderr,
  namespace,
  version,
}: RunModuleParams &
  PodData & {
    api: KubeApi
    provider: KubernetesProvider
    version: string
    mainContainerName: string
    artifacts: ArtifactSpec[]
    artifactsPath: string
    description?: string
    errorMetadata: any
    stdout: Writable
    stderr: Writable
  }): Promise<RunResult> {
  const { pod, runner } = getPodResourceAndRunner({
    ctx,
    api,
    provider,
    namespace,
    podName,
    podSpec,
  })

  let result: RunResult
  const startedAt = new Date()

  const timeoutSec = timeout || defaultTimeout

  try {
    errorMetadata.pod = pod

    // Start the Pod
    try {
      await runner.start({ log, timeoutSec })
    } catch (err) {
      if (err.type !== "deployment") {
        throw err
      }

      // Specifically look for deployment error indicating `sh` is missing, and report with more helpful message.
      const status = err.detail.status

      errorMetadata.status = status

      if (status.state !== "ready") {
        const containerStatus = status.resource.status.containerStatuses![0]
        const message = containerStatus?.state?.terminated?.message || containerStatus?.state?.waiting?.message

        if (message?.includes("not found")) {
          throw new ConfigurationError(
            deline`
              ${description} specifies artifacts to export, but the image doesn't
              contain the sh binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need to
              be installed in the image.`,
            errorMetadata
          )
        } else {
          throw new RuntimeError(
            `Failed to start Pod ${runner.podName}: ${JSON.stringify(status.resource.status, null, 2)}`,
            errorMetadata
          )
        }
      }
    }

    try {
      await runner.exec({
        command: ["sh", "-c", "tar --help"],
        containerName: mainContainerName,
        log,
        stdout,
        stderr,
        // Anything above two minutes for this would be unusual
        timeoutSec: 120,
        buffer: true,
      })
    } catch (err) {
      // TODO: fall back to copying `arc` (https://github.com/mholt/archiver) or similar into the container and
      // using that (tar is not statically compiled so we can't copy that directly). Keeping this snippet around
      // for that:
      // await runner.exec({
      //   command: ["sh", "-c", `sed -n 'w ${arcPath}'; chmod +x ${arcPath}`],
      //   container: containerName,
      //   ignoreError: false,
      //   input: <binary>,
      //   log,
      //   stdout,
      //   stderr,
      // })
      throw new ConfigurationError(
        deline`
        ${description} specifies artifacts to export, but the image doesn't
        contain the tar binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need to
        be installed in the image.`,
        errorMetadata
      )
    }

    // Escape the command, so that we can safely pass it as a single string
    const cmd = [...command!, ...(args || [])].map((s) => JSON.stringify(s))

    try {
      const commandScript = commandExecutionScript(cmd)

      const res = await runner.exec({
        // Pipe the output from the command to the /tmp/output pipe, including stderr. Some shell voodoo happening
        // here, but this was the only working approach I could find after a lot of trial and error.
        command: ["sh", "-c", commandScript],
        containerName: mainContainerName,
        log,
        stdout,
        stderr,
        timeoutSec,
        buffer: true,
      })
      result = {
        ...res,
        log: res.log || (await runner.getMainContainerLogs()),
        moduleName: module.name,
        version,
      }
    } catch (err) {
      result = await runner.handlePodError({
        err,
        command: cmd,
        startedAt,
        version,
        moduleName: module.name,
      })
    }

    const tarScript = artifactsTarScript(artifacts)

    // Copy the artifacts
    const tmpDir = await tmp.dir({ unsafeCleanup: true })

    try {
      await new Promise<void>((resolve, reject) => {
        // Create an extractor to receive the tarball we will stream from the container
        // and extract to the artifacts directory.
        let done = 0

        const extractor = tar.x({
          cwd: tmpDir.path,
          strict: true,
          onentry: (entry) => log.debug("tar: got entry " + entry.path),
        })

        extractor.on("end", () => {
          // Need to make sure both processes are complete before resolving (may happen in either order)
          done++
          done === 2 && resolve()
        })
        extractor.on("error", (err) => {
          reject(err)
        })

        // Tarball the requested files and stream to the above extractor.
        runner
          .exec({
            command: ["sh", "-c", tarScript],
            containerName: mainContainerName,
            log,
            stdout: extractor,
            timeoutSec,
            buffer: false,
          })
          .then(() => {
            // Need to make sure both processes are complete before resolving (may happen in either order)
            done++
            done === 2 && resolve()
          })
          .catch(reject)
      })

      // Copy the resulting files to the artifacts directory
      try {
        await copy(tmpDir.path, artifactsPath, { filter: (f) => !f.endsWith(".garden-placeholder") })
      } catch (err) {
        // Ignore error thrown when the directory is empty
        if (err.name !== "CpyError" || !err.message.includes("the file doesn't exist")) {
          throw err
        }
      }
    } finally {
      await tmpDir.cleanup()
    }
  } finally {
    await runner.stop()
  }

  return result
}

class PodRunnerParams {
  ctx: PluginContext
  annotations?: { [key: string]: string }
  api: KubeApi
  pod: KubernetesPod | KubernetesServerResource<V1Pod>
  namespace: string
  provider: KubernetesProvider
}

interface StartParams {
  log: LogEntry
  timeoutSec?: number
}

type ExecParams = StartParams & {
  command: string[]
  containerName?: string
  stdout?: Writable
  stderr?: Writable
  stdin?: Readable
  tty?: boolean
  buffer: boolean
}

type RunParams = StartParams & {
  remove: boolean
  tty: boolean
  events: PluginEventBroker
}

class PodRunnerError extends GardenBaseError {
  type = "pod-runner"
}

interface RunAndWaitResult {
  command: string[]
  startedAt: Date
  completedAt: Date
  log: string
  success: boolean
  exitCode?: number
}

interface PodErrorDetails {
  logs: string
  // optional details
  exitCode?: number
  containerStatus?: V1ContainerStatus
  podStatus?: V1PodStatus
}

export class PodRunner extends PodRunnerParams {
  podName: string
  running: boolean

  constructor(params: PodRunnerParams) {
    super()

    const spec = params.pod.spec

    if (!spec.containers || spec.containers.length === 0) {
      throw new PluginError(`Pod spec for PodRunner must contain at least one container`, {
        spec,
      })
    }

    Object.assign(this, params)

    this.podName = this.pod.metadata.name
  }

  getFullCommand() {
    return [...(this.pod.spec.containers[0].command || []), ...(this.pod.spec.containers[0].args || [])]
  }

  getMainContainerName() {
    return this.pod.spec.containers[0].name
  }

  private prepareLogsFollower(params: RunParams) {
    const { log, tty, events } = params
    const stream = new Stream<RunLogEntry>()
    void stream.forEach((entry) => {
      const { msg, timestamp } = entry
      events.emit("log", { timestamp, data: Buffer.from(msg) })
      if (tty) {
        process.stdout.write(`${entry.msg}\n`)
      }
    })
    return new K8sLogFollower({
      defaultNamespace: this.namespace,
      retryIntervalMs: 10,
      stream,
      log,
      entryConverter: makeRunLogEntry,
      resources: [this.pod],
      k8sApi: this.api,
    })
  }

  /**
   * Runs the Pod, waits for it to terminate, and returns the result. Throws if the Pod never successfully starts.
   * Returns the logs for the first container in the Pod. Returns success=false if Pod exited with non-zero code.
   *
   * If tty=true, we attach to the process stdio during execution.
   */
  async runAndWait(params: RunParams): Promise<RunAndWaitResult> {
    const { log, remove, timeoutSec, tty } = params

    const startedAt = new Date()
    const logsFollower = this.prepareLogsFollower(params)
    const limitBytes = 1000 * 1024 // 1MB
    logsFollower.followLogs({ limitBytes }).catch((_err) => {
      // Errors in `followLogs` are logged there, so all we need to do here is to ensure that the follower is closed.
      logsFollower.close()
    })

    try {
      await this.createPod({ log, tty })

      // Wait until main container terminates
      const exitCode = await this.awaitRunningPod(startedAt, timeoutSec)

      // Retrieve logs after run
      const mainContainerLogs = await this.getMainContainerLogs()

      return {
        command: this.getFullCommand(),
        startedAt,
        completedAt: new Date(),
        log: mainContainerLogs,
        exitCode,
        success: exitCode === 0,
      }
    } finally {
      logsFollower.close()
      if (remove) {
        await this.stop()
      }
    }
  }

  private async awaitRunningPod(startedAt: Date, timeoutSec: number | undefined): Promise<number | undefined> {
    const { namespace, podName } = this
    const mainContainerName = this.getMainContainerName()

    while (true) {
      const serverPod = await this.api.core.readNamespacedPodStatus(podName, namespace)
      const state = checkPodStatus(serverPod)

      const mainContainerStatus = (serverPod.status.containerStatuses || []).find((s) => s.name === mainContainerName)
      const terminated = mainContainerStatus?.state?.terminated
      const exitReason = terminated?.reason
      const exitCode = terminated?.exitCode

      const errorDetails: PodErrorDetails = {
        logs: await this.getMainContainerLogs(),
        exitCode,
        containerStatus: mainContainerStatus,
        podStatus: serverPod.status,
      }

      // We've seen instances where Pods are OOMKilled but the exit code is 0 and the state that
      // Garden computes is "stopped". However, in those instances the exitReason is still "OOMKilled"
      // and we handle that case specifically here.
      if (exitCode === 137 || exitReason === "OOMKilled") {
        throw new OutOfMemoryError("Pod container was OOMKilled.", errorDetails)
      }

      if (state === "unhealthy") {
        if (
          exitCode !== undefined &&
          exitCode < 127 &&
          exitReason !== "ContainerCannotRun" &&
          exitReason !== "StartError"
        ) {
          // Successfully ran the command in the main container, but returned non-zero exit code.
          // Consider it as a task execution error inside the Pod.
          throw new PodRunnerError(`Command exited with code ${exitCode}.`, errorDetails)
        } else {
          throw new PodRunnerError(`Failed to start Pod ${podName}.`, errorDetails)
        }
      }

      // reason "Completed" means main container is done, but sidecars or other containers possibly still alive
      if (state === "stopped" || exitReason === "Completed") {
        if (!!exitCode) {
          throw new PodRunnerError(`Command exited with code ${exitCode}.`, errorDetails)
        }
        return exitCode
      }

      const elapsed = (new Date().getTime() - startedAt.getTime()) / 1000

      if (timeoutSec && elapsed > timeoutSec) {
        throw new TimeoutError(`Command timed out after ${timeoutSec} seconds.`, errorDetails)
      }

      await sleep(800)
    }
  }

  /**
   * Starts the Pod and leaves it running. Use this along with the `exec()` method when you need to run multiple
   * commands in the same Pod. Note that you *must manually call `stop()`* when you're done. Otherwise the Pod will
   * stay running in the cluster until the process exits.
   */
  async start({ log, timeoutSec = KUBECTL_DEFAULT_TIMEOUT }: StartParams) {
    const { ctx, provider, pod, namespace } = this

    await this.createPod({ log, tty: false })

    // Wait for Pod to be ready
    const statuses = await waitForResources({ namespace, ctx, provider, resources: [pod], log, timeoutSec })

    return { status: statuses[0] as ResourceStatus<V1Pod> }
  }

  /**
   * Executes a command in the running Pod. Must be called after `start()`.
   */
  async exec(params: ExecParams) {
    const { command, containerName: container, timeoutSec, tty = false, log, buffer = true } = params
    let { stdout, stderr, stdin } = params

    if (tty) {
      if (stdout) {
        stdout.pipe(process.stdout)
      } else {
        stdout = process.stdout
      }
      if (stderr) {
        stderr.pipe(process.stderr)
      } else {
        stderr = process.stderr
      }

      stdin = process.stdin
    }

    const startedAt = new Date()
    const containerName = container || this.pod.spec.containers[0].name

    log.debug(`Execing command in ${this.namespace}/Pod/${this.podName}/${containerName}: ${command.join(" ")}`)

    const result = await this.api.execInPod({
      namespace: this.namespace,
      podName: this.podName,
      containerName,
      command,
      stdout,
      stderr,
      buffer,
      stdin,
      tty,
      timeoutSec,
    })

    if (result.timedOut) {
      const errorDetails: PodErrorDetails = { logs: result.allLogs }
      throw new TimeoutError(`Command timed out after ${timeoutSec} seconds.`, errorDetails)
    }

    if (result.exitCode === 137) {
      const errorDetails: PodErrorDetails = {
        logs: await this.getMainContainerLogs(),
        exitCode: result.exitCode,
      }
      throw new OutOfMemoryError("Pod container was OOMKilled.", errorDetails)
    }

    if (result.exitCode !== 0) {
      const errorDetails: PodErrorDetails = {
        logs: result.allLogs,
        exitCode: result.exitCode,
      }
      throw new PodRunnerError(`Command exited with code ${result.exitCode}.`, errorDetails)
    }

    return {
      command,
      startedAt,
      completedAt: new Date(),
      log: (result.stdout + result.stderr).trim(),
      exitCode: result.exitCode,
      success: result.exitCode === 0,
    }
  }

  async getLogs() {
    const { api, namespace, pod } = this

    return getPodLogs({
      api,
      namespace,
      pod,
    })
  }

  async getMainContainerLogs(): Promise<string> {
    const mainContainerName = this.getMainContainerName()
    try {
      const allLogs = await this.getLogs()
      const containerLogs = allLogs.find((l) => l.containerName === mainContainerName)?.log?.trim()
      return containerLogs || ""
    } catch (err) {
      return `[Could not retrieve logs for container '${mainContainerName}': ${
        err.message || "unknown error occurred"
      }]`
    }
  }

  /**
   * Removes the Pod from the cluster, if it's running. You can safely call this even
   * if the process is no longer active.
   */
  async stop() {
    try {
      await this.api.core.deleteNamespacedPod(this.podName, this.namespace, undefined, undefined, 0)
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err
      }
    }
  }

  private async createPod({ log, tty }: { log: LogEntry; tty: boolean }) {
    const command = this.getFullCommand()
    log.verbose(`Starting Pod ${this.podName} with command '${command.join(" ")}'`)

    const pod = cloneDeep(this.pod)

    if (tty) {
      // Need to be sure container is attachable
      pod.spec.containers[0].stdin = true
      pod.spec.containers[0].stdinOnce = true
      pod.spec.containers[0].tty = true
    }

    // We never want to restart containers in these ephemeral pods
    pod.spec.restartPolicy = "Never"

    try {
      await this.api.createPod(this.namespace, pod)
    } catch (error) {
      throw new PodRunnerError(`Failed to create Pod ${this.podName}: ${error.message}`, { error })
    }
  }

  async handlePodError({
    err,
    command,
    startedAt,
    version,
    moduleName,
  }: {
    err: any
    command: string[]
    startedAt: Date
    version: string
    moduleName
  }) {
    const errorDetail = <PodErrorDetails>err.detail
    // Error detail may already contain container logs
    const logs = errorDetail.logs || (await this.getMainContainerLogs())

    const renderError = (error: any, podErrorDetails: PodErrorDetails) => {
      switch (error.type) {
        // The pod container exceeded its memory limits
        case "out-of-memory":
          return err.message + (logs ? ` Here are the logs until the out-of-memory event occurred:\n\n${logs}` : "")
        // Command timed out
        case "timeout":
          return err.message + (logs ? ` Here are the logs until the timeout occurred:\n\n${logs}` : "")
        // Command exited with non-zero code
        case "pod-runner":
          let errorDesc = error.message + "\n"

          const terminated = podErrorDetails.containerStatus?.state?.terminated
          const podStatus = podErrorDetails.podStatus

          if (!!terminated) {
            let terminationDesc = ""
            if (!!terminated.exitCode) {
              terminationDesc += `Exited with code: ${terminated.exitCode}. `
            }
            if (!!terminated.signal) {
              terminationDesc += `Stopped with signal: ${terminated.signal}. `
            }
            terminationDesc += `Reason: ${terminated.reason || "unknown"}. `
            terminationDesc += `Message: ${terminated.message || "n/a"}.`
            terminationDesc = terminationDesc.trim()

            if (!!terminationDesc) {
              errorDesc += terminationDesc + "\n"
            }
          } else if (!!podStatus) {
            const podStatusDesc = "PodStatus:\n" + JSON.stringify(podStatus, null, 2)
            errorDesc += podStatusDesc + "\n"
          }

          if (!!logs) {
            errorDesc += `Here are the logs until the error occurred:\n\n${logs}`
          }

          return errorDesc
        // Unknown/unexpected error, rethrow it
        default:
          throw err
      }
    }

    const log = renderError(err, errorDetail)
    return {
      log,
      moduleName,
      version,
      success: false,
      startedAt,
      completedAt: new Date(),
      command,
      exitCode: errorDetail.exitCode,
    }
  }
}
