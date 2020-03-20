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
import { Module } from "../../../types/module"
import { findByNames } from "../../../util/util"
import { filter, map } from "lodash"
import { KubeApi } from "../api"
import { LogEntry } from "../../../logger/log-entry"
import { containerHelpers } from "../../container/helpers"
import { RuntimeError } from "../../../exceptions"
import { PodRunner } from "../run"
import { inClusterRegistryHostname } from "../constants"
import { getAppNamespace, getSystemNamespace } from "../namespace"
import { makePodName, skopeoImage, getSkopeoContainer, getDockerAuthVolume } from "../util"

export const pullImage: PluginCommand = {
  name: "pull-image",
  description: "Pull images from a remote cluster",
  title: "Pull images from a remote cluster",
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

function findModules(modules: Module[], names: string[]): Module[] {
  let foundModules: Module[]

  if (!names || names.length === 0) {
    foundModules = modules
  } else {
    foundModules = findByNames(names, modules, "modules")
  }

  ensureAllModulesValid(foundModules)

  return foundModules
}

function ensureAllModulesValid(modules: Module[]) {
  const invalidModules = filter(modules, (module) => {
    return !module.compatibleTypes.includes("container") || !containerHelpers.hasDockerfile(module)
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

async function pullModules(ctx: KubernetesPluginContext, modules: Module[], log: LogEntry) {
  await Promise.all(
    modules.map(async (module) => {
      const remoteId = await containerHelpers.getPublicImageId(module)
      log.debug({ msg: chalk.cyan(`Pulling image ${remoteId}`) })
      await pullModule(ctx, module, log)
      log.info({ msg: chalk.green(`\nPulled module: ${module.name}`) })
    })
  )
}

async function pullModule(ctx: KubernetesPluginContext, module: Module, log: LogEntry) {
  if (ctx.provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
    await pullFromInClusterRegistry(module, log)
  } else {
    await pullFromExternalRegistry(ctx, module, log)
  }
}

async function pullFromInClusterRegistry(module: Module, log: LogEntry) {
  const localId = await containerHelpers.getLocalImageId(module)
  const remoteId = await containerHelpers.getPublicImageId(module)

  await containerHelpers.dockerCli(module.buildPath, ["pull", remoteId], log)

  if (localId !== remoteId) {
    await containerHelpers.dockerCli(module.buildPath, ["tag", remoteId, localId], log)
  }
}

async function pullFromExternalRegistry(ctx: KubernetesPluginContext, module: Module, log: LogEntry) {
  const api = await KubeApi.factory(log, ctx.provider)
  const namespace = await getAppNamespace(ctx, log, ctx.provider)
  const podName = makePodName("skopeo", namespace, module.name)
  const systemNamespace = await getSystemNamespace(ctx.provider, log)
  const imageId = await containerHelpers.getDeploymentImageId(module, ctx.provider.config.deploymentRegistry)
  const tarName = `${module.name}-${module.version.versionString}`

  const skopeoCommand = [
    "skopeo",
    "--command-timeout=300s",
    "--insecure-policy",
    "copy",
    `docker://${imageId}`,
    `docker-archive:${tarName}`,
  ]

  try {
    const runner = await launchSkopeoContainer(ctx.provider, api, podName, systemNamespace, module, log)
    await pullImageFromRegistry(runner, skopeoCommand.join(" "), log)
    await importImage(module, runner, tarName, imageId, log)
  } catch (err) {
    throw new RuntimeError(`Failed pulling image for module ${module.name} with image id ${imageId}`, {
      err,
      imageId,
    })
  }
}

async function importImage(module: Module, runner: PodRunner, tarName: string, imageId: string, log: LogEntry) {
  const sourcePath = `/${tarName}`
  const getOuputCommand = ["cat", sourcePath]
  const tmpFile = await tmp.fileSync()

  let writeStream = fs.createWriteStream(tmpFile.name)

  await runner.spawn({
    command: getOuputCommand,
    container: "skopeo",
    ignoreError: false,
    log,
    stdout: writeStream,
  })

  const args = ["import", tmpFile.name, imageId]
  await containerHelpers.dockerCli(module.buildPath, args, log)
}

async function pullImageFromRegistry(runner: PodRunner, command: string, log: LogEntry) {
  // TODO: make this timeout configurable
  await runner.exec({
    command: ["sh", "-c", command],
    container: "skopeo",
    ignoreError: false,
    log,
    timeout: 60 * 1000 * 5, // 5 minutes,
  })
}

async function launchSkopeoContainer(
  provider: KubernetesProvider,
  api: KubeApi,
  podName: string,
  systemNamespace: string,
  module: Module,
  log: LogEntry
) {
  const sleepCommand = "sleep 86400"
  const runner = new PodRunner({
    api,
    podName,
    provider,
    image: skopeoImage,
    module,
    namespace: systemNamespace,
    spec: {
      shareProcessNamespace: true,
      volumes: [
        // Mount the docker auth secret, so skopeo can inspect private registries.
        getDockerAuthVolume(),
      ],
      containers: [getSkopeoContainer(sleepCommand)],
    },
  })

  const { pod, state, debugLog } = await runner.start({
    log,
    ignoreError: false,
  })

  if (state !== "ready") {
    throw new RuntimeError("Failed to start skopeo contaer", {
      pod,
      state,
      debugLog,
    })
  }

  return runner
}
