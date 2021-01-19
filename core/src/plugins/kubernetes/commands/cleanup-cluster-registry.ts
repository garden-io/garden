/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { chunk } from "lodash"
import pluralize = require("pluralize")
import { PluginCommand } from "../../../types/plugin/command"
import { KubernetesPluginContext, KubernetesProvider } from "../config"
import { KubeApi } from "../api"
import { KubernetesPod, KubernetesDeployment, KubernetesResource } from "../types"
import { flatten, uniq, difference } from "lodash"
import { V1Container } from "@kubernetes/client-node"
import { queryRegistry } from "../container/util"
import { splitFirst, splitLast } from "../../../util/util"
import { LogEntry } from "../../../logger/log-entry"
import Bluebird from "bluebird"
import { CLUSTER_REGISTRY_DEPLOYMENT_NAME, inClusterRegistryHostname, dockerDaemonContainerName } from "../constants"
import { PluginError } from "../../../exceptions"
import { apply } from "../kubectl"
import { waitForResources } from "../status/status"
import { execInWorkload } from "../container/exec"
import { dedent, deline } from "../../../util/string"
import { buildSyncDeploymentName } from "../container/build/common"
import { getDeploymentPod } from "../util"
import { getSystemNamespace } from "../namespace"
import { PluginContext } from "../../../plugin-context"
import { PodRunner } from "../run"
import { getDockerDaemonPodRunner } from "../container/build/cluster-docker"

const workspaceSyncDirTtl = 0.5 * 86400 // 2 days

export const cleanupClusterRegistry: PluginCommand = {
  name: "cleanup-cluster-registry",
  description: "Clean up unused images in the in-cluster registry and cache.",

  title: "Cleaning up caches and unused images from the in-cluster registry",

  handler: async ({ ctx, log }) => {
    const result = {}

    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    if (provider.config.buildMode === "local-docker") {
      throw new PluginError(`Cannot run cluster cleanup with buildMode=local-docker`, {
        provider,
      })
    }

    // Scan through all Pods in cluster
    const api = await KubeApi.factory(log, ctx, provider)
    const systemNamespace = await getSystemNamespace(ctx, provider, log)

    const imagesInUse = await getImagesInUse(api, provider, log)

    // Get images in registry
    if (provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
      try {
        const images = await getImagesInRegistry(k8sCtx, log)

        // Delete images no longer in use
        const diff = difference(images, imagesInUse)
        await deleteImagesFromRegistry(k8sCtx, log, diff)

        // Run garbage collection
        await runRegistryGarbageCollection(k8sCtx, api, log)
      } catch (error) {
        // Catch this and continue, so that other steps may be completed
        log.error({
          msg: `Failed cleaning images from in-cluster registry: ${error}\n\nSee error.log for details`,
          error,
        })
      }
    } else {
      log.info("Not using in-cluster registry, skipping registry cleanup.")
    }

    if (provider.config.buildMode === "cluster-docker") {
      await deleteImagesFromDaemon({ api, ctx, provider, log, imagesInUse, systemNamespace })
    }

    // Clean old directories from build sync volume
    await cleanupBuildSyncVolume({ api, ctx, provider, log, systemNamespace })

    log.info({ msg: chalk.green("\nDone!"), status: "success" })

    return { result }
  },
}

async function getImagesInUse(api: KubeApi, provider: KubernetesProvider, log: LogEntry) {
  log = log.info({
    msg: chalk.white(`Scanning all Pods in the cluster...`),
    status: "active",
  })

  const pods: KubernetesPod[] = []
  let _continue: string | undefined

  while (true) {
    const page = await api.core.listPodForAllNamespaces(undefined, _continue)
    pods.push(...page.items)

    if (page.metadata._continue) {
      _continue = page.metadata._continue
    } else {
      break
    }
  }

  // Collect all image names
  const containers: V1Container[] = flatten(pods.map((p) => p.spec.containers))
  const allImageNames = uniq(containers.map((c) => c.image!))

  const registryPrefix = provider.config.deploymentRegistry!.hostname + "/"
  const registryImageNames = allImageNames
    .filter((name) => name.startsWith(registryPrefix))
    // Remove the hostname part of the image name
    .map((name) => splitFirst(name, "/")[1])

  log.info(
    `Found ${allImageNames.length} images in use in cluster, ` +
      `${registryImageNames.length} referencing the in-cluster registry.`
  )
  log.setSuccess()

  return registryImageNames
}

