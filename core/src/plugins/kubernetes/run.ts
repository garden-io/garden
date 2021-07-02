/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import tar from "tar"
import tmp from "tmp-promise"
import { cloneDeep, omit, pick } from "lodash"
import { V1PodSpec, V1Pod, V1Container } from "@kubernetes/client-node"
import { RunResult } from "../../types/plugin/base"
import { GardenModule } from "../../types/module"
import { LogEntry } from "../../logger/log-entry"
import {
  PluginError,
  GardenBaseError,
  TimeoutError,
  RuntimeError,
  ConfigurationError,
  ParameterError,
  OutOfMemoryError,
} from "../../exceptions"
import { KubernetesProvider } from "./config"
import { Writable, Readable, PassThrough } from "stream"
import { uniqByName, sleep } from "../../util/util"
import { KubeApi } from "./api"
import { getPodLogs, checkPodStatus } from "./status/pod"
import { KubernetesResource, KubernetesPod } from "./types"
import { RunModuleParams } from "../../types/plugin/module/runModule"
import { ContainerEnvVars, ContainerResourcesSpec, ContainerVolumeSpec } from "../container/config"
import { prepareEnvVars, makePodName } from "./util"
import { deline } from "../../util/string"
import { ArtifactSpec } from "../../config/validation"
import cpy from "cpy"
import { prepareImagePullSecrets } from "./secrets"
import { configureVolumes } from "./container/deployment"
import { PluginContext } from "../../plugin-context"
import { waitForResources, ResourceStatus } from "./status/status"
import { RuntimeContext } from "../../runtime-context"
import { getResourceRequirements } from "./container/util"

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

