/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const AsyncLock = require("async-lock")
import { containerDevModeSchema, ContainerDevModeSpec } from "../container/config"
import { dedent, gardenAnnotationKey } from "../../util/string"
import { fromPairs, set } from "lodash"
import { getResourceContainer, getResourcePodSpec } from "./util"
import { HotReloadableResource } from "./hot-reload/hot-reload"
import { LogEntry } from "../../logger/log-entry"
import { joinWithPosix } from "../../util/fs"
import chalk from "chalk"
import { pathExists, readFile, writeFile } from "fs-extra"
import { PluginContext } from "../../plugin-context"
import { join } from "path"
import { safeDump, safeLoad } from "js-yaml"
import { ConfigurationError } from "../../exceptions"
import { ensureMutagenDaemon, killSyncDaemon } from "./mutagen"
import { joiIdentifier } from "../../config/common"
import { KubernetesPluginContext } from "./config"
import { prepareConnectionOpts } from "./kubectl"
import { sleep } from "../../util/util"

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
    // TODO: inject agent + SSH server
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

const mutagenModeMap = {
  "one-way": "one-way-safe",
  "one-way-replica": "one-way-replica",
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
      containerName = getResourcePodSpec(target)?.containers[0]?.name
    }

    if (!containerName) {
      throw new ConfigurationError(`Resource ${resourceName} doesn't have any containers`, {
        target,
      })
    }

    const kubectl = ctx.tools["kubernetes.kubectl"]
    const kubectlPath = await kubectl.getPath(log)

    const mutagen = ctx.tools["kubernetes.mutagen"]
    let dataDir = await ensureMutagenDaemon(log, mutagen)

    const k8sCtx = <KubernetesPluginContext>ctx

    // Configure Mutagen with all the syncs
    const syncConfigs = fromPairs(
      spec.sync.map((s, i) => {
        const connectionOpts = prepareConnectionOpts({
          provider: k8sCtx.provider,
          namespace,
        })
        const command = [
          kubectlPath,
          "exec",
          "-i",
          ...connectionOpts,
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

    // Commit the configuration to the Mutagen daemon

    let loops = 0
    const maxRetries = 10
    while (true) {
      // When deploying Helm services with dev mode, sometimes the first deployment (e.g. when the namespace has just
      // been created) will fail because the daemon can't connect to the pod (despite the call to `waitForResources`)
      // in the Helm deployment handler.
      //
      // In addition, when several services are deployed with dev mode, we occasionally need to retry restarting the
      // mutagen daemon after the first try (we need to restart it to reload the updated mutagen project, which
      // needs to contain representations of all the sync specs).
      //
      // When either of those happens, we simply kill the mutagen daemon, wait, and try again (up to a fixed number
      // of retries).
      //
      // TODO: Maybe there's a more elegant way to do this?
      try {
        const configPath = join(dataDir, "mutagen.yml")

        if (await pathExists(configPath)) {
          config = safeLoad((await readFile(configPath)).toString())
        }

        config.sync = { ...config.sync, ...syncConfigs }

        await writeFile(configPath, safeDump(config))

        await mutagen.exec({
          cwd: dataDir,
          args: ["project", "start"],
          log,
          env: {
            MUTAGEN_DATA_DIRECTORY: dataDir,
          },
        })
        break
      } catch (err) {
        const unableToConnect = err.message.match(/unable to connect to beta/)
        const alreadyRunning = err.message.match(/project already running/)
        if ((unableToConnect || alreadyRunning) && loops < 10) {
          loops += 1
          if (unableToConnect) {
            log.setState(`Synchronization daemon failed to connect, retrying (attempt ${loops}/${maxRetries})...`)
          } else if (alreadyRunning) {
            log.setState(`Project already running, retrying (attempt ${loops}/${maxRetries})...`)
          }
          await killSyncDaemon(false)
          await sleep(2000 + loops * 500)
          dataDir = await ensureMutagenDaemon(log, mutagen)
        } else {
          log.setError(err.message)
          throw err
        }
      }
    }
    log.setSuccess("Synchronization daemon started")

    // TODO: Attach to Mutagen GRPC to poll for sync updates

    const sync: ActiveSync = { spec }
    activeSyncs[key] = sync

    return sync
  })
}
