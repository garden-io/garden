/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mkdirp } from "fs-extra"
import { resolve } from "path"
import tar from "tar"
import { defaultBuildTimeout } from "../../config/module"
import { ConfigurationError, PluginError } from "../../exceptions"
import { ModuleActionHandlers } from "../../plugin/plugin"
import { makeTempDir } from "../../util/fs"
import { KubeApi } from "./api"
import { KubernetesPluginContext, KubernetesProvider } from "./config"
import { buildkitDeploymentName, ensureBuildkit } from "./container/build/buildkit"
import {
  ensureUtilDeployment,
  syncToBuildSync,
  utilContainerName,
  utilDeploymentName,
  utilRsyncPort,
} from "./container/build/common"
import { loadToLocalK8s } from "./container/build/local"
import { containerHandlers } from "./container/handlers"
import { getNamespaceStatus } from "./namespace"
import { PodRunner } from "./run"
import { getRunningDeploymentPod } from "./util"
import { BuildActionExtension, BuildActionParams } from "../../plugin/action-types"
import { ContainerBuildAction } from "../container/config"

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
          await loadToLocalK8s(params)
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

  const provider = <KubernetesProvider>ctx.provider
  let buildMode = provider.config.buildMode

  // Build the tarball with the base handler
  const spec: any = action.getSpec()
  spec.tarOnly = true
  spec.tarFormat = "oci"

  const baseResult = await base!(params)
  const { tarPath } = baseResult.details

  if (!tarPath) {
    throw new PluginError(`Expected details.tarPath from the jib-container build handler.`, { baseResult })
  }

  // Push to util or buildkit deployment on remote, and push to registry from there to make sure auth/access is
  // consistent with normal image pushes.
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = (await getNamespaceStatus({ log, ctx, provider })).namespaceName

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
      // Make sure the garden-util deployment is up
      await ensureUtilDeployment({
        ctx,
        provider,
        log,
        api,
        namespace,
      })
      deploymentName = utilDeploymentName
    } else if (buildMode === "cluster-buildkit") {
      // Make sure the buildkit deployment is up
      await ensureBuildkit({
        ctx,
        provider,
        log,
        api,
        namespace,
      })
      deploymentName = buildkitDeploymentName
    } else {
      throw new ConfigurationError(`Unexpected buildMode ${buildMode}`, { buildMode })
    }

    // Sync the archive to the remote
    const { dataPath } = await syncToBuildSync({
      ...params,
      ctx: ctx as KubernetesPluginContext,
      api,
      namespace,
      deploymentName,
      rsyncPort: utilRsyncPort,
      sourcePath: extractPath,
    })

    const pushTimeout = action.getConfig("timeout") || defaultBuildTimeout

    const syncCommand = ["skopeo", `--command-timeout=${pushTimeout}s`, "copy", "--authfile", "/.docker/config.json"]

    if (provider.config.deploymentRegistry?.insecure === true) {
      syncCommand.push("--dest-tls-verify=false")
    }

    const deploymentImageId = baseResult.outputs.deploymentImageId
    syncCommand.push("oci:" + dataPath, "docker://" + deploymentImageId)

    log.setState(`Pushing image ${deploymentImageId} to registry`)

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
      command: ["sh", "-c", syncCommand.join(" ")],
      timeoutSec: pushTimeout + 5,
      containerName: utilContainerName,
      buffer: true,
    })

    log.debug(skopeoLog)
    log.setState(`Image ${deploymentImageId} built and pushed to registry`)

    return baseResult
  } finally {
    await tempDir.cleanup()
  }
}
