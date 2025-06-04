/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fsExtra from "fs-extra"

const { mkdirp } = fsExtra
import { resolve } from "path"
import tar from "tar"
import { ConfigurationError, PluginError } from "../../exceptions.js"
import type { ModuleActionHandlers } from "../../plugin/plugin.js"
import { makeTempDir } from "../../util/fs.js"
import { KubeApi } from "./api.js"
import type { KubernetesPluginContext, KubernetesProvider } from "./config.js"
import { ensureBuildkit } from "./container/build/buildkit.js"
import {
  ensureUtilDeployment,
  syncToBuildSync,
  utilContainerName,
  utilDeploymentName,
} from "./container/build/common.js"
import { kubernetesContainerHelpers } from "./container/build/local.js"
import { containerHandlers } from "./container/handlers.js"
import { getAppNamespace } from "./namespace.js"
import { PodRunner } from "./run.js"
import { getRunningDeploymentPod } from "./util.js"
import type { BuildActionExtension, BuildActionParams } from "../../plugin/action-types.js"
import type { ContainerBuildAction } from "../container/config.js"
import { buildkitDeploymentName } from "./constants.js"
import { naturalList } from "../../util/string.js"

export const jibContainerHandlers: Partial<ModuleActionHandlers> = {
  ...containerHandlers,
}

// Note: Can't import the JibContainerModule type until we move the kubernetes plugin out of the core package
export const k8sJibContainerBuildExtension = (): BuildActionExtension<ContainerBuildAction> => ({
  name: "jib-container",
  handlers: {
    build: async (params) => {
      const { ctx, action, base } = params
      const k8sCtx = ctx as KubernetesPluginContext

      const provider = <KubernetesProvider>ctx.provider

      if (provider.name === "local-kubernetes") {
        const result = await base!(params)

        const spec: any = action.getSpec()

        if (spec.dockerBuild) {
          // We may need to explicitly load the image into the cluster if it's built in the docker daemon directly
          await kubernetesContainerHelpers.loadToLocalK8s(params)
        }
        return result
      } else if (k8sCtx.provider.config.jib?.pushViaCluster) {
        return buildAndPushViaRemote(params)
      } else {
        return base!(params)
      }
    },
  },
})

async function buildAndPushViaRemote(params: BuildActionParams<"build", ContainerBuildAction>) {
  const { ctx, log, action, base } = params
  const k8sCtx = ctx as KubernetesPluginContext

  const provider = <KubernetesProvider>ctx.provider
  const buildMode = provider.config.buildMode

  // Build the tarball with the base handler
  const spec: any = action.getSpec()

  spec.tarOnly = true
  spec.tarFormat = "oci"

  const baseResult = await base!(params)
  const { tarPath } = baseResult.details

  if (!tarPath) {
    throw new PluginError({
      message: `Expected details.tarPath from the jib-container build handler. Got: ${naturalList(
        Object.keys(baseResult.details || {})
      )}`,
    })
  }

  // Push to util or buildkit deployment on remote, and push to registry from there to make sure auth/access is
  // consistent with normal image pushes.
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  const tempDir = await makeTempDir()

  try {
    // Extract the tarball
    const extractPath = resolve(tempDir.path, action.name)
    await mkdirp(extractPath)
    log.debug(`Extracting built image tarball from ${tarPath} to ${extractPath}`)

    await tar.x({
      cwd: extractPath,
      file: tarPath,
    })

    let deploymentName: string

    // Make sure the sync target is up
    if (buildMode === "kaniko") {
      await ensureUtilDeployment({
        ctx,
        provider,
        log,
        api,
        namespace,
      })
      deploymentName = utilDeploymentName
    } else if (buildMode === "cluster-buildkit") {
      await ensureBuildkit({
        ctx,
        provider,
        log,
        api,
        namespace,
      })
      deploymentName = buildkitDeploymentName
    } else {
      throw new ConfigurationError({ message: `Unexpected buildMode ${buildMode}` })
    }

    // Sync the archive to the remote
    const { dataPath } = await syncToBuildSync({
      ...params,
      ctx: k8sCtx,
      api,
      namespace,
      deploymentName,
      sourcePath: extractPath,
    })

    const pushTimeout = action.getConfig("timeout")

    const syncCommand = ["skopeo", `--command-timeout=${pushTimeout}s`, "copy", "--authfile", "/.docker/config.json"]

    if (provider.config.deploymentRegistry?.insecure === true) {
      syncCommand.push("--dest-tls-verify=false")
    }

    const deploymentImageId = baseResult.outputs.deploymentImageId
    syncCommand.push("oci:" + dataPath, "docker://" + deploymentImageId)

    log.info(`Pushing image ${deploymentImageId} to registry`)

    const runner = new PodRunner({
      api,
      ctx,
      provider,
      namespace,
      pod: await getRunningDeploymentPod({
        api,
        deploymentName,
        namespace,
      }),
    })

    const { log: skopeoLog } = await runner.exec({
      log,
      command: syncCommand,
      timeoutSec: pushTimeout + 5,
      containerName: utilContainerName,
      buffer: true,
    })

    log.debug(skopeoLog)
    log.info(`Image ${deploymentImageId} built and pushed to registry`)

    return baseResult
  } finally {
    await tempDir.cleanup()
  }
}
