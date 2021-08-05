/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerDevModeSchema, ContainerDevModeSpec } from "../container/config"
import { dedent, gardenAnnotationKey } from "../../util/string"
import { set } from "lodash"
import { getResourceContainer, getResourcePodSpec } from "./util"
import { HotReloadableResource } from "./hot-reload/hot-reload"
import { LogEntry } from "../../logger/log-entry"
import { joinWithPosix } from "../../util/fs"
import chalk from "chalk"
import { PluginContext } from "../../plugin-context"
import { ConfigurationError } from "../../exceptions"
import { ensureMutagenSync, mutagenConfigLock } from "./mutagen"
import { joiIdentifier } from "../../config/common"
import { KubernetesPluginContext } from "./config"
import { prepareConnectionOpts } from "./kubectl"

const syncUtilImageName = "gardendev/k8s-sync:0.1.1"
const mutagenAgentPath = "/.garden/mutagen-agent"

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

    const kubectl = ctx.tools["kubernetes.kubectl"]
    const kubectlPath = await kubectl.getPath(log)
    const k8sCtx = <KubernetesPluginContext>ctx

    let i = 0

    for (const s of spec.sync) {
      const key = `${keyBase}-${i}`

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
          alpha: joinWithPosix(moduleRoot, s.source),
          beta: `exec:'${command.join(" ")}':${s.target}`,
          mode: s.mode,
          ignore: s.exclude || [],
        },
      })

      i++
    }
  })
}