async function getImagesInRegistry(ctx: KubernetesPluginContext, log: LogEntry) {
  log = log.info({
    msg: chalk.white(`Listing all images in cluster registry...`),
    status: "active",
  })

  const repositories: string[] = []
  let nextUrl = "_catalog"

  while (nextUrl) {
    const res = await queryRegistry(ctx, log, nextUrl)
    const body = JSON.parse(res.body)
    repositories.push(...body.repositories)

    // Paginate
    const linkHeader = <string | undefined>res.headers["Link"]
    if (linkHeader) {
      nextUrl = linkHeader.match(/<(.*)>/)![1]
    } else {
      nextUrl = ""
    }
  }

  const images: string[] = []

  for (const repo of repositories) {
    nextUrl = `${repo}/tags/list`

    while (nextUrl) {
      const res = await queryRegistry(ctx, log, nextUrl)
      const body = JSON.parse(res.body)
      if (body.tags) {
        images.push(...body.tags.map((tag: string) => `${repo}:${tag}`))
      }
      // Paginate
      const linkHeader = <string | undefined>res.headers["link"]
      if (linkHeader) {
        nextUrl = linkHeader.match(/<(.*)>/)![1]
      } else {
        nextUrl = ""
      }
    }
  }

  log.info(`Found ${images.length} images in the registry.`)
  log.setSuccess()

  return images
}

async function deleteImagesFromRegistry(ctx: KubernetesPluginContext, log: LogEntry, images: string[]) {
  log = log.info({
    msg: chalk.white(`Flagging ${images.length} unused images as deleted in cluster registry...`),
    status: "active",
  })

  await Bluebird.map(
    images,
    async (image) => {
      try {
        // Get the digest for the image
        const [name, tag] = splitLast(image, ":")
        const res = await queryRegistry(ctx, log, `${name}/manifests/${tag}`, {
          method: "HEAD",
          headers: {
            Accept: "application/vnd.docker.distribution.manifest.v2+json",
          },
        })
        const digest = res.headers["docker-content-digest"]

        // Issue the delete request
        await queryRegistry(ctx, log, `${name}/manifests/${digest}`, {
          method: "DELETE",
        })
      } catch (err) {
        if (err.response?.statusCode !== 404) {
          throw err
        }
      }
    },
    { concurrency: 100 }
  )

  log.info(`Flagged ${images.length} images as deleted in the registry.`)
  log.setSuccess()

  return images
}

async function runRegistryGarbageCollection(ctx: KubernetesPluginContext, api: KubeApi, log: LogEntry) {
  log = log.info({
    msg: chalk.white(`Running garbage collection in cluster registry...`),
    status: "active",
  })

  const provider = ctx.provider
  const systemNamespace = await getSystemNamespace(ctx, provider, log)
  // Restart the registry in read-only mode
  // -> Get the original deployment
  log.info("Fetching original Deployment")

  let registryDeployment = await api.apps.readNamespacedDeployment(CLUSTER_REGISTRY_DEPLOYMENT_NAME, systemNamespace)

  // -> Modify with read only env var and apply
  log.info("Re-starting in read-only mode...")

  const modifiedDeployment: KubernetesDeployment = sanitizeResource(registryDeployment)

  modifiedDeployment.spec!.template.spec!.containers[0].env!.push({
    name: "REGISTRY_STORAGE_MAINTENANCE",
    // This needs to be YAML because of issue https://github.com/docker/distribution/issues/1736
    value: dedent`
      uploadpurging:
        enabled: false
      readonly:
        enabled: true
    `,
  })
  delete modifiedDeployment.status

  try {
    await apply({
      ctx,
      log,
      provider,
      manifests: [modifiedDeployment],
      namespace: systemNamespace,
    })

    // -> Wait for registry to be up again
    await waitForResources({
      namespace: systemNamespace,
      ctx,
      provider,
      log,
      serviceName: "docker-registry",
      resources: [modifiedDeployment],
    })

    // Run garbage collection
    log.info("Running garbage collection...")
    await execInWorkload({
      ctx,
      provider,
      log,
      namespace: systemNamespace,
      workload: modifiedDeployment,
      command: ["/bin/registry", "garbage-collect", "/etc/docker/registry/config.yml"],
      interactive: false,
    })
  } finally {
    // Restart the registry again as normal
    log.info("Restarting without read-only mode...")

    // -> Re-apply the original deployment
    registryDeployment = await api.apps.readNamespacedDeployment(CLUSTER_REGISTRY_DEPLOYMENT_NAME, systemNamespace)
    const writableRegistry = sanitizeResource(registryDeployment)
    // -> Remove the maintenance flag
    writableRegistry.spec.template.spec!.containers[0].env =
      writableRegistry.spec?.template.spec?.containers[0].env?.filter(
        (e) => e.name !== "REGISTRY_STORAGE_MAINTENANCE"
      ) || []

    await apply({
      ctx,
      log,
      provider,
      manifests: [writableRegistry],
      namespace: systemNamespace,
    })

    // -> Wait for registry to be up again
    await waitForResources({
      namespace: systemNamespace,
      ctx,
      provider,
      log,
      serviceName: "docker-registry",
      resources: [modifiedDeployment],
    })
  }

  log.info(`Completed registry garbage collection.`)
  log.setSuccess()
}

