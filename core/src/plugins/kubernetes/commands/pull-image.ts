/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fs from "fs"
import tmp from "tmp-promise"
import type { KubernetesPluginContext } from "../config.js"
import { GardenError, ParameterError, PluginError, RuntimeError } from "../../../exceptions.js"
import type { PluginCommand } from "../../../plugin/command.js"
import { KubeApi } from "../api.js"
import type { Log } from "../../../logger/log-entry.js"
import { containerHelpers } from "../../container/helpers.js"
import { PodRunner } from "../run.js"
import { dockerAuthSecretKey, getK8sUtilImagePath, systemDockerAuthSecretName } from "../constants.js"
import { getAppNamespace, getSystemNamespace } from "../namespace.js"
import { randomString } from "../../../util/string.js"
import type { PluginContext } from "../../../plugin-context.js"
import { ensureBuilderSecret, ensureServiceAccount, inClusterBuilderServiceAccount } from "../container/build/common.js"
import type { ContainerBuildAction } from "../../container/config.js"
import { k8sGetContainerBuildActionOutputs } from "../container/handlers.js"
import type { Resolved } from "../../../actions/types.js"
import { finished } from "node:stream/promises"
import { styles } from "../../../logger/styles.js"

const tmpTarPath = "/tmp/image.tar"
const imagePullTimeoutSeconds = 60 * 20

export const pullImage: PluginCommand = {
  name: "pull-image",
  description: "Pull built images from a remote registry to a local docker daemon",
  title: "Pull images from a remote registry",
  resolveGraph: true,

  handler: async ({ ctx, args, log, garden, graph }) => {
    const result = {}
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    if (provider.config.buildMode === "local-docker") {
      throw new PluginError({
        message: `Cannot pull images with buildMode=local-docker`,
      })
    }

    const buildsToPull = graph.getBuilds({ names: args.length > 0 ? args : undefined }).filter((b) => {
      const valid = b.isCompatible("container")
      if (!valid && args.includes(b.name)) {
        throw new ParameterError({
          message: `Build ${styles.highlight(b.name)} is not a container build.`,
        })
      }
      return valid
    })

    log.info({ msg: styles.highlight(`\nPulling images for ${buildsToPull.length} builds`) })

    const resolvedBuilds = await garden.resolveActions({ actions: buildsToPull, graph, log })

    await pullBuilds(k8sCtx, Object.values(resolvedBuilds), log)

    log.success("\nDone!")

    return { result }
  },
}

async function pullBuilds(ctx: KubernetesPluginContext, builds: Resolved<ContainerBuildAction>[], log: Log) {
  await Promise.all(
    builds.map(async (action) => {
      const outputs = k8sGetContainerBuildActionOutputs({ provider: ctx.provider, action, log })
      const remoteId = action.getSpec("publishId") || outputs.deploymentImageId
      const localId = outputs.localImageId
      log.info({ msg: styles.highlight(`Pulling image ${remoteId} to ${localId}`) })
      await pullBuild({ ctx, action, log, localId, remoteId })
      log.success({ msg: styles.success(`\nPulled image: ${remoteId} -> ${localId}`), showDuration: false })
    })
  )
}

interface PullParams {
  ctx: KubernetesPluginContext
  action: ContainerBuildAction
  log: Log
  localId: string
  remoteId: string
}

export async function pullBuild(params: PullParams) {
  const { ctx, log, localId, remoteId }: PullParams = params
  const api = await KubeApi.factory(log, ctx, ctx.provider)
  const buildMode = ctx.provider.config.buildMode

  let namespace: string
  let authSecretName: string

  if (buildMode === "cluster-buildkit" || buildMode === "kaniko") {
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

  let nodeSelector: Record<string, string> | undefined
  if (ctx.provider.config.buildMode === "cluster-buildkit" && ctx.provider.config.clusterBuildkit?.nodeSelector) {
    nodeSelector = ctx.provider.config.clusterBuildkit.nodeSelector
  } else if (ctx.provider.config.buildMode === "kaniko" && ctx.provider.config.kaniko?.nodeSelector) {
    nodeSelector = ctx.provider.config.kaniko.nodeSelector
  }

  await ensureServiceAccount({
    ctx,
    log,
    api,
    namespace,
  })

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
        serviceAccountName: inClusterBuilderServiceAccount,
        containers: [
          {
            name: "main",
            image: getK8sUtilImagePath(ctx.provider.config.utilImageRegistryDomain),
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
        nodeSelector,
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
    if (!(err instanceof GardenError)) {
      throw err
    }
    throw new RuntimeError({
      message: `Failed pulling image ${remoteId} to local docker with ID ${localId}: ${err.message}`,
      wrappedErrors: [err],
    })
  } finally {
    await runner.stop()
  }
}

async function loadImage({ ctx, runner, log }: { ctx: PluginContext; runner: PodRunner; log: Log }) {
  await tmp.withFile(async ({ path }) => {
    const writeStream = fs.createWriteStream(path)

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

    await finished(writeStream)
  })
}