export const runContainerExcludeFields: (keyof V1Container)[] = ["readinessProbe", "livenessProbe"]

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
}: RunModuleParams<GardenModule> & {
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
  })

  if (!podName) {
    podName = makePodName("run", module.name)
  }

  const outputStream = new PassThrough()

  outputStream.on("error", () => {})
  outputStream.on("data", (data: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().getTime(), data })
  })

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
    stdout: outputStream,
    stderr: outputStream,
  }

  if (getArtifacts) {
    return runWithArtifacts({
      ...runParams,
      mainContainerName,
      artifacts,
      artifactsPath: artifactsPath!,
      description,
      errorMetadata,
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
}): Promise<V1PodSpec> {
  // Prepare environment variables
  envVars = { ...runtimeContext.envVars, ...envVars }
  const env = uniqByName([
    ...prepareEnvVars(envVars),
    // If `container` is specified, include its variables as well
    ...(container && container.env ? container.env : []),
  ])

  const resourceRequirements = resources ? { resources: getResourceRequirements(resources) } : {}

  const containers: V1Container[] = [
    {
      ...omit(container || {}, runContainerExcludeFields),
      ...resourceRequirements,
      // We always override the following attributes
      name: mainContainerName,
      image,
      env,
      // TODO: consider supporting volume mounts in ad-hoc runs (would need specific logic and testing)
      volumeMounts: [],
    },
  ]

  const imagePullSecrets = await prepareImagePullSecrets({ api, provider, namespace, log })

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

async function runWithoutArtifacts({
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
  stdout,
  stderr,
  namespace,
  interactive,
  version,
}: RunModuleParams<GardenModule> & {
  api: KubeApi
  provider: KubernetesProvider
  podSpec: V1PodSpec
  podName: string
  stdout: Writable
  stderr: Writable
  namespace: string
  version: string
}): Promise<RunResult> {
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

  let result: RunResult
  const startedAt = new Date()

  try {
    const res = await runner.runAndWait({
      log,
      remove: true,
      timeoutSec: timeout || defaultTimeout,
      tty: !!interactive,
      stdout,
      stderr,
    })
    result = {
      ...res,
      moduleName: module.name,
      version,
    }
  } catch (err) {
    if (err.type === "out-of-memory" || err.type === "timeout") {
      // Command timed out or the pod container exceeded its memory limits
      const errorLog =
        err.type === "out-of-memory" ? makeOutOfMemoryErrorLog(err.detail.logs) : makeTimeOutErrorLog(err.detail.logs)
      result = {
        log: errorLog,
        moduleName: module.name,
        version,
        success: false,
        startedAt,
        completedAt: new Date(),
        command: runner.getFullCommand(),
      }
    } else if (err.type === "pod-runner") {
      // Command exited with non-zero code
      result = {
        log: err.detail.logs || err.message,
        moduleName: module.name,
        version,
        success: false,
        startedAt,
        completedAt: new Date(),
        command: [...(command || []), ...(args || [])],
      }
    } else {
      throw err
    }
  }

  return result
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
}: RunModuleParams<GardenModule> & {
  podSpec: V1PodSpec
  podName: string
  mainContainerName: string
  api: KubeApi
  provider: KubernetesProvider
  artifacts: ArtifactSpec[]
  artifactsPath: string
  description?: string
  errorMetadata: any
  stdout: Writable
  stderr: Writable
  namespace: string
  version: string
}): Promise<RunResult> {
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
      const res = await runner.exec({
        // Pipe the output from the command to the /tmp/output pipe, including stderr. Some shell voodoo happening
        // here, but this was the only working approach I could find after a lot of trial and error.
        command: ["sh", "-c", `exec >/tmp/output; ${cmd.join(" ")}`],
        containerName: mainContainerName,
        log,
        stdout,
        stderr,
        timeoutSec,
        buffer: true,
      })
      result = {
        ...res,
        log: (await runner.getMainContainerLogs()).trim() || res.log,
        moduleName: module.name,
        version,
      }
    } catch (err) {
      const res = err.detail.result

      if (err.type === "out-of-memory" || err.type === "timeout") {
        // Command timed out or the pod container exceeded its memory limits
        const containerLogs = (await runner.getMainContainerLogs()).trim()
        const errorLog =
          err.type === "out-of-memory" ? makeOutOfMemoryErrorLog(containerLogs) : makeTimeOutErrorLog(containerLogs)
        result = {
          log: errorLog,
          moduleName: module.name,
          version,
          success: false,
          startedAt,
          completedAt: new Date(),
          command: cmd,
        }
      } else if (err.type === "pod-runner" && res && res.exitCode) {
        // Command exited with non-zero code
        result = {
          log: (await runner.getMainContainerLogs()).trim() || err.message,
          moduleName: module.name,
          version,
          success: false,
          startedAt,
          completedAt: new Date(),
          command: cmd,
        }
      } else {
        throw err
      }
    }

    // Copy the artifacts
    await Promise.all(
      artifacts.map(async (artifact) => {
        const tmpDir = await tmp.dir({ unsafeCleanup: true })
        // Remove leading slash (which is required in the schema)
        const sourcePath = artifact.source.slice(1)
        const targetPath = resolve(artifactsPath, artifact.target || ".")

        const tarCmd = [
          "tar",
          "-c", // create an archive
          "-f",
          "-", // pipe to stdout
          // Files to match. The .DS_Store file is a trick to avoid errors when no files are matched. The file is
          // ignored later when copying from the temp directory. See https://github.com/sindresorhus/cpy#ignorejunk
          `$(ls ${sourcePath} 2>/dev/null) /tmp/.DS_Store`,
          // Fix issue https://github.com/garden-io/garden/issues/2445
          "| cat",
        ]

        try {
          await new Promise<void>((_resolve, reject) => {
            // Create an extractor to receive the tarball we will stream from the container
            // and extract to the artifacts directory.
            let done = 0

            const extractor = tar.x({
              cwd: tmpDir.path,
              strict: true,
              onentry: (entry) => log.debug("tar: got file " + entry.path),
            })

            extractor.on("end", () => {
              // Need to make sure both processes are complete before resolving (may happen in either order)
              done++
              done === 2 && _resolve()
            })
            extractor.on("error", (err) => {
              reject(err)
            })

            // Tarball the requested files and stream to the above extractor.
            runner
              .exec({
                command: ["sh", "-c", "cd / && touch /tmp/.DS_Store && " + tarCmd.join(" ")],
                containerName: mainContainerName,
                log,
                stdout: extractor,
                timeoutSec,
                buffer: false,
              })
              .then(() => {
                // Need to make sure both processes are complete before resolving (may happen in either order)
                done++
                done === 2 && _resolve()
              })
              .catch(reject)
          })

          // Copy the resulting files to the artifacts directory
          try {
            await cpy("**/*", targetPath, { cwd: tmpDir.path, ignoreJunk: true })
          } catch (err) {
            // Ignore error thrown when the directory is empty
            if (err.name !== "CpyError" || !err.message.includes("the file doesn't exist")) {
              throw err
            }
          }
        } finally {
          await tmpDir.cleanup()
        }
      })
    )
  } finally {
    await runner.stop()
  }

  return result
}
function makeTimeOutErrorLog(containerLogs: string) {
  return (
    "Command timed out." + (containerLogs ? ` Here are the logs until the timeout occurred:\n\n${containerLogs}` : "")
  )
}

function makeOutOfMemoryErrorLog(containerLogs?: string) {
  return (
    "The Pod container was OOMKilled." +
    (containerLogs ? ` Here are the logs until the out-of-memory event occurred:\n\n${containerLogs}` : "")
  )
}

class PodRunnerParams {
  ctx: PluginContext
  annotations?: { [key: string]: string }
  api: KubeApi
  pod: KubernetesPod
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
  stdout?: Writable
  stderr?: Writable
  stdin?: Readable
  remove: boolean
  tty: boolean
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