function sanitizeResource<T extends KubernetesResource>(resource: T): T {
  // Cloning and clearing out status + any undefined values
  const output = JSON.parse(JSON.stringify(resource))
  output.status && delete output.status
  return output
}

async function deleteImagesFromDaemon({
  api,
  ctx,
  provider,
  log,
  imagesInUse,
  systemNamespace,
}: {
  api: KubeApi
  ctx: PluginContext
  provider: KubernetesProvider
  log: LogEntry
  imagesInUse: string[]
  systemNamespace: string
}) {
  log = log.info({
    msg: chalk.white(`Cleaning images from Docker daemon...`),
    status: "active",
  })

  log.info("Getting list of images from daemon...")

  const runner = await getDockerDaemonPodRunner({ api, systemNamespace, ctx, provider })

  const res = await runner.exec({
    log,
    command: ["docker", "images", "--format", "{{.Repository}}:{{.Tag}}"],
    containerName: dockerDaemonContainerName,
    timeoutSec: 300,
  })

  const imagesInDaemon = res.log
    .split("\n")
    .filter(Boolean)
    // Not sure why we see some of these
    .filter((i) => !i.includes("<none>"))
    .map((i) => i.trim())

  log.info(`${imagesInDaemon.length} tagged images in daemon.`)

  const host = provider.config.deploymentRegistry!.hostname
  const imagesWithHost = imagesInUse.map((name) => `${host}/${name}`)
  const imagesToDelete = difference(imagesInDaemon, imagesWithHost)

  // Delete all the images
  if (imagesToDelete.length === 0) {
    log.info(`Nothing to clean up.`)
  } else {
    const batchSize = 100
    const imagesBatches: string[][] = chunk(imagesToDelete, batchSize)

    let counter = imagesBatches.length
    log.info(dedent`Cleaning up ${counter} batches of images (total of ${imagesToDelete.length} images)...`)

    await Bluebird.map(
      imagesBatches,
      async (images) => {
        await runner.exec({
          log,
          command: ["docker", "rmi", ...images],
          containerName: dockerDaemonContainerName,
          timeoutSec: 600,
        })
        log.setState(deline`
        Deleting images:
         ${pluralize("batch", counter, true)} of ${imagesBatches.length} left...`)
        counter -= 1
      },
      { concurrency: 25 }
    )
  }

  // Run a prune operation
  log.info(`Pruning with \`docker image prune -f\`...`)
  await runner.exec({
    log,
    command: ["docker", "image", "prune", "-f"],
    containerName: dockerDaemonContainerName,
    timeoutSec: 1000,
  })

  log.setSuccess()
}

async function cleanupBuildSyncVolume({
  api,
  ctx,
  provider,
  log,
  systemNamespace,
}: {
  api: KubeApi
  ctx: PluginContext
  provider: KubernetesProvider
  log: LogEntry
  systemNamespace: string
}) {
  log = log.info({
    msg: chalk.white(`Cleaning up old workspaces from build sync volume...`),
    status: "active",
  })

  const pod = await getDeploymentPod({ api, deploymentName: buildSyncDeploymentName, namespace: systemNamespace })

  const runner = new PodRunner({
    api,
    ctx,
    provider,
    namespace: systemNamespace,
    pod,
  })

  const stat = await runner.exec({
    log,
    command: ["sh", "-c", 'stat /data/* -c "%n %X"'],
    timeoutSec: 300,
  })

  // Remove directories last accessed more than workspaceSyncDirTtl ago
  const minTimestamp = new Date().getTime() / 1000 - workspaceSyncDirTtl

  const outdatedDirs = stat.log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [dirname, lastAccessed] = line.trim().split(" ")
      return { dirname, lastAccessed: parseInt(lastAccessed, 10) }
    })
    .filter(({ dirname, lastAccessed }) => lastAccessed < minTimestamp && dirname !== "/data/tmp")
    .map((d) => d.dirname)

  const dirsToDelete = ["/data/tmp/*", ...outdatedDirs]

  // Delete the directories
  log.info(`Deleting ${dirsToDelete.length} workspace directories.`)

  await Bluebird.map(
    chunk(dirsToDelete, 100),
    () =>
      runner.exec({
        log,
        command: ["rm", "-rf", ...dirsToDelete],
        timeoutSec: 300,
      }),
    { concurrency: 20 }
  )

  log.setSuccess()
}
