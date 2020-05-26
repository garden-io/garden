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
import { tailString } from "../../util/string"
import { RunResult } from "../../types/plugin/base"
import { kubectl } from "./kubectl"
import { Module } from "../../types/module"
import { LogEntry } from "../../logger/log-entry"
import { PluginError, GardenBaseError, TimeoutError, RuntimeError, ConfigurationError } from "../../exceptions"
import { KubernetesProvider } from "./config"
import { Writable } from "stream"
import { ChildProcess } from "child_process"
import { sleep, uniqByName } from "../../util/util"
import { KubeApi } from "./api"
import { checkPodStatus, getPodLogs } from "./status/pod"
import { KubernetesServerResource } from "./types"
import { ServiceState } from "../../types/service"
import { RunModuleParams } from "../../types/plugin/module/runModule"
import { ContainerEnvVars, ContainerVolumeSpec } from "../container/config"
import { prepareEnvVars, makePodName } from "./util"
import { deline } from "../../util/string"
import { ArtifactSpec } from "../../config/validation"
import cpy from "cpy"
import { prepareImagePullSecrets } from "./secrets"
import { configureVolumes } from "./container/deployment"

const MAX_BUFFER_SIZE = 1024 * 1024

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
}: RunModuleParams<Module> & {
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
  const api = await KubeApi.factory(log, provider)

  // Prepare environment variables
  envVars = { ...runtimeContext.envVars, ...envVars }
  const env = uniqByName([
    ...prepareEnvVars(envVars),
    // If `container` is specified, include its variables as well
    ...(container && container.env ? container.env : []),
  ])

  const getArtifacts = !interactive && artifacts && artifacts.length > 0 && artifactsPath
  const mainContainerName = "main"

  const spec: V1PodSpec = {
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
    configureVolumes(module, spec, volumes)
  }

  if (!description) {
    description = `Container module '${module.name}'`
  }

  const errorMetadata: any = { moduleName: module.name, description, args, artifacts }

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
    spec.containers[0].command = ["sh", "-c", "mkfifo /tmp/output && cat /tmp/output && sleep 86400"]
  } else {
    if (args) {
      spec.containers[0].args = args
    }
    if (command) {
      spec.containers[0].command = command
    }
  }

  if (!podName) {
    podName = makePodName("run", module.name)
  }

  const runner = new PodRunner({
    api,
    podName,
    provider,
    image,
    module,
    namespace,
    spec,
  })

  let result: RunResult
  const startedAt = new Date()

  // Need to retrieve the logs explicitly, because kubectl exec/run sometimes fail to capture them
  const getLogs = async () => {
    const containerLogs = await getPodLogs({
      api,
      namespace,
      podName: runner.podName,
      containerNames: [mainContainerName],
    })
    return containerLogs[0].log
  }

  const timedOutResult = async () => {
    const logs = (await getLogs()).trim()

    return {
      command: runner.getFullCommand(),
      completedAt: new Date(),
      log: "Command timed out." + (logs ? ` Here are the logs until the timeout occurred:\n\n${logs.trim()}` : ""),
      moduleName: module.name,
      startedAt,
      success: false,
      version: module.version.versionString,
    }
  }

  if (getArtifacts) {
    try {
      // Start the Pod
      const { pod, state, debugLog } = await runner.start({
        ignoreError: true,
        log,
        stdout,
        stderr,
      })

      errorMetadata.pod = pod
      errorMetadata.state = state
      errorMetadata.debugLog = debugLog

      if (state !== "ready") {
        // Specifically look for error indicating `sh` is missing, and report with helpful message.
        const containerStatus = pod!.status.containerStatuses![0]

        if (containerStatus?.state?.terminated?.message?.includes("not found")) {
          throw new ConfigurationError(
            deline`
              ${description} specifies artifacts to export, but the image doesn't
              contain the sh binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need to
              be installed in the image.`,
            errorMetadata
          )
        } else {
          throw new RuntimeError(`Failed to start Pod ${runner.podName}: ${debugLog}`, errorMetadata)
        }
      }

      try {
        await runner.exec({
          command: ["sh", "-c", "tar --help"],
          container: mainContainerName,
          ignoreError: false,
          log,
          stdout,
          stderr,
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
      const cmd = [...command!, ...(args || [])].map((s) => JSON.stringify(s)).join(" ")

      try {
        result = await runner.exec({
          // Pipe the output from the command to the /tmp/output pipe, including stderr. Some shell voodoo happening
          // here, but this was the only working approach I could find after a lot of trial and error.
          command: ["sh", "-c", `exec >/tmp/output; ${cmd}`],
          container: mainContainerName,
          ignoreError: true,
          log,
          stdout,
          stderr,
          timeout,
        })
        result.log = (await getLogs()).trim() || result.log
      } catch (err) {
        if (err.type === "timeout") {
          result = await timedOutResult()
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
          const targetPath = resolve(artifactsPath!, artifact.target || ".")

          const tarCmd = [
            "tar",
            "-c", // create an archive
            "-f",
            "-", // pipe to stdout
            // Files to match. The .DS_Store file is a trick to avoid errors when no files are matched. The file is
            // ignored later when copying from the temp directory. See https://github.com/sindresorhus/cpy#ignorejunk
            `$(ls ${sourcePath} 2>/dev/null) .DS_Store`,
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
                  command: ["sh", "-c", "cd / && touch .DS_Store && " + tarCmd.join(" ")],
                  container: mainContainerName,
                  ignoreError: false,
                  log,
                  stdout: extractor,
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
  } else {
    try {
      result = await runner.startAndWait({
        interactive,
        ignoreError: true,
        log,
        remove: false,
        timeout,
      })
      result.log = (await getLogs()).trim() || result.log
    } catch (err) {
      if (err.type === "timeout") {
        result = await timedOutResult()
      } else {
        throw err
      }
    } finally {
      // Make sure Pod is cleaned up
      await runner.stop()
    }
  }

  return result
}

class PodRunnerParams {
  annotations?: { [key: string]: string }
  api: KubeApi
  image: string
  module: Module
  namespace: string
  podName: string
  provider: KubernetesProvider
  spec: V1PodSpec
}

interface StartParams {
  ignoreError?: boolean
  input?: Buffer | string
  log: LogEntry
  stdout?: Writable
  stderr?: Writable
  timeout?: number
}

type ExecParams = StartParams & {
  command: string[]
  container?: string
  ignoreError?: boolean
}

type StartAndWaitParams = StartParams & {
  interactive: boolean
  remove?: boolean
}

class PodRunnerError extends GardenBaseError {
  type = "PodRunner"
}

export class PodRunner extends PodRunnerParams {
  proc: ChildProcess

  constructor(params: PodRunnerParams) {
    super()

    const spec = params.spec

    if (!spec.containers || spec.containers.length === 0) {
      throw new PluginError(`Pod spec for PodRunner must contain at least one container`, {
        spec,
      })
    }

    Object.assign(this, params)
  }

  getFullCommand() {
    return [...(this.spec.containers[0].command || []), ...(this.spec.containers[0].args || [])]
  }

  /**
   * Starts the Pod, attaches to it, and waits for a result. Use this if you just need to start a Pod
   * and get its output, and for interactive sessions.
   */
  async startAndWait({
    log,
    ignoreError,
    interactive,
    stdout,
    remove = true,
    timeout,
  }: StartAndWaitParams): Promise<RunResult> {
    const { module, spec } = this

    if (interactive) {
      spec.containers[0].stdin = true
      spec.containers[0].stdinOnce = true
      spec.containers[0].tty = true
    }

    const kubecmd = [...this.getBaseRunArgs(), interactive ? "--tty" : "--quiet"]

    if (remove) {
      kubecmd.push("--rm")
    }

    const command = this.getFullCommand()
    log.verbose(`Running '${command.join(" ")}' in Pod ${this.podName}`)

    const startedAt = new Date()

    // TODO: use API library
    const res = await kubectl.spawnAndWait({
      log,
      provider: this.provider,
      namespace: this.namespace,
      ignoreError,
      args: kubecmd,
      stdout,
      timeout,
      tty: interactive,
    })

    return {
      moduleName: module.name,
      command,
      version: module.version.versionString,
      startedAt,
      completedAt: new Date(),
      log: res.all,
      success: res.code === 0,
    }
  }

  /**
   * Starts the Pod and leaves it running. Use this along with the `exec()` method when you need to run multiple
   * commands in the same Pod. Note that you *must manually call `stop()`* when you're done. Otherwise the Pod will
   * stay running in the cluster until the process exits.
   */
  async start({ log, ignoreError, stdout, stderr, timeout }: StartParams) {
    const { spec } = this

    const kubecmd = [...this.getBaseRunArgs(), "--quiet"]

    const command = [...(spec.containers[0].command || []), ...(spec.containers[0].args || [])]
    log.verbose(`Starting Pod ${this.podName} with command '${command.join(" ")}'`)

    // TODO: use API directly
    this.proc = await kubectl.spawn({
      log,
      provider: this.provider,
      namespace: this.namespace,
      args: kubecmd,
      stdout,
      stderr,
    })

    let debugLog = ""
    this.proc.stdout!.on("data", (data) => (debugLog += data))
    this.proc.stderr!.on("data", (data) => (debugLog += data))

    const start = new Date().getTime()
    let pod: KubernetesServerResource<V1Pod> | undefined
    let state: ServiceState = "missing"

    // Wait for Pod to be ready
    while (true) {
      await sleep(250)

      try {
        pod = await this.api.core.readNamespacedPod(this.podName, this.namespace)
      } catch (err) {
        if (err.statusCode === 404) {
          if (this.proc.killed) {
            if (ignoreError) {
              break
            }
            throw new RuntimeError(`Failed to start Pod ${this.podName}: ${debugLog}`, {
              podName: this.podName,
              log: debugLog,
            })
          }
          // Pod isn't ready
          continue
        }
      }

      state = checkPodStatus(pod!)

      if (state === "ready") {
        break
      } else if (state === "unhealthy") {
        if (ignoreError) {
          break
        }
        throw new RuntimeError(`Failed to start Pod ${this.podName}: ${debugLog}`, { pod })
      }

      if (timeout && new Date().getTime() - start > timeout) {
        throw new TimeoutError(`Timed out waiting for Pod ${this.podName} to start: ${debugLog}`, {
          podName: this.podName,
          log: debugLog,
        })
      }
    }

    return { proc: this.proc, pod, state, debugLog }
  }

  async spawn(params: ExecParams) {
    const { log, command, container, ignoreError, input, stdout, stderr, timeout } = params

    if (!this.proc) {
      throw new PodRunnerError(`Attempting to spawn a command in Pod before starting it`, { command })
    }

    // TODO: use API library
    const args = ["exec", "-i", this.podName, "-c", container || this.spec.containers[0].name, "--", ...command]

    const startedAt = new Date()

    const proc = await kubectl.spawn({
      args,
      namespace: this.namespace,
      ignoreError,
      input,
      log,
      provider: this.provider,
      stdout,
      stderr,
      timeout,
    })

    let result: string = ""

    return new Promise((_resolve, reject) => {
      proc.on("close", (code) => {
        if (code === 0) {
          _resolve({
            moduleName: this.module.name,
            command,
            version: this.module.version.versionString,
            startedAt,
            completedAt: new Date(),
            log: result,
            success: code === 0,
          })
        }

        reject(
          new RuntimeError(`Failed to spawn kubectl process with code ${code}`, {
            code,
          })
        )
      })

      proc.on("error", (err) => {
        !proc.killed && proc.kill()
        throw err
      })

      proc.stdout!.on("data", (s) => {
        result = tailString(result + s, MAX_BUFFER_SIZE, true)
      })

      stdout && proc.stdout?.pipe(stdout)
      stderr && proc.stderr?.pipe(stderr)
    })
  }

  /**
   * Executes a command in the running Pod. Must be called after `start()`.
   */
  async exec(params: ExecParams) {
    const { log, command, container, ignoreError, input, stdout, stderr, timeout } = params

    if (!this.proc) {
      throw new PodRunnerError(`Attempting to exec a command in Pod before starting it`, { command })
    }

    // TODO: use API library
    const args = ["exec", "-i", this.podName, "-c", container || this.spec.containers[0].name, "--", ...command]

    const startedAt = new Date()

    const res = await kubectl.exec({
      args,
      namespace: this.namespace,
      ignoreError,
      input,
      log,
      provider: this.provider,
      stdout,
      stderr,
      timeout,
    })

    if (res.timedOut) {
      throw new TimeoutError("Command timed out.", { error: res })
    }

    return {
      moduleName: this.module.name,
      command,
      version: this.module.version.versionString,
      startedAt,
      completedAt: new Date(),
      log: res.stdout + res.stderr,
      success: res.exitCode === 0,
    }
  }

  /**
   * Disconnects from a connected Pod (if any) and removes it from the cluster. You can safely call this even
   * if the process is no longer active.
   */
  async stop() {
    if (this.proc) {
      delete this.proc
    }

    try {
      await this.api.core.deleteNamespacedPod(this.podName, this.namespace, undefined, undefined, 0)
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err
      }
    }
  }

  private getBaseRunArgs() {
    const { spec } = this

    const overrides: any = {
      metadata: {
        annotations: {
          // Workaround to make sure sidecars are not injected,
          // due to https://github.com/kubernetes/kubernetes/issues/25908
          "sidecar.istio.io/inject": "false",
          ...(this.annotations || {}),
        },
      },
      spec,
    }

    return [
      "run",
      this.podName || makePodName("run", this.module.name),
      `--image=${this.image}`,
      "--restart=Never",
      // Need to attach to get the log output and exit code.
      "-i",
      // This is a little messy, but it works...
      "--overrides",
      `${JSON.stringify(overrides)}`,
    ]
  }
}
