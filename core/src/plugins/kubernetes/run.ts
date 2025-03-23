/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tar from "tar"
import tmp from "tmp-promise"
import cloneDeep from "fast-copy"
import { max, omit, pick, some } from "lodash-es"
import type { Log } from "../../logger/log-entry.js"
import type { CoreV1Event } from "@kubernetes/client-node"
import type { GardenErrorParams } from "../../exceptions.js"
import { PluginError, GardenError, RuntimeError, ConfigurationError } from "../../exceptions.js"
import type { KubernetesProvider } from "./config.js"
import type { Writable, Readable } from "stream"
import { PassThrough } from "stream"
import { uniqByName, sleep } from "../../util/util.js"
import type { ExecInPodResult } from "./api.js"
import { KubeApi, KubernetesError } from "./api.js"
import { getPodLogs, checkPodStatus } from "./status/pod.js"
import type { KubernetesResource, KubernetesPod, KubernetesServerResource, SupportedRuntimeAction } from "./types.js"
import type { ContainerEnvVars, ContainerResourcesSpec, ContainerVolumeSpec } from "../container/config.js"
import { prepareEnvVars, makePodName, renderWorkloadEvents, sanitizeVolumesForPodRunner } from "./util.js"
import { dedent, deline, randomString } from "../../util/string.js"
import type { ArtifactSpec } from "../../config/validation.js"
import { prepareSecrets } from "./secrets.js"
import { configureVolumes } from "./container/deployment.js"
import type { PluginContext, PluginEventBroker, PluginEventLogContext } from "../../plugin-context.js"
import type { ResourceStatus } from "./status/status.js"
import { waitForResources, DeploymentResourceStatusError } from "./status/status.js"
import { getResourceRequirements, getSecurityContext } from "./container/util.js"
import { KUBECTL_DEFAULT_TIMEOUT } from "./kubectl.js"
import fsExtra from "fs-extra"

const { copy } = fsExtra
import type { PodLogEntryConverter, PodLogEntryConverterParams } from "./logs.js"
import { K8sLogFollower } from "./logs.js"
import { Stream } from "ts-stream"
import type { V1PodSpec, V1Container, V1Pod, V1ContainerStatus, V1PodStatus } from "@kubernetes/client-node"
import type { RunResult } from "../../plugin/base.js"
import { LogLevel } from "../../logger/logger.js"
import { getResourceEvents } from "./status/events.js"
import stringify from "json-stringify-safe"
import { commandListToShellScript } from "../../util/escape.js"
import { maybeSecret, type MaybeSecret, transformSecret } from "../../util/secrets.js"

// ref: https://kubernetes.io/docs/reference/labels-annotations-taints/#kubectl-kubernetes-io-default-container
export const K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY = "kubectl.kubernetes.io/default-container"

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

interface BaseRunAndCopyParams {
  command?: string[]
  args: string[]
  interactive: boolean
  timeout: number
}