  /**
   * Runs the Pod, waits for it to terminate, and returns the result. Throws if the Pod never successfully starts.
   * Returns the logs for the first container in the Pod. Returns success=false if Pod exited with non-zero code.
   *
   * If tty=true, we attach to the process stdio during execution.
   */
  async runAndWait(params: RunParams): Promise<RunAndWaitResult> {
    const { log, remove, timeoutSec, tty } = params
    let { stdout, stderr, stdin } = params
    const { namespace, podName } = this

    const startedAt = new Date()
    let success = true
    let attached = false
    let mainContainerLogs = ""
    const mainContainerName = this.getMainContainerName()

    if (tty) {
      if (stdout || stderr || stdin) {
        throw new ParameterError(`Cannot set both tty and stdout/stderr/stdin streams`, { params })
      }

      stdout = process.stdout
      stderr = process.stderr
      stdin = process.stdin
    }

    const getDebugLogs = async () => {
      try {
        return this.getMainContainerLogs()
      } catch (err) {
        return ""
      }
    }

    try {
      await this.createPod({ log, tty })

      // Wait until main container terminates
      while (true) {
        const serverPod = await this.api.core.readNamespacedPodStatus(podName, namespace)
        const state = checkPodStatus(serverPod)

        const mainContainerStatus = (serverPod.status.containerStatuses || []).find((s) => s.name === mainContainerName)
        const terminated = mainContainerStatus?.state?.terminated
        const exitReason = terminated?.reason
        const exitCode = terminated?.exitCode

        // We've seen instances were Pods are OOMKilled but the exit code is 0 and the state that
        // Garden computes is "stopped". However in those instances the exitReason is still "OOMKilled"
        // and we handle that case specifically here.
        if (exitCode === 137 || exitReason === "OOMKilled") {
          const msg = `Pod container was OOMKilled.`
          throw new OutOfMemoryError(msg, {
            logs: (await getDebugLogs()) || msg,
            serverPod,
          })
        }

        if (state === "unhealthy") {
          if (
            exitCode !== undefined &&
            exitCode < 127 &&
            exitReason !== "ContainerCannotRun" &&
            exitReason !== "StartError"
          ) {
            // Successfully ran the command in the main container, but returned non-zero exit code
            success = false
            break
          }

          const statusStr = terminated
            ? `${terminated.reason} - ${terminated.message}`
            : "Status:\n" + JSON.stringify(serverPod.status, null, 2)

          throw new PodRunnerError(`Failed to start Pod ${podName}. ${statusStr}`, {
            logs: statusStr,
            exitCode,
            pod: serverPod,
          })
        }

        // reason "Completed" means main container is done, but sidecars or other containers possibly still alive
        if (state === "stopped" || exitReason === "Completed") {
          success = exitCode === 0
          break
        }

        if (!attached && (tty || stdout || stderr)) {
          // Try to attach to Pod to stream logs
          try {
            await this.api.attachToPod({
              namespace,
              podName,
              containerName: mainContainerName,
              stdout,
              stderr,
              stdin,
              tty,
            })
            attached = true
          } catch (err) {
            // Ignore errors when attaching, we'll just keep trying
          }
        }

        const elapsed = (new Date().getTime() - startedAt.getTime()) / 1000

        if (timeoutSec && elapsed > timeoutSec) {
          const msg = `Command timed out after ${timeoutSec} seconds.`
          throw new TimeoutError(msg, {
            logs: (await getDebugLogs()) || msg,
            serverPod,
          })
        }

        await sleep(200)
      }

      // Retrieve logs after run
      mainContainerLogs = await this.getMainContainerLogs()
    } finally {
      if (remove) {
        await this.stop()
      }
    }

    return {
      command: this.getFullCommand(),
      startedAt,
      completedAt: new Date(),
      log: mainContainerLogs,
      success,
    }
  }

  /**
   * Starts the Pod and leaves it running. Use this along with the `exec()` method when you need to run multiple
   * commands in the same Pod. Note that you *must manually call `stop()`* when you're done. Otherwise the Pod will
   * stay running in the cluster until the process exits.
   */
  async start({ log, timeoutSec }: StartParams) {
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
      if (stdout || stderr || stdin) {
        throw new ParameterError(`Cannot set both tty and stdout/stderr/stdin streams`, { params })
      }

      stdout = process.stdout
      stderr = process.stderr
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
      throw new TimeoutError(`Command timed out after ${timeoutSec} seconds.`, {
        result,
        logs: result.allLogs,
      })
    }

    if (result.exitCode !== 0) {
      throw new PodRunnerError(`Command exited with code ${result.exitCode}:\n${result.allLogs}`, {
        result,
        logs: result.allLogs,
      })
    }

    return {
      command,
      startedAt,
      completedAt: new Date(),
      log: result.stdout + result.stderr,
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

  async getMainContainerLogs() {
    const allLogs = await this.getLogs()
    return allLogs.find((l) => l.containerName === this.getMainContainerName())?.log || ""
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
}
