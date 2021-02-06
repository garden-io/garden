/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fs from "fs"
import tmp from "tmp-promise"
import { KubernetesPluginContext, KubernetesProvider } from "../config"
import { PluginError, ParameterError } from "../../../exceptions"
import { PluginCommand } from "../../../types/plugin/command"
import chalk from "chalk"
import { GardenModule } from "../../../types/module"
import { findByNames } from "../../../util/util"
import { filter, map } from "lodash"
import { KubeApi } from "../api"
import { LogEntry } from "../../../logger/log-entry"
import { containerHelpers } from "../../container/helpers"
import { RuntimeError } from "../../../exceptions"
import { PodRunner } from "../run"
import { inClusterRegistryHostname } from "../constants"
import { getAppNamespace, getSystemNamespace } from "../namespace"
import { makePodName, getSkopeoContainer, getDockerAuthVolume } from "../util"
import { getRegistryPortForward } from "../container/util"
import { PluginContext } from "../../../plugin-context"
import { KubernetesPod } from "../types"
import { ContainerModule } from "../../container/config"

export const pullImage: PluginCommand = {
  name: "pull-image",
  description: "Pull built images from a remote registry to a local docker daemon",
  title: "Pull images from a remote registry",
  resolveModules: true,

  handler: async ({ ctx, args, log, modules }) => {
    const result = {}
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    if (provider.config.buildMode === "local-docker") {
      throw new PluginError(`Cannot pull images with buildMode=local-docker`, {
        provider,
      })
    }

    const modulesToPull = findModules(modules, args)
    log.info({ msg: chalk.cyan(`\nPulling images for ${modulesToPull.length} modules`) })

    await pullModules(k8sCtx, modulesToPull, log)

    log.info({ msg: chalk.green("\nDone!"), status: "success" })

    return { result }
  },
}

function findModules(modules: GardenModule[], names: string[]): GardenModule[] {
  let foundModules: GardenModule[]

  if (!names || names.length === 0) {
    foundModules = modules
  } else {
    foundModules = findByNames(names, modules, "modules")
  }

  ensureAllModulesValid(foundModules)

  return foundModules
}

function ensureAllModulesValid(modules: GardenModule[]) {
  const invalidModules = filter(modules, (module) => {
    return !module.compatibleTypes.includes("container") || !containerHelpers.hasDockerfile(module, module.version)
  })

  if (invalidModules.length > 0) {
    const invalidModuleNames = map(invalidModules, (module) => {
      return module.name
    })

    throw new ParameterError(chalk.red(`Modules ${chalk.white(invalidModuleNames)} are not container modules.`), {
      invalidModuleNames,
      compatibleTypes: "container",
    })
  }
}

async function pullModules(ctx: KubernetesPluginContext, modules: ContainerModule[], log: LogEntry) {
  await Promise.all(
    modules.map(async (module) => {
      const remoteId = containerHelpers.getPublicImageId(module)
      const localId = module.outputs["local-image-id"]
      log.info({ msg: chalk.cyan(`Pulling image ${remoteId} to ${localId}`) })
      await pullModule(ctx, module, log)
      log.info({ msg: chalk.green(`\nPulled image: ${remoteId} -> ${localId}`) })
    })
  )
}

export async function pullModule(ctx: KubernetesPluginContext, module: ContainerModule, log: LogEntry) {
  const localId = module.outputs["local-image-id"]

  if (ctx.provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
    await pullFromInClusterRegistry(ctx, module, log, localId)
  } else {
    await pullFromExternalRegistry(ctx, module, log, localId)
  }
}

async function pullFromInClusterRegistry(
  ctx: KubernetesPluginContext,
  module: ContainerModule,
  log: LogEntry,
  localId: string
) {
  const fwd = await getRegistryPortForward(ctx, log)
  const imageId = module.outputs["deployment-image-id"]
  const pullImageId = containerHelpers.unparseImageId({
    ...containerHelpers.parseImageId(imageId),
    // Note: using localhost directly here has issues with Docker for Mac.
    // https://github.com/docker/for-mac/issues/3611
    host: `local.app.garden:${fwd.localPort}`,
  })

  await containerHelpers.dockerCli({ cwd: module.buildPath, args: ["pull", pullImageId], log, ctx })
  await containerHelpers.dockerCli({
    cwd: module.buildPath,
    args: ["tag", pullImageId, localId],
    log,
    ctx,
  })
  await containerHelpers.dockerCli({ cwd: module.buildPath, args: ["rmi", pullImageId], log, ctx })
}

