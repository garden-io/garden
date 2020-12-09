/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import tar from "tar"
import tmp from "tmp-promise"
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
} from "../../exceptions"
import { KubernetesProvider } from "./config"
import { Writable, Readable } from "stream"
import { uniqByName, sleep } from "../../util/util"
import { KubeApi } from "./api"
import { getPodLogs, checkPodStatus } from "./status/pod"
import { KubernetesResource, KubernetesPod } from "./types"
import { RunModuleParams } from "../../types/plugin/module/runModule"
import { ContainerEnvVars, ContainerVolumeSpec } from "../container/config"
import { prepareEnvVars, makePodName } from "./util"
import { deline } from "../../util/string"
import { ArtifactSpec } from "../../config/validation"
import cpy from "cpy"
import { prepareImagePullSecrets } from "./secrets"
import { configureVolumes } from "./container/deployment"
import { PluginContext } from "../../plugin-context"
import { waitForResources, ResourceStatus } from "./status/status"
import { cloneDeep } from "lodash"

// Default timeout for individual run/exec operations
const defaultTimeout = 600

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
  artifacts = [],
  artifactsPath,
  envVars = {},
  description,
  stdout,
  stderr,
  namespace,
  volumes,
}: RunModuleParams<GardenModule> & {
  image: string
  container?: V1Container
  podName?: string
  artifacts?: ArtifactSpec[]
  artifactsPath?: string
  envVars?: ContainerEnvVars
  description?: string
  stdout?: Writable
  stderr?: Writable
  namespace: string
  volumes?: ContainerVolumeSpec[]
}): Promise<RunResult> {
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  // Prepare environment variables
  envVars = { ...runtimeContext.envVars, ...envVars }
  const env = uniqByName([
    ...prepareEnvVars(envVars),
    // If `container` is specified, include its variables as well
    ...(container && container.env ? container.env : []),
  ])

  const getArtifacts = !interactive && artifacts && artifacts.length > 0 && artifactsPath
  const mainContainerName = "main"

  const podSpec: V1PodSpec = {
    containers: [
      {
        ...(container || {}),
        // We always override the following attributes
        name: mainContainerName,
        image,
        env,
        // TODO: consider supporting volume mounts in ad-hoc runs (would need specific logic and testing)
        volumeMounts: [],
      },
    ],
    imagePullSecrets: await prepareImagePullSecrets({ api, provider, namespace, log }),
  }

  if (volumes) {
    configureVolumes(module, podSpec, volumes)
  }

  if (!description) {
    description = `Container module '${module.name}'`
  }

  const errorMetadata: any = { moduleName: module.name, description, args, artifacts }

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
  }

  if (getArtifacts) {
    return runWithArtifacts({
      ...runParams,
      mainContainerName,
      artifacts,
      artifactsPath: artifactsPath!,
      description,
      errorMetadata,
      stdout,
      stderr,
    })
  } else {
    return runWithoutArtifacts(runParams)
  }
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
  namespace,
  interactive,
}: RunModuleParams<GardenModule> & {
  api: KubeApi
  provider: KubernetesProvider
  podSpec: V1PodSpec
  podName: string
  namespace: string
}): Promise<RunResult> {
  if (args) {
    podSpec.containers[0].args = args
  }
  if (command) {
    podSpec.containers[0].command = command
  }

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

  const timedOutResult = (logs: string) => {
    return {
      command: runner.getFullCommand(),
      completedAt: new Date(),
      log: "Command timed out." + (logs ? ` Here are the logs until the timeout occurred:\n\n${logs}` : ""),
      moduleName: module.name,
      startedAt,
      success: false,
      version: module.version.versionString,
    }
  }

  try {
    const res = await runner.runAndWait({
      log,
      remove: true,
      timeoutSec: timeout || defaultTimeout,
      tty: !!interactive,
    })
    result = {
      ...res,
      moduleName: module.name,
      version: module.version.versionString,
    }
  } catch (err) {
    if (err.type === "timeout") {
      result = timedOutResult(err.detail.logs)
    } else if (err.type === "pod-runner") {
      // Command exited with non-zero code
      result = {
        log: err.detail.logs || err.message,
        moduleName: module.name,
        version: module.version.versionString,
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
  stdout?: Writable
  stderr?: Writable
  namespace: string
}): Promise<RunResult> {
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
  podSpec.containers[0].command = ["sh", "-c", "mkfifo /tmp/output && cat /tmp/output && sleep 86400"]

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

  const timedOutResult = (logs: string) => {
    return {
      command: runner.getFullCommand(),
      completedAt: new Date(),
      log: "Command timed out." + (logs ? ` Here are the logs until the timeout occurred:\n\n${logs}` : ""),
      moduleName: module.name,
      startedAt,
      success: false,
      version: module.version.versionString,
    }
  }

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
      })
      result = {
        ...res,
        log: (await runner.getMainContainerLogs()).trim() || res.log,
        moduleName: module.name,
        version: module.version.versionString,
      }
    } catch (err) {
      const res = err.detail.result

      if (err.type === "timeout") {
        // Command timed out
        result = timedOutResult((await runner.getMainContainerLogs()).trim())
      } else if (err.type === "pod-runner" && res && res.exitCode) {
        // Command exited with non-zero code
        result = {
          log: (await runner.getMainContainerLogs()).trim() || err.message,
          moduleName: module.name,
          version: module.version.versionString,
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
        ]

        try {
          await new Promise((_resolve, reject) => {
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

    params.pod.metadata.annotations = {
      ...(params.pod.metadata.annotations || {}),
      // Workaround to make sure sidecars are not injected,
      // due to https://github.com/kubernetes/kubernetes/issues/25908
      "sidecar.istio.io/inject": "false",
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

      // Wait until Pod terminates
      while (true) {
        const serverPod = await this.api.core.readNamespacedPodStatus(podName, namespace)
        const state = checkPodStatus(serverPod)

        const mainContainerStatus = (serverPod.status.containerStatuses || []).find((s) => s.name === mainContainerName)
        const terminated = mainContainerStatus?.state?.terminated
        const exitReason = terminated?.reason
        const exitCode = terminated?.exitCode

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

        if (state === "stopped") {
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
    const { command, containerName: container, timeoutSec, tty = false } = params
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

    const result = await this.api.execInPod({
      namespace: this.namespace,
      podName: this.podName,
      containerName: container || this.pod.spec.containers[0].name,
      command,
      stdout,
      stderr,
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
