/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fs from "fs"
import tmp from "tmp-promise"
import { KubernetesPluginContext } from "../config"
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
import { dockerAuthSecretKey, dockerAuthSecretName, inClusterRegistryHostname, k8sUtilImageName } from "../constants"
import { getAppNamespace, getSystemNamespace } from "../namespace"
import { getRegistryPortForward } from "../container/util"
import { randomString } from "../../../util/string"
import { buildkitAuthSecretName, ensureBuilderSecret } from "../container/build/buildkit"
import { PluginContext } from "../../../plugin-context"

const tmpTarPath = "/tmp/image.tar"

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

async function pullModules(ctx: KubernetesPluginContext, modules: GardenModule[], log: LogEntry) {
  await Promise.all(
    modules.map(async (module) => {
      const remoteId = containerHelpers.getPublicImageId(module)
      const localId = containerHelpers.getLocalImageId(module, module.version)
      log.info({ msg: chalk.cyan(`Pulling image ${remoteId} to ${localId}`) })
      await pullModule(ctx, module, log)
      log.info({ msg: chalk.green(`\nPulled image: ${remoteId} -> ${localId}`) })
    })
  )
}

export async function pullModule(ctx: KubernetesPluginContext, module: GardenModule, log: LogEntry) {
  const localId = containerHelpers.getLocalImageId(module, module.version)

  if (ctx.provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
    await pullFromInClusterRegistry(ctx, module, log, localId)
  } else {
    await pullFromExternalRegistry(ctx, module, log, localId)
  }
}

async function pullFromInClusterRegistry(
  ctx: KubernetesPluginContext,
  module: GardenModule,
  log: LogEntry,
  localId: string
) {
  const fwd = await getRegistryPortForward(ctx, log)
  const imageId = containerHelpers.getDeploymentImageId(module, module.version, ctx.provider.config.deploymentRegistry)
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
  module: GardenModule,
  log: LogEntry,
  localId: string
) {
  const api = await KubeApi.factory(log, ctx, ctx.provider)
  const buildMode = ctx.provider.config.buildMode

  let namespace: string
  let authSecretName: string

  if (buildMode === "cluster-buildkit") {
    namespace = await getAppNamespace(ctx, log, ctx.provider)
    authSecretName = buildkitAuthSecretName

    await ensureBuilderSecret({
      provider: ctx.provider,
      log,
      api,
      namespace,
      waitForUpdate: false,
    })
  } else {
    namespace = await getSystemNamespace(ctx, ctx.provider, log)
    authSecretName = dockerAuthSecretName
  }

  const imageId = containerHelpers.getDeploymentImageId(module, module.version, ctx.provider.config.deploymentRegistry)

  // See https://github.com/containers/skopeo for how all this works and the syntax
  const skopeoCommand = [
    "skopeo",
    "--command-timeout=300s",
    "--insecure-policy",
    "copy",
    "--quiet",
    `docker://${imageId}`,
    `docker-archive:${tmpTarPath}:${localId}`,
  ]

  const runner = new PodRunner({
    api,
    ctx,
    provider: ctx.provider,
    namespace,
    pod: {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: `pull-image-${randomString(8)}`,
        namespace,
      },
      spec: {
        containers: [
          {
            name: "main",
            image: k8sUtilImageName,
            command: ["sleep", "360"],
            volumeMounts: [
              {
                name: authSecretName,
                mountPath: "/home/user/.docker",
                readOnly: true,
              },
            ],
          },
        ],
        volumes: [
          {
            name: authSecretName,
            secret: {
              secretName: authSecretName,
              items: [{ key: dockerAuthSecretKey, path: "config.json" }],
            },
          },
        ],
      },
    },
  })

  log.debug(`Pulling image ${imageId} from registry to local docker`)

  try {
    await runner.start({ log })

    await runner.exec({
      log,
      command: skopeoCommand,
      tty: false,
      timeoutSec: 60 * 1000 * 5, // 5 minutes,
      buffer: true,
    })

    log.debug(`Loading image to local docker with ID ${localId}`)
    await loadImage({ ctx, runner, log })
  } catch (err) {
    throw new RuntimeError(`Failed pulling image ${imageId}: ${err.message}`, {
      err,
      imageId,
      localId,
    })
  } finally {
    await runner.stop()
  }
}

async function loadImage({ ctx, runner, log }: { ctx: PluginContext; runner: PodRunner; log: LogEntry }) {
  await tmp.withFile(async ({ path }) => {
    let writeStream = fs.createWriteStream(path)

    await runner.exec({
      command: ["cat", tmpTarPath],
      containerName: "main",
      log,
      stdout: writeStream,
      buffer: false,
    })

    await containerHelpers.dockerCli({
      ctx,
      cwd: "/tmp",
      args: ["load", "-i", path],
      log,
    })
  })
}
