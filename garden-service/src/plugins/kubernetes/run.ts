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
import { kubectl } from "./kubectl"
import { Module } from "../../types/module"
import { LogEntry } from "../../logger/log-entry"
import { PluginError, GardenBaseError, TimeoutError, RuntimeError, ConfigurationError } from "../../exceptions"
import { KubernetesProvider } from "./config"
import { Writable } from "stream"
import { ChildProcess } from "child_process"
import { sleep, uniqByName } from "../../util/util"
import { KubeApi } from "./api"
import { checkPodStatus } from "./status/pod"
import { KubernetesServerResource } from "./types"
import { ServiceState } from "../../types/service"
import { RunModuleParams } from "../../types/plugin/module/runModule"
import { ContainerEnvVars } from "../container/config"
import { getAppNamespace } from "./namespace"
import { prepareEnvVars, makePodName } from "./util"
import { deline } from "../../util/string"
import { ArtifactSpec } from "../../config/validation"
import cpy from "cpy"

export async function runAndCopy({
  ctx,
  log,
  module,
  args,
  command,
  ignoreError,
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
}): Promise<RunResult> {
  const provider = <KubernetesProvider>ctx.provider
  const namespace = await getAppNamespace(ctx, log, provider)

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
  }

  if (!description) {
    description = `Container module '${module.name}'`
  }

  const errorMetadata = { moduleName: module.name, description, args, artifacts }

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

    // We start the container and let it run while we execute the target command, and then copy the artifacts
    spec.containers[0].command = ["sh", "-c", "sleep 86400"]
  } else {
    if (args) {
      spec.containers[0].args = args
    }
    if (command) {
      spec.containers[0].command = command
    }
  }

  const api = await KubeApi.factory(log, provider)

  if (!podName) {
    podName = makePodName("run", module.name, Math.round(new Date().getTime()).toString())
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

  if (getArtifacts) {
    const tmpDir = await tmp.dir({ unsafeCleanup: true })

    try {
      // Start the Pod
      const { pod, state } = await runner.start({
        ignoreError: true,
        log,
        stdout,
        stderr,
      })

      if (state === "unhealthy") {
        // Specifically look for error indicating `sh` is missing, and report with helpful message.
        const containerStatus = pod!.status.containerStatuses![0]

        // FIXME: use optional chaining when TS 3.7 is out
        if (
          containerStatus &&
          containerStatus.state &&
          containerStatus.state.terminated &&
          containerStatus.state.terminated.message &&
          containerStatus.state.terminated.message.includes("not found")
        ) {
          throw new ConfigurationError(
            deline`
              ${description} specifies artifacts to export, but the image doesn't
              contain the sh binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need to
              be installed in the image.`,
            errorMetadata
          )
        }
      }

      if (state !== "ready") {
        throw new RuntimeError(`Failed to start Pod ${runner.podName}`, errorMetadata)
      }

      try {
        await runner.exec({
          command: ["sh", "-c", "tar --help"],
          container: spec.containers[0].name,
          ignoreError: false,
          log,
          stdout,
          stderr,
        })
      } catch (err) {
        // TODO: fall back to copying `arc` into the container and using that
        // (tar is not static so we can't copy that directly)
        throw new ConfigurationError(
          deline`
          ${description} specifies artifacts to export, but the image doesn't
          contain the tar binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need to
          be installed in the image.`,
          errorMetadata
        )
      }

      result = await runner.exec({
        command: [...command!, ...(args || [])],
        container: spec.containers[0].name,
        ignoreError: true,
        log,
        stdout,
        stderr,
      })

      // Copy the artifacts
      await Promise.all(
        artifacts.map(async (artifact) => {
          // Remove leading slash (which is required in the schema)
          const sourcePath = artifact.source.slice(1)
          const targetPath = resolve(artifactsPath!, artifact.target || ".")

          const tarCmd = [
            "tar",
            "-c", // create an archive
            "-f",
            "-", // pipe to stdout
            sourcePath, // files to match
          ]

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
                command: ["sh", "-c", "cd / && " + tarCmd.join(" ")],
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
          await cpy(sourcePath, targetPath, { cwd: tmpDir.path })
        })
      )
    } finally {
      await tmpDir.cleanup()
      await runner.stop({ log })
    }
  } else {
    result = await runner.startAndWait({
      interactive,
      ignoreError: !!ignoreError,
      log,
      timeout,
    })
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

interface StopParams {
  log: LogEntry
}

interface StartParams {
  ignoreError?: boolean
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

  /**
   * Starts the Pod, attaches to it, and waits for a result. Use this if you just need to start a Pod
   * and get its output, and for interactive sessions.
   */
  async startAndWait({
    log,
    ignoreError,
    interactive,
    stdout: outputStream,
    timeout,
  }: StartAndWaitParams): Promise<RunResult> {
    const { module, spec } = this

    if (interactive) {
      spec.containers[0].stdin = true
      spec.containers[0].stdinOnce = true
      spec.containers[0].tty = true
    }

    const kubecmd = [...this.getBaseRunArgs(), "--rm", interactive ? "--tty" : "--quiet"]

    const command = [...(spec.containers[0].command || []), ...(spec.containers[0].args || [])]
    log.verbose(`Running '${command.join(" ")}' in Pod ${this.podName}`)

    const startedAt = new Date()

    // TODO: use API library
    const res = await kubectl.spawnAndWait({
      log,
      provider: this.provider,
      namespace: this.namespace,
      ignoreError,
      args: kubecmd,
      stdout: outputStream,
      timeout,
      tty: interactive,
    })

    return {
      moduleName: module.name,
      command,
      version: module.version.versionString,
      startedAt,
      completedAt: new Date(),
      log: res.output + res.stderr,
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
        if (err.code === 404) {
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
        throw new RuntimeError(`Failed to start Pod ${this.podName}`, { pod })
      }

      if (timeout && new Date().getTime() - start > timeout) {
        throw new TimeoutError(`Timed out waiting for Pod ${this.podName} to start: ${debugLog}`, {
          podName: this.podName,
          log: debugLog,
        })
      }
    }

    return { proc: this.proc, pod, state }
  }

  /**
   * Executes a command in the running Pod. Must be called after `start()`.
   */
  async exec(params: ExecParams) {
    const { log, command, container, ignoreError, stdout, stderr, timeout } = params

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
      log,
      provider: this.provider,
      stdout,
      stderr,
      timeout,
    })

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
  async stop({ log }: StopParams) {
    if (this.proc) {
      delete this.proc
    }

    // TODO: use API
    const args = ["delete", "pod", this.podName, "--ignore-not-found=true", "--wait=false"]

    await kubectl.exec({
      args,
      ignoreError: true,
      log,
      namespace: this.namespace,
      provider: this.provider,
    })
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
      this.podName || makePodName("run", this.module.name, Math.round(new Date().getTime()).toString()),
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
