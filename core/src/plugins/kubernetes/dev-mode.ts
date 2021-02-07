/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const AsyncLock = require("async-lock")
import { containerDevModeSchema, ContainerDevModeSpec } from "../container/config"
import { dedent, gardenAnnotationKey } from "../../util/string"
import { fromPairs, set } from "lodash"
import { getResourceContainer } from "./util"
import { HotReloadableResource } from "./hot-reload/hot-reload"
import { LogEntry } from "../../logger/log-entry"
import { joinWithPosix } from "../../util/fs"
import chalk from "chalk"
import { pathExists, readFile, writeFile } from "fs-extra"
import { PluginContext } from "../../plugin-context"
import { join } from "path"
import { safeDump, safeLoad } from "js-yaml"
import { ConfigurationError } from "../../exceptions"
import { ensureMutagenDaemon } from "./mutagen"
import { joiIdentifier } from "../../config/common"

const syncUtilImageName = "gardendev/k8s-sync:0.1.1"
const mutagenAgentPath = "/.garden/mutagen-agent"

interface ActiveSync {
  spec: ContainerDevModeSpec
}

const activeSyncs: { [key: string]: ActiveSync } = {}
const syncStartLock = new AsyncLock()

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
    **EXPERIMENTAL**

    Specifies which files or directories to sync to which paths inside the running containers of the service when it's in dev mode, and overrides for the container command and/or arguments.

    Note that \`serviceResource\` must also be specified to enable dev mode.

    Dev mode is enabled when running the \`garden dev\` command, and by setting the \`--dev\` flag on the \`garden deploy\` command.
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

  // Inject mutagen agent on init
  const gardenVolumeName = `garden`
  const gardenVolumeMount = {
    name: gardenVolumeName,
    mountPath: "/.garden",
  }

  if (!target.spec.template.spec!.volumes) {
    target.spec.template.spec!.volumes = []
  }

  target.spec.template.spec!.volumes.push({
    name: gardenVolumeName,
    emptyDir: {},
  })

  const initContainer = {
    name: "garden-dev-init",
    image: syncUtilImageName,
    // TODO: inject agent + SSH server
    command: ["/bin/sh", "-c", "cp /usr/local/bin/mutagen-agent " + mutagenAgentPath],
    imagePullPolicy: "IfNotPresent",
    volumeMounts: [gardenVolumeMount],
  }

  if (!target.spec.template.spec!.initContainers) {
    target.spec.template.spec!.initContainers = []
  }
  target.spec.template.spec!.initContainers.push(initContainer)

  if (!mainContainer.volumeMounts) {
    mainContainer.volumeMounts = []
  }

  mainContainer.volumeMounts.push(gardenVolumeMount)
}

const mutagenModeMap = {
  "one-way": "one-way-safe",
  "two-way": "two-way-safe",
}

interface StartDevModeSyncParams extends ConfigureDevModeParams {
  ctx: PluginContext
  log: LogEntry
  moduleRoot: string
  namespace: string
}

export async function startDevModeSync({
  containerName,
  ctx,
  log,
  moduleRoot,
  namespace,
  spec,
  target,
}: StartDevModeSyncParams) {
  if (spec.sync.length === 0) {
    return
  }

  namespace = target.metadata.namespace || namespace
  const resourceName = `${target.kind}/${target.metadata.name}`
  const key = `${target.kind}--${namespace}--${target.metadata.name}`

  return syncStartLock.acquire("start-sync", async () => {
    // Check for already active sync
    if (activeSyncs[key]) {
      return activeSyncs[key]
    }

    // Validate the target
    if (target.metadata.annotations?.[gardenAnnotationKey("dev-mode")] !== "true") {
      throw new ConfigurationError(`Resource ${resourceName} is not deployed in dev mode`, {
        target,
      })
    }

    if (!containerName) {
      containerName = target.spec.template.spec?.containers[0]?.name
    }

    if (!containerName) {
      throw new ConfigurationError(`Resource ${resourceName} doesn't have any containers`, {
        target,
      })
    }

    const kubectl = ctx.tools["kubernetes.kubectl"]
    const kubectlPath = await kubectl.getPath(log)

    const mutagen = ctx.tools["kubernetes.mutagen"]
    const dataDir = await ensureMutagenDaemon(log, mutagen)

    // Configure Mutagen with all the syncs
    const syncConfigs = fromPairs(
      spec.sync.map((s, i) => {
        const command = [
          kubectlPath,
          "exec",
          "-i",
          "--namespace",
          namespace,
          "--container",
          containerName,
          `${target.kind}/${target.metadata.name}`,
          "--",
          mutagenAgentPath,
          "synchronizer",
        ]

        const syncConfig = {
          alpha: joinWithPosix(moduleRoot, s.source),
          beta: `exec:'${command.join(" ")}':${s.target}`,
          mode: mutagenModeMap[s.mode],
          ignore: {
            paths: s.exclude || [],
          },
        }

        log.info(
          chalk.gray(
            `→ Syncing ${chalk.white(s.source)} to ${chalk.white(s.target)} in ${chalk.white(resourceName)} (${s.mode})`
          )
        )

        return [`${key}-${i}`, syncConfig]
      })
    )

    let config: any = {
      sync: {},
    }

    const configPath = join(dataDir, "mutagen.yml")

    if (await pathExists(configPath)) {
      config = safeLoad((await readFile(configPath)).toString())
    }

    config.sync = { ...config.sync, ...syncConfigs }

    await writeFile(configPath, safeDump(config))

    // Commit the configuration to the Mutagen daemon
    await mutagen.exec({
      cwd: dataDir,
      args: ["project", "start"],
      log,
      env: {
        MUTAGEN_DATA_DIRECTORY: dataDir,
      },
    })

    // TODO: Attach to Mutagen GRPC to poll for sync updates

    const sync: ActiveSync = { spec }
    activeSyncs[key] = sync

    return sync
  })
}