// TODO: jfc this function signature stinks like all hell - JE
export async function runAndCopy({
  ctx,
  log,
  action,
  args,
  command,
  interactive,
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
  volumes,
  privileged,
  addCapabilities,
  dropCapabilities,
}: BaseRunAndCopyParams & {
  ctx: PluginContext
  log: Log
  action: SupportedRuntimeAction
  image: string
  container?: V1Container
  podName?: string
  podSpec?: V1PodSpec
  artifacts?: ArtifactSpec[]
  artifactsPath: string
  envVars?: ContainerEnvVars
  resources?: ContainerResourcesSpec
  description?: string
  namespace: string
  volumes?: ContainerVolumeSpec[]
  privileged?: boolean
  addCapabilities?: string[]
  dropCapabilities?: string[]
}): Promise<RunResult> {
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  const getArtifacts = artifacts.length > 0
  const mainContainerName = "main"

  if (!description) {
    description = action.longDescription()
  }

  podSpec = await prepareRunPodSpec({
    podSpec,
    getArtifacts,
    log,
    action,
    args,
    command,
    api,
    provider,
    envVars,
    resources,
    description: description || "",
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
    podName = makePodName("run", action.name)
  }

  const runParams = {
    ctx,
    api,
    provider,
    log,
    podData: {
      podSpec,
      podName,
      namespace,
    },
    run: {
      args,
      command,
      interactive,
      timeout,
    },
  }

  if (getArtifacts) {
    const logEventContext = {
      // XXX command cannot be possibly undefined, can it?
      origin: command ? command[0] : "unknown command",
      log: log.createLog({ fixLevel: LogLevel.verbose }),
    }

    const outputStream = new PassThrough()
    outputStream.on("error", () => {})
    outputStream.on("data", (data: Buffer) => {
      ctx.events.emit("log", {
        level: "verbose",
        timestamp: new Date().toISOString(),
        msg: data.toString(),
        ...logEventContext,
      })
    })

    return runWithArtifacts({
      ...runParams,
      mainContainerName,
      artifacts,
      artifactsPath,
      description,
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
  action,
  args,
  command,
  envVars,
  resources,
  description,
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
  log: Log
  action: SupportedRuntimeAction
  args: string[]
  command: string[] | undefined
  api: KubeApi
  provider: KubernetesProvider
  envVars: ContainerEnvVars
  resources?: ContainerResourcesSpec
  description: string
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
  envVars = { ...action.getEnvVars(), ...envVars }
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
    },
  ]

  const imagePullSecrets = await prepareSecrets({ api, namespace, secrets: provider.config.imagePullSecrets, log })
  await prepareSecrets({ api, namespace, secrets: provider.config.copySecrets, log })

  const preparedPodSpec = {
    ...pick(podSpec || {}, runPodSpecIncludeFields),
    containers,
    imagePullSecrets,
  }

  // This logic is only relevant for `container` Runs and Tests
  if (volumes && volumes.length && action.type === "container") {
    configureVolumes(action, preparedPodSpec, volumes)
  } else {
    sanitizeVolumesForPodRunner(preparedPodSpec, container)
  }

  if (getArtifacts) {
    if (!command) {
      throw new ConfigurationError({
        message: deline`
        ${description} specifies artifacts to export, but doesn't
        explicitly set a \`command\`. The kubernetes provider currently requires an explicit command to be set for
        tests and tasks that export artifacts, because the image's entrypoint cannot be inferred in that execution
        mode. Please set the \`command\` field and try again.
        `,
      })
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
  podData,
}: {
  ctx: PluginContext
  timeout?: number
  api: KubeApi
  provider: KubernetesProvider
  podData: PodData
}) {
  const { namespace, podName, podSpec } = podData

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
  podData,
  run,
}: {
  ctx: PluginContext
  log: Log
  api: KubeApi
  provider: KubernetesProvider
  podData: PodData
  run: BaseRunAndCopyParams
}): Promise<RunResult> {
  const { timeout: timeoutSec, interactive } = run

  const { runner } = getPodResourceAndRunner({
    ctx,
    api,
    provider,
    podData,
  })

  let result: RunResult
  const startedAt = new Date()

  try {
    const res = await runner.runAndWait({
      log,
      remove: true,
      events: ctx.events,
      timeoutSec,
      tty: interactive,
      throwOnExitCode: true,
    })
    result = {
      ...res,
    }
  } catch (err) {
    if (!(err instanceof GardenError)) {
      throw err
    }
    result = runner.handlePodError({
      err,
      startedAt,
    })
  }

  return result
}

/**
 * Wraps a given {@code cmd} into a script to redirect its stdout and stderr to the same tmp file.
 * See https://stackoverflow.com/a/20564208
 * @param cmd the command to wrap
 */
function getCommandExecutionScript(cmd: MaybeSecret[]) {
  return maybeSecret`
exec 1<&-
exec 2<&-
exec 1<>/tmp/output
exec 2>&1

${commandListToShellScript({ command: cmd })}
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
function getArtifactsTarScript(artifacts: ArtifactSpec[]) {
  const directoriesToCreate = artifacts.map((a) => a.target).filter((target) => !!target && target !== ".")
  const tmpPath = commandListToShellScript({ command: ["/tmp/.garden-artifacts-" + randomString(8)] })

  const createDirectoriesCommands = directoriesToCreate.map((target) =>
    commandListToShellScript({ command: ["mkdir", "-p", target] })
  )

  const copyArtifactsCommands = artifacts.map(({ source, target }) => {
    const escapedTarget = commandListToShellScript({ command: [target || "."] })

    // Allow globs (*) in the source path
    // Note: This works because `commandListToShellScript` wraps every parameter in single quotes, escaping contained single quotes.
    // The string `bin/*` will be transformed to `'bin/*'` by `commandListToShellScript`. The shell would treat `*` as literal and not expand it.
    // `replaceAll` transforms that string then to `'bin/'*''`, which allows the shell to expand the glob, everything else is treated as literal.
    const escapedSource = transformSecret(commandListToShellScript({ command: [source] }), (s) =>
      s.replaceAll("*", "'*'")
    )

    return maybeSecret`cp -r ${escapedSource} ${escapedTarget} >/dev/null || true`
  })

  return maybeSecret`
rm -rf ${tmpPath} >/dev/null || true
mkdir -p ${tmpPath}
cd ${tmpPath}
touch .garden-placeholder
${createDirectoriesCommands.join("\n")}
${copyArtifactsCommands.join("\n")}
tar -c -z -f - . | cat
rm -rf ${tmpPath} >/dev/null || true
`
}

async function runWithArtifacts({
  ctx,
  api,
  provider,
  log,
  mainContainerName,
  artifacts,
  artifactsPath,
  description,
  stdout,
  stderr,
  podData,
  run,
}: {
  ctx: PluginContext
  log: Log
  mainContainerName: string
  api: KubeApi
  provider: KubernetesProvider
  artifacts: ArtifactSpec[]
  artifactsPath: string
  description?: string
  stdout: Writable
  stderr: Writable
  podData: PodData
  run: BaseRunAndCopyParams
}): Promise<RunResult> {
  const { args, command, timeout: timeoutSec } = run

  const { runner } = getPodResourceAndRunner({
    ctx,
    api,
    provider,
    podData,
  })

  let result: RunResult
  const startedAt = new Date()

  try {
    // Start the Pod
    try {
      await runner.start({ log, timeoutSec })
    } catch (err) {
      if (!(err instanceof DeploymentResourceStatusError)) {
        throw err
      }

      // Specifically look for deployment error indicating `sh` is missing, and report with more helpful message.
      const status = err.status

      if (status.state !== "ready") {
        const containerStatus = status.resource.status.containerStatuses![0]
        const message = containerStatus?.state?.terminated?.message || containerStatus?.state?.waiting?.message

        if (message?.includes("not found")) {
          throw new ConfigurationError({
            message: deline`
              ${description} specifies artifacts to export, but the image doesn't
              contain the sh binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need to
              be installed in the image.

              Original error message:
              ${message}`,
          })
        } else {
          throw new RuntimeError({
            message: `Failed to start Pod ${runner.podName}: ${stringify(status.resource.status, null, 2)}`,
          })
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
        // Anything above 10 minutes for this would be unusual
        timeoutSec: 600,
        buffer: true,
      })
    } catch (err) {
      if (err instanceof PodRunnerWorkloadError && err.details.exitCode === 127) {
        throw new ConfigurationError({
          message: deline`
        ${description} specifies artifacts to export, but the image doesn't
        contain the tar binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need to
        be installed in the image.`,
          wrappedErrors: [err],
        })
      } else {
        throw err
      }
    }

    try {
      const res = await runner.exec({
        // Pipe the output from the command to the /tmp/output pipe, including stderr. Some shell voodoo happening
        // here, but this was the only working approach I could find after a lot of trial and error.
        command: ["sh", "-c", getCommandExecutionScript([...command!, ...(args || [])])],
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
      }
    } catch (err) {
      if (!(err instanceof GardenError)) {
        throw err
      }
      result = runner.handlePodError({
        err,
        startedAt,
      })
    }

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
            command: ["sh", "-c", getArtifactsTarScript(artifacts)],
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
        if (!(err instanceof Error)) {
          throw err
        }
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

type PodRunnerParams = {
  ctx: PluginContext
  logEventContext?: PluginEventLogContext
  annotations?: { [key: string]: string }
  api: KubeApi
  pod: KubernetesPod | KubernetesServerResource<V1Pod>
  namespace: string
  provider: KubernetesProvider
}

interface StartParams {
  log: Log
  timeoutSec?: number
}

export type PodRunnerExecParams = StartParams & {
  command: MaybeSecret[]
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
  throwOnExitCode?: boolean
}

type PodRunnerDetailsParams = { details: PodErrorDetails }
type PodRunnerErrorParams = GardenErrorParams & PodRunnerDetailsParams

export abstract class PodRunnerError extends GardenError {
  type = "pod-runner"

  details: PodErrorDetails

  constructor({ message, details }: PodRunnerErrorParams) {
    super({
      message,
    })
    this.details = details
  }
}

class PodRunnerWorkloadError extends PodRunnerError {
  override type = "pod-runner-exit-code"

  constructor({ message, details }: PodRunnerErrorParams) {
    let errorDesc = message + "\n\n"

    const containerState = details.containerStatus?.state
    const terminatedContainerState = containerState?.terminated

    if (!!terminatedContainerState) {
      let terminationDesc = ""
      if (!!terminatedContainerState.exitCode && !message.includes(`${terminatedContainerState.exitCode}`)) {
        terminationDesc += `Exited with code: ${terminatedContainerState.exitCode}. `
      }
      if (!!terminatedContainerState.signal) {
        terminationDesc += `Stopped with signal: ${terminatedContainerState.signal}. `
      }
      if (terminatedContainerState.reason && terminatedContainerState.reason !== "Error") {
        terminationDesc += `Reason: ${terminatedContainerState.reason}. `
      }
      if (terminatedContainerState.message) {
        terminationDesc += `Message: ${terminatedContainerState.message}.`
      }
      terminationDesc = terminationDesc.trim()

      if (!!terminationDesc) {
        errorDesc += terminationDesc + "\n\n"
      }
    }

    if (details.logs) {
      errorDesc += `Here are the logs until the error occurred:\n\n${details.logs}`
    }

    super({
      message: errorDesc,
      details,
    })
  }
}

class PodRunnerOutOfMemoryError extends PodRunnerError {
  override type = "pod-runner-oom"

  constructor({ message, details }: PodRunnerErrorParams) {
    const logsMessage = details.logs
      ? ` Here are the logs until the out-of-memory event occurred:\n\n${details.logs}`
      : ""
    super({
      message: `${message}${logsMessage}`,
      details,
    })
  }
}

class PodRunnerNotFoundError extends PodRunnerError {
  override type = "pod-runner-not-found"

  constructor({ details }: PodRunnerDetailsParams) {
    const events = details.podEvents

    super({
      message: dedent`
        There are several different possible causes for Pod disruptions.

        You can read more about the topic in the Kubernetes documentation:
        https://kubernetes.io/docs/concepts/workloads/pods/disruptions/\n\n
        ${renderWorkloadEvents(events || [], "Pod", details.podName)}
      `,
      details,
    })
  }
}

export class PodRunnerTimeoutError extends PodRunnerError {
  override type = "pod-runner-timeout"

  //
  constructor({ message, details }: PodRunnerErrorParams) {
    const logsMessage = details.logs ? ` Here are the logs until the timeout occurred:\n\n${details.logs}` : ""
    super({
      message: `${message}${logsMessage}`,
      details,
    })
  }
}

interface RunAndWaitResult {
  command: string[]
  startedAt: Date
  completedAt: Date
  log: string
  success: boolean
  exitCode?: number
}

export interface PodErrorDetails {
  podName: string
  logs?: string
  // optional details
  exitCode?: number
  containerStatus?: V1ContainerStatus
  podStatus?: V1PodStatus
  result?: ExecInPodResult
  podEvents?: CoreV1Event[]
}

export class PodRunner {
  podName: string

  ctx: PluginContext
  logEventContext?: PluginEventLogContext
  annotations?: { [key: string]: string }
  api: KubeApi
  pod: KubernetesPod | KubernetesServerResource<V1Pod>
  namespace: string
  provider: KubernetesProvider

  constructor(params: PodRunnerParams) {
    const { ctx, logEventContext, annotations, api, pod, namespace, provider } = params

    this.ctx = ctx
    this.logEventContext = logEventContext
    this.annotations = annotations
    this.api = api
    this.pod = pod
    this.namespace = namespace
    this.provider = provider

    const spec = params.pod.spec

    if (!spec.containers || spec.containers.length === 0) {
      throw new PluginError({
        message: `Pod spec for PodRunner must contain at least one container`,
      })
    }

    this.podName = this.pod.metadata.name
    this.logEventContext = params.logEventContext
  }

  getFullCommand() {
    return [...(this.pod.spec.containers[0].command || []), ...(this.pod.spec.containers[0].args || [])]
  }

  getMainContainerName() {
    return this.pod.spec.containers[0].name
  }

  private prepareLogsFollower(params: RunParams) {
    const { log, tty, events } = params

    const logEventContext = this.logEventContext
      ? this.logEventContext
      : {
          origin: this.getFullCommand()[0]!,
          log: log.createLog({ fixLevel: LogLevel.verbose }),
        }

    const stream = new Stream<RunLogEntry>()
    void stream.forEach(
      (entry) => {
        const { msg, timestamp } = entry
        let isoTimestamp: string
        try {
          if (timestamp) {
            isoTimestamp = timestamp.toISOString()
          } else {
            isoTimestamp = new Date().toISOString()
          }
        } catch {
          isoTimestamp = new Date().toISOString()
        }
        events.emit("log", {
          level: "verbose",
          timestamp: isoTimestamp,
          msg,
          ...logEventContext,
        })
        if (tty) {
          process.stdout.write(`${entry.msg}\n`)
        }
      },
      (err) => {
        if (err) {
          log.error(`Error while following logs: ${err}`)
        }
      }
    )
    return new K8sLogFollower({
      defaultNamespace: this.namespace,
      // We use 1 second in the PodRunner, because the task / test will only finish once the LogFollower finished.
      // If this is too low, we waste resources (network/cpu) – if it's too high we add extra time to the run execution.
      retryIntervalMs: 1000,
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
   *
   * @throws {PodRunnerError}
   * @throws {KubernetesError}
   */
  async runAndWait(params: RunParams): Promise<RunAndWaitResult> {
    const { log, remove, tty } = params

    const startedAt = new Date()
    const logsFollower = this.prepareLogsFollower(params)
    logsFollower.followLogs({}).catch((_err) => {
      // Errors in `followLogs` are logged there, so all we need to do here is to ensure that the follower is closed.
      logsFollower.close()
    })

    try {
      const startTime = new Date(Date.now())
      await this.createPod({ log, tty })

      // Wait until main container terminates
      const exitCode = await this.awaitRunningPod(params, startedAt)

      // the Pod might have been killed – if the process exits with code zero when
      // receiving SIGINT, we might not notice if we don't double check this.
      await this.throwIfPodKilled(startTime)

      // Retrieve logs after run
      const mainContainerLogs = await this.getMainContainerLogs()

      return {
        command: this.getFullCommand(),
        startedAt,
        completedAt: new Date(),
        log: mainContainerLogs,
        exitCode,
        success: exitCode === undefined || exitCode === 0,
      }
    } finally {
      log.debug("Closing logsFollower...")
      await logsFollower.closeAndFlush()
      if (remove) {
        log.debug("Stopping PodRunner")
        await this.stop()
      }
    }
  }

  /**
   * @throws {PodRunnerError}
   * @throws {KubernetesError}
   */
  private async awaitRunningPod(params: RunParams, startedAt: Date): Promise<number | undefined> {
    const { timeoutSec, throwOnExitCode } = params
    const { namespace, podName } = this
    const mainContainerName = this.getMainContainerName()

    const notFoundErrorDetails = async (): Promise<PodErrorDetails> => {
      let podEvents: CoreV1Event[] | undefined
      try {
        podEvents = await getResourceEvents(this.api, this.pod)
      } catch (e) {
        podEvents = undefined
      }
      return {
        podEvents,
        podName: this.podName,
      }
    }

    while (true) {
      let serverPod: KubernetesServerResource<V1Pod>
      try {
        serverPod = await this.api.core.readNamespacedPodStatus({ name: podName, namespace })
      } catch (e) {
        if (e instanceof KubernetesError) {
          // if the pod has been deleted during execution we might run into a 404 error.
          // Convert it to PodRunnerNotFoundError and fetch the logs for more details.
          if (e.responseStatusCode === 404) {
            throw new PodRunnerNotFoundError({
              details: await notFoundErrorDetails(),
            })
          }
        }

        throw e
      }

      const state = checkPodStatus(serverPod)

      const mainContainerStatus = (serverPod.status.containerStatuses || []).find((s) => s.name === mainContainerName)
      const terminated = mainContainerStatus?.state?.terminated
      const exitReason = terminated?.reason
      const exitCode = terminated?.exitCode

      const podErrorDetails = async (): Promise<PodErrorDetails> => ({
        logs: await this.getMainContainerLogs(),
        exitCode,
        containerStatus: mainContainerStatus,
        podStatus: serverPod.status,
        podName: this.podName,
      })

      // We've seen instances where Pods are OOMKilled but the exit code is 0 and the state that
      // Garden computes is "stopped". However, in those instances the exitReason is still "OOMKilled"
      // and we handle that case specifically here.
      if (exitCode === 137 || exitReason === "OOMKilled") {
        throw new PodRunnerOutOfMemoryError({
          message: "Pod container was OOMKilled.",
          details: await podErrorDetails(),
        })
      }

      if (state === "unhealthy") {
        if (
          exitCode !== undefined &&
          exitCode < 127 &&
          exitReason !== "ContainerCannotRun" &&
          exitReason !== "StartError"
        ) {
          // Successfully ran the command in the main container, but returned non-zero exit code.
          if (throwOnExitCode === true) {
            // Consider it as a task execution error inside the Pod.
            throw new PodRunnerWorkloadError({
              message: `Failed with exit code ${exitCode}.`,
              details: await podErrorDetails(),
            })
          } else {
            return exitCode
          }
        } else if (exitCode === 127) {
          throw new PodRunnerWorkloadError({
            message: `Failed with error "command not found". Is there a typo in the task or test spec?`,
            details: await podErrorDetails(),
          })
        } else {
          throw new PodRunnerWorkloadError({
            message: `Failed to start Pod ${podName}.`,
            details: await podErrorDetails(),
          })
        }
      }

      // reason "Completed" means main container is done, but sidecars or other containers possibly still alive
      if (state === "stopped" || exitReason === "Completed") {
        if (exitCode !== undefined && exitCode !== 0) {
          if (throwOnExitCode === true) {
            throw new PodRunnerWorkloadError({
              message: `Failed with exit code ${exitCode}.`,
              details: await podErrorDetails(),
            })
          } else {
            return exitCode
          }
        }
        return exitCode
      }

      const elapsed = (new Date().getTime() - startedAt.getTime()) / 1000

      if (timeoutSec && elapsed > timeoutSec) {
        throw new PodRunnerTimeoutError({
          message: `Command timed out after ${timeoutSec} seconds.`,
          details: await podErrorDetails(),
        })
      }

      await sleep(800)
    }
  }

  /**
   * Starts the Pod and leaves it running. Use this along with the {@link #exec()} method when you need to run multiple
   * commands in the same Pod. Note that you *must manually call {@link #stop()}* when you're done.
   * Otherwise, the Pod will stay running in the cluster until the process exits.
   */
  async start({ log, timeoutSec = KUBECTL_DEFAULT_TIMEOUT }: StartParams) {
    const { ctx, provider, pod, namespace } = this

    await this.createPod({ log, tty: false })

    // Wait for Pod to be ready
    const statuses = await waitForResources({
      namespace,
      waitForJobs: false,
      ctx,
      provider,
      resources: [pod],
      log,
      timeoutSec,
    })

    return { status: statuses[0] as ResourceStatus<V1Pod> }
  }

  /**
   * Executes a command in the running Pod. Must be called after {@link start()}.
   *
   * @throws {PodRunnerError}
   * @throws {KubernetesError}
   */
  async exec(params: PodRunnerExecParams) {
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
    let containerName = container
    if (!containerName) {
      // if no container name is specified, check if the Pod has annotation kubectl.kubernetes.io/default-container
      const defaultAnnotationContainer = this.pod.metadata.annotations
        ? this.pod.metadata.annotations[K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY]
        : undefined

      if (defaultAnnotationContainer) {
        containerName = defaultAnnotationContainer
        if (this.pod.spec.containers.length > 1) {
          log.info(
            // in case there are more than 1 containers and exec picks container with annotation
            `Defaulted container ${containerName} due to the annotation ${K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY}.`
          )
        }
      } else {
        containerName = this.pod.spec.containers[0].name
        if (this.pod.spec.containers.length > 1) {
          const allContainerNames = this.pod.spec.containers.map((c) => c.name)
          log.info(`Defaulted container ${containerName} out of: ${allContainerNames.join(", ")}.`)
        }
      }
    }

    const events = await getResourceEvents(this.api, this.pod)
    const lastEventTime = max(events.map((e) => e.lastTimestamp))

    log.debug(`Execing command in ${this.namespace}/Pod/${this.podName}/${containerName}: ${command.join(" ")}`)

    const result = await this.api.execInPod({
      log,
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

    const collectLogs = async () => result.allLogs || (await this.getMainContainerLogs())

    if (result.timedOut) {
      const errorDetails: PodErrorDetails = { logs: await collectLogs(), result, podName: this.podName }
      throw new PodRunnerTimeoutError({
        message: `Command timed out after ${timeoutSec} seconds.`,
        details: errorDetails,
      })
    }

    if (result.exitCode === 137) {
      const errorDetails: PodErrorDetails = {
        logs: await collectLogs(),
        exitCode: result.exitCode,
        podName: this.podName,
        result,
      }
      throw new PodRunnerOutOfMemoryError({ message: "Pod container was OOMKilled.", details: errorDetails })
    }

    // the Pod might have been killed – if the process exits with code zero when
    // receiving SIGINT, we might not notice if we don't double check this.
    await this.throwIfPodKilled(lastEventTime)

    if (result.exitCode !== 0) {
      const errorDetails: PodErrorDetails = {
        logs: await collectLogs(),
        exitCode: result.exitCode,
        podName: this.podName,
        result,
      }
      throw new PodRunnerWorkloadError({ message: `Failed with exit code ${result.exitCode}.`, details: errorDetails })
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

  /**
   * Helper to detect pod disruption, and throw NotFoundError in case the Pod has been evicted
   *
   * @param lastEventTime Don't just use new Date() as the timezone might differ between client and server. Get the max
   *        lastEventTime from the events returned by `getResourceEvents` and pass that as the parameter here.
   * @throws NotFoundError
   */
  private async throwIfPodKilled(lastEventTime: Date | undefined): Promise<void> {
    const events = (await getResourceEvents(this.api, this.pod)).filter((e) => {
      if (!e.lastTimestamp) {
        // we ignore all events without lastTimestamp as that could lead to permanently unusable Pods.
        return false
      }

      if (lastEventTime) {
        // only consider events that happened after the last event we've seen
        return e.lastTimestamp > lastEventTime
      } else {
        // we consider all events, as there were no previous events
        return true
      }
    })

    if (some(events, (event) => event.reason === "Killing")) {
      const details: PodErrorDetails = { podEvents: events, podName: this.podName }
      throw new PodRunnerNotFoundError({ details })
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
      return `[Could not retrieve logs for container '${mainContainerName}': ${err}]`
    }
  }

  /**
   * Removes the Pod from the cluster, if it's running. You can safely call this even
   * if the process is no longer active.
   */
  async stop() {
    try {
      await this.api.core.deleteNamespacedPod({ name: this.podName, namespace: this.namespace, gracePeriodSeconds: 0 })
    } catch (err) {
      if (!(err instanceof KubernetesError)) {
        throw err
      }
      if (err.responseStatusCode !== 404) {
        throw err
      }
    }
  }

  /**
   * Sets TTY settings for Pod and creates it.
   * @throws {KubernetesError}
   */
  private async createPod({ log, tty }: { log: Log; tty: boolean }) {
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

    await this.api.createPod(this.namespace, pod)
  }

  handlePodError({ err, startedAt }: { err: GardenError; startedAt: Date }): RunResult {
    let message: string
    let diagnosticErrorMsg: string | undefined
    let exitCode: number | undefined

    if (err instanceof KubernetesError) {
      throw new KubernetesError({
        message: dedent`
          Unable to start command execution. Failed to initiate a runner pod with error:
          ${err.message}

          Please check the cluster health and network connectivity.
      `,
      })
    } else if (err instanceof PodRunnerWorkloadError || err instanceof PodRunnerTimeoutError) {
      // If we return here, we'll throw TestFailedError or TaskFailedError down the line, which should only be thrown if the actual test failed.
      // In all other failure conditions, we want to throw and the original error incl. stack trace to bubble up.
      message = err.message
      exitCode = err.details.exitCode

      if (err.details.podStatus) {
        diagnosticErrorMsg = `PodStatus:\n${stringify(err.details.podStatus, null, 2)}`
      }
    } else {
      throw err
    }

    return {
      log: message,
      diagnosticErrorMsg,
      success: false,
      startedAt,
      completedAt: new Date(),
      exitCode,
    }
  }
}
