/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerDevModeSchema, ContainerDevModeSpec } from "../container/config"
import { dedent, gardenAnnotationKey } from "../../util/string"
import { flatten, set, uniq } from "lodash"
import { getResourceContainer, getResourcePodSpec } from "./util"
import { HotReloadableResource } from "./hot-reload/hot-reload"
import { LogEntry } from "../../logger/log-entry"
import { joinWithPosix } from "../../util/fs"
import chalk from "chalk"
import { PluginContext } from "../../plugin-context"
import { ConfigurationError } from "../../exceptions"
import { ensureMutagenSync, getKubectlExecDestination, mutagenAgentPath, mutagenConfigLock } from "./mutagen"
import { joiIdentifier } from "../../config/common"
import { KubernetesPluginContext } from "./config"
import { join } from "path"
import { pathExists, readFile } from "fs-extra"
import Bluebird from "bluebird"
import parseGitIgnore from "parse-gitignore"

const syncUtilImageName = "gardendev/k8s-sync:0.1.1"

const defaultDevModeIgnores = [".garden*", "**/.garden*", ".git", "**/*.git"]

interface ConfigureDevModeParams {
  target: HotReloadableResource
  spec: ContainerDevModeSpec
  containerName?: string
}

export interface KubernetesDevModeSpec extends ContainerDevModeSpec {
  containerName?: string
}

export const kubernetesDevModeSchema = () =>
  containerDevModeSchema().keys({
    containerName: joiIdentifier().description(
      `Optionally specify the name of a specific container to sync to. If not specified, the first container in the workload is used.`
    ),
  }).description(dedent`
    Specifies which files or directories to sync to which paths inside the running containers of the service when it's in dev mode, and overrides for the container command and/or arguments.

    Note that \`serviceResource\` must also be specified to enable dev mode.

    Dev mode is enabled when running the \`garden dev\` command, and by setting the \`--dev\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for more information.
  `)

/**
 * Configures the specified Deployment, DaemonSet or StatefulSet for dev mode.
 */
export function configureDevMode({ target, spec, containerName }: ConfigureDevModeParams): void {
  set(target, ["metadata", "annotations", gardenAnnotationKey("dev-mode")], "true")
  const mainContainer = getResourceContainer(target, containerName)

  if (spec.command) {
    mainContainer.command = spec.command
  }

  if (spec.args) {
    mainContainer.args = spec.args
  }

  if (!spec.sync.length) {
    return
  }

  const podSpec = getResourcePodSpec(target)

  if (!podSpec) {
    return
  }

  // Inject mutagen agent on init
  const gardenVolumeName = `garden`
  const gardenVolumeMount = {
    name: gardenVolumeName,
    mountPath: "/.garden",
  }

  if (!podSpec.volumes) {
    podSpec.volumes = []
  }

  podSpec.volumes.push({
    name: gardenVolumeName,
    emptyDir: {},
  })

  const initContainer = {
    name: "garden-dev-init",
    image: syncUtilImageName,
    command: ["/bin/sh", "-c", "cp /usr/local/bin/mutagen-agent " + mutagenAgentPath],
    imagePullPolicy: "IfNotPresent",
    volumeMounts: [gardenVolumeMount],
  }

  if (!podSpec.initContainers) {
    podSpec.initContainers = []
  }
  podSpec.initContainers.push(initContainer)

  if (!mainContainer.volumeMounts) {
    mainContainer.volumeMounts = []
  }

  mainContainer.volumeMounts.push(gardenVolumeMount)
}

interface StartDevModeSyncParams extends ConfigureDevModeParams {
  ctx: PluginContext
  log: LogEntry
  moduleRoot: string
  namespace: string
  serviceName: string
}

export async function startDevModeSync({
  containerName,
  ctx,
  log,
  moduleRoot,
  namespace,
  spec,
  target,
  serviceName,
}: StartDevModeSyncParams) {
  if (spec.sync.length === 0) {
    return
  }
  namespace = target.metadata.namespace || namespace
  const resourceName = `${target.kind}/${target.metadata.name}`
  const keyBase = `${target.kind}--${namespace}--${target.metadata.name}`

  return mutagenConfigLock.acquire("start-sync", async () => {
    // Validate the target
    if (target.metadata.annotations?.[gardenAnnotationKey("dev-mode")] !== "true") {
      throw new ConfigurationError(`Resource ${resourceName} is not deployed in dev mode`, {
        target,
      })
    }

    if (!containerName) {
      containerName = getResourcePodSpec(target)?.containers[0]?.name
    }

    if (!containerName) {
      throw new ConfigurationError(`Resource ${resourceName} doesn't have any containers`, {
        target,
      })
    }

    const k8sCtx = <KubernetesPluginContext>ctx
    const excludesFromDevIgnoreFiles = await readDevIgnores(ctx.projectRoot, moduleRoot)

    let i = 0

    for (const s of spec.sync) {
      const key = `${keyBase}-${i}`

      const alpha = joinWithPosix(moduleRoot, s.source)
      const beta = await getKubectlExecDestination({
        ctx: k8sCtx,
        log,
        namespace,
        containerName,
        resourceName: `${target.kind}/${target.metadata.name}`,
        targetPath: s.target,
      })

      const sourceDescription = chalk.white(s.source)
      const targetDescription = `${chalk.white(s.target)} in ${chalk.white(resourceName)}`
      const description = `${sourceDescription} to ${targetDescription}`

      ctx.log.info({ symbol: "info", section: serviceName, msg: chalk.gray(`Syncing ${description} (${s.mode})`) })

      await ensureMutagenSync({
        // Prefer to log to the main view instead of the handler log context
        log: ctx.log,
        key,
        logSection: serviceName,
        sourceDescription,
        targetDescription,
        config: {
          alpha,
          beta,
          mode: s.mode,
          ignore: [...defaultDevModeIgnores, ...excludesFromDevIgnoreFiles, ...(s.exclude || [])],
        },
      })

      i++
    }
  })
}

/**
 * Reads the Mutagen ignore rules from the project- and module-level .gardenignore-dev files (if any) and returns them
 * as a deduplicated array.
 */
async function readDevIgnores(projectRoot: string, moduleRoot: string): Promise<string[]> {
  const projectDevIgnorePath = join(projectRoot, ".gardenignore-dev")
  const moduleDevIgnorePath = join(moduleRoot, ".gardenignore-dev")
  const rules = uniq(
    flatten(await Bluebird.map([projectDevIgnorePath, moduleDevIgnorePath], async (path) => readIgnoreFile(path)))
  )
  return rules
}

async function readIgnoreFile(path: string): Promise<string[]> {
  if (await pathExists(path)) {
    // We use `parseGitIgnore` to gracefully handle comments and newlines.
    const rules = parseGitIgnore((await readFile(path)).toString())
    return rules
  } else {
    return []
  }
}
