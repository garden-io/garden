/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fs from "fs"
import tmp from "tmp-promise"
import { KubernetesPluginContext } from "../config"
import { PluginError, ParameterError } from "../../../exceptions"
import { PluginCommand } from "../../../plugin/command"
import chalk from "chalk"
import { KubeApi } from "../api"
import { LogEntry } from "../../../logger/log-entry"
import { containerHelpers } from "../../container/helpers"
import { RuntimeError } from "../../../exceptions"
import { PodRunner } from "../run"
import { dockerAuthSecretKey, systemDockerAuthSecretName, k8sUtilImageName } from "../constants"
import { getAppNamespace, getSystemNamespace } from "../namespace"
import { randomString } from "../../../util/string"
import { PluginContext } from "../../../plugin-context"
import { ensureBuilderSecret } from "../container/build/common"
import { ContainerBuildAction } from "../../container/config"
import { k8sGetContainerBuildActionOutputs } from "../container/handlers"

const tmpTarPath = "/tmp/image.tar"
const imagePullTimeoutSeconds = 60 * 20

export const pullImage: PluginCommand = {
  name: "pull-image",
  description: "Pull built images from a remote registry to a local docker daemon",
  title: "Pull images from a remote registry",
  resolveGraph: true,

  handler: async ({ ctx, args, log, graph }) => {
    const result = {}
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    if (provider.config.buildMode === "local-docker") {
      throw new PluginError(`Cannot pull images with buildMode=local-docker`, {
        provider,
      })
    }

    const buildsToPull = graph.getBuilds({ names: args.length > 0 ? args : undefined }).filter((b) => {
      const valid = b.isCompatible("container")
      if (!valid && args.includes(b.name)) {
        throw new ParameterError(chalk.red(`Build ${chalk.white(b.name)} is not a container build.`), {
          name: b.name,
        })
      }
      return valid
    })

    log.info({ msg: chalk.cyan(`\nPulling images for ${buildsToPull.length} builds`) })

    await pullBuilds(k8sCtx, buildsToPull, log)

    log.info({ msg: chalk.green("\nDone!"), status: "success" })

    return { result }
  },
}

async function pullBuilds(ctx: KubernetesPluginContext, builds: ContainerBuildAction[], log: LogEntry) {
  await Promise.all(
    builds.map(async (action) => {
      const outputs = k8sGetContainerBuildActionOutputs({ provider: ctx.provider, action })
      const remoteId = action.getSpec("publishId") || outputs.deploymentImageId
      const localId = outputs.localImageId
      log.info({ msg: chalk.cyan(`Pulling image ${remoteId} to ${localId}`) })
      await pullBuild({ ctx, action, log, localId, remoteId })
      log.info({ msg: chalk.green(`\nPulled image: ${remoteId} -> ${localId}`) })
    })
  )
}

interface PullParams {
  ctx: KubernetesPluginContext
  action: ContainerBuildAction
  log: LogEntry
  localId: string
  remoteId: string
}

export async function pullBuild(params: PullParams) {
  await pullFromExternalRegistry(params)
}

async function pullFromExternalRegistry({ ctx, log, localId, remoteId }: PullParams) {
  const api = await KubeApi.factory(log, ctx, ctx.provider)
  const buildMode = ctx.provider.config.buildMode

  let namespace: string
  let authSecretName: string

  if (buildMode === "cluster-buildkit") {
    namespace = await getAppNamespace(ctx, log, ctx.provider)

    const { authSecret } = await ensureBuilderSecret({
      provider: ctx.provider,
      log,
      api,
      namespace,
    })

    authSecretName = authSecret.metadata.name
  } else {
    namespace = await getSystemNamespace(ctx, ctx.provider, log)
    authSecretName = systemDockerAuthSecretName
  }

  // See https://github.com/containers/skopeo for how all this works and the syntax
  const skopeoCommand = [
    "skopeo",
    `--command-timeout=${imagePullTimeoutSeconds}s`,
    "--insecure-policy",
    "copy",
    "--quiet",
    `docker://${remoteId}`,
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
            command: ["sleep", "" + (imagePullTimeoutSeconds + 10)],
            volumeMounts: [
              {
                name: authSecretName,
                mountPath: "/home/user/.docker",
                readOnly: true,
              },
            ],
            resources: {
              requests: {
                cpu: "100m",
                memory: "256M",
              },
            },
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

  log.debug(`Pulling image ${remoteId} from registry to local docker`)

  try {
    await runner.start({ log })

    await runner.exec({
      log,
      command: skopeoCommand,
      tty: false,
      timeoutSec: imagePullTimeoutSeconds + 10,
      buffer: true,
    })

    log.debug(`Loading image to local docker with ID ${localId}`)
    await loadImage({ ctx, runner, log })
  } catch (err) {
    throw new RuntimeError(`Failed pulling image ${remoteId}: ${err.message}`, {
      err,
      remoteId,
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
      timeoutSec: imagePullTimeoutSeconds,
    })

    await containerHelpers.dockerCli({
      ctx,
      cwd: "/tmp",
      args: ["load", "-i", path],
      log,
    })
  })
}