async function pullFromExternalRegistry(
  ctx: KubernetesPluginContext,
  module: ContainerModule,
  log: LogEntry,
  localId: string
) {
  const api = await KubeApi.factory(log, ctx, ctx.provider)
  const namespace = await getAppNamespace(ctx, log, ctx.provider)
  const podName = makePodName("skopeo", namespace, module.name)
  const systemNamespace = await getSystemNamespace(ctx, ctx.provider, log)
  const imageId = module.outputs["deployment-image-id"]
  const tarName = `${module.name}-${module.version.versionString}`

  const skopeoCommand = [
    "skopeo",
    "--command-timeout=300s",
    "--insecure-policy",
    "copy",
    `docker://${imageId}`,
    `docker-archive:${tarName}`,
  ]

  const runner = await launchSkopeoContainer({
    ctx,
    provider: ctx.provider,
    api,
    podName,
    systemNamespace,
    log,
  })

  try {
    await pullImageFromRegistry(runner, skopeoCommand.join(" "), log)
    await importImage({ module, runner, tarName, imageId, log, ctx })
    await containerHelpers.dockerCli({ cwd: module.buildPath, args: ["tag", imageId, localId], log, ctx })
    await containerHelpers.dockerCli({ cwd: module.buildPath, args: ["rmi", imageId], log, ctx })
  } catch (err) {
    throw new RuntimeError(`Failed pulling image for module ${module.name} with image id ${imageId}: ${err}`, {
      err,
      imageId,
    })
  } finally {
    await runner.stop()
  }
}

async function importImage({
  module,
  runner,
  tarName,
  imageId,
  log,
  ctx,
}: {
  module: GardenModule
  runner: PodRunner
  tarName: string
  imageId: string
  log: LogEntry
  ctx: PluginContext
}) {
  const sourcePath = `/${tarName}`
  const getOutputCommand = ["cat", sourcePath]
  await tmp.withFile(async ({ path }) => {
    let writeStream = fs.createWriteStream(path)

    await runner.exec({
      command: getOutputCommand,
      containerName: "skopeo",
      log,
      stdout: writeStream,
    })

    const args = ["import", path, imageId]
    await containerHelpers.dockerCli({ cwd: module.buildPath, args, log, ctx })
  })
}

async function pullImageFromRegistry(runner: PodRunner, command: string, log: LogEntry) {
  // TODO: make this timeout configurable
  await runner.exec({
    command: ["sh", "-c", command],
    containerName: "skopeo",
    log,
    timeoutSec: 60 * 1000 * 5, // 5 minutes,
  })
}

async function launchSkopeoContainer({
  ctx,
  provider,
  api,
  podName,
  systemNamespace,
  log,
}: {
  ctx: PluginContext
  provider: KubernetesProvider
  api: KubeApi
  podName: string
  systemNamespace: string
  log: LogEntry
}): Promise<PodRunner> {
  const sleepCommand = "sleep 86400"

  const pod: KubernetesPod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: podName,
      namespace: systemNamespace,
    },
    spec: {
      shareProcessNamespace: true,
      volumes: [
        // Mount the docker auth secret, so skopeo can inspect private registries.
        getDockerAuthVolume(),
      ],
      containers: [getSkopeoContainer(sleepCommand)],
    },
  }

  const runner = new PodRunner({
    ctx,
    api,
    pod,
    provider,
    namespace: systemNamespace,
  })

  const { status } = await runner.start({
    log,
  })

  if (status.state !== "ready") {
    throw new RuntimeError("Failed to start skopeo container", {
      status,
    })
  }

  return runner
}
