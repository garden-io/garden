/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { cloneDeep } from "lodash-es"
import { joi, joiIdentifier, joiSparseArray } from "../../config/common.js"
import type { KubernetesProvider } from "./config.js"
import type { KubernetesResource } from "./types.js"
import { getResourceContainer, getResourcePodSpec, getWorkloadPods } from "./util.js"
import { ConfigurationError } from "../../exceptions.js"
import { getPlatform } from "../../util/arch-platform.js"
import type { Log } from "../../logger/log-entry.js"
import type { Resolved } from "../../actions/types.js"
import type { KubernetesDeployAction } from "./kubernetes-type/config.js"
import type { HelmDeployAction } from "./helm/config.js"
import type { LocalKubernetesClusterType } from "./local/config.js"
import type { Platform } from "../../util/arch-platform.js"
import { dedent } from "../../util/string.js"
import { exec } from "../../util/util.js"
import type { KubeApi } from "./api.js"
import type { KubernetesWorkload } from "./types.js"
import type { KubernetesTargetResourceSpec } from "./config.js"

export interface LocalVolumeTargetSpec {
  kind: string
  name: string
  containerName?: string
}

export interface LocalVolumeSpec {
  name: string
  target?: LocalVolumeTargetSpec
  sourcePath: string
  containerPath: string
  excludes?: string[]
}

export interface LocalVolumesActionSpec {
  enabled?: boolean
  volumes?: LocalVolumeSpec[]
}

const localVolumeTargetSchema = () =>
  joi.object().keys({
    kind: joi.string().required().description("The kind of the target resource (e.g. Deployment, StatefulSet)."),
    name: joi.string().required().description("The name of the target resource."),
    containerName: joi
      .string()
      .optional()
      .description("The name of the container to mount the volume into. Defaults to the first container."),
  })

const localVolumeSpecSchema = () =>
  joi.object().keys({
    name: joiIdentifier().required().description("A unique name for this volume mount."),
    target: localVolumeTargetSchema()
      .optional()
      .description("The target resource to mount this volume into. Overrides `spec.defaultTarget` if set."),
    sourcePath: joi
      .posixPath()
      .subPathOnly()
      .required()
      .description("The path on the host, relative to the action source directory, to mount into the container."),
    containerPath: joi
      .string()
      .required()
      .description("The absolute path inside the container where the volume should be mounted."),
    excludes: joi
      .array()
      .items(joi.string())
      .optional()
      .description(
        dedent`
        A list of subdirectories to mask with emptyDir volumes. Each entry is a path relative to
        \`containerPath\`. This is useful when the host mount would overlay directories that were
        populated during the image build (e.g. \`node_modules\`, Python virtualenvs). The container
        sees an initially empty directory at each excluded path and can repopulate it at startup.
        `
      ),
  })

export const localVolumesActionSchema = () =>
  joi
    .object()
    .keys({
      enabled: joi
        .boolean()
        .optional()
        .description(
          "Whether local volume mounts are enabled for this action. Defaults to true when volumes are defined."
        ),
      volumes: joiSparseArray(localVolumeSpecSchema()).description(
        dedent`
        List of local volumes to mount into the target resource(s).
        Each volume maps a host directory to a container path in the specified target workload.
        `
      ),
    })
    .description(
      dedent`
      **Experimental**: Configure local host volume mounts for development. When enabled, Garden
      injects hostPath volumes into the target workloads, mapping local directories into containers.
      This is useful for local development where you want to mount source code directly instead of
      using file sync.

      Garden automatically converts host paths to the correct format based on the local Kubernetes
      cluster type (Docker Desktop, kind, minikube, Orbstack) and OS (macOS, Linux, Windows).

      Note: This feature is still experimental and its configuration format may change in future
      releases.
      `
    )

export function isLocalVolumesEnabled(actionSpec?: LocalVolumesActionSpec): boolean {
  // Enabled by default when volumes are defined, unless explicitly disabled
  return actionSpec?.enabled !== false
}

/**
 * **Experimental**: Converts a host-absolute path to the path as seen from the Kubernetes node.
 *
 * - kind/minikube: paths are mounted directly into the node, so used as-is
 * - macOS (Docker Desktop, Orbstack): host paths are exposed at the same location
 * - Linux (Docker Desktop): host filesystem is mounted at /host_mnt
 * - Windows (Docker Desktop): drive letters are converted, e.g. C:\Users\... -> /run/desktop/mnt/host/c/Users/...
 */
export function convertHostPath(
  hostPath: string,
  platform: Platform,
  clusterType?: LocalKubernetesClusterType
): string {
  // For kind and minikube, paths are mounted directly into the node
  if (clusterType === "kind" || clusterType === "minikube") {
    return hostPath
  }

  // For Docker Desktop / generic clusters, conversion depends on platform
  switch (platform) {
    case "darwin":
      // macOS: Docker Desktop and Orbstack expose host filesystem at the same paths
      return hostPath

    case "linux":
    case "alpine":
      // Linux Docker Desktop mounts host filesystem at /host_mnt
      return `/host_mnt${hostPath}`

    case "windows":
      // Windows Docker Desktop: C:\Users\... -> /run/desktop/mnt/host/c/Users/...
      return convertWindowsPath(hostPath)

    default:
      return hostPath
  }
}

function convertWindowsPath(hostPath: string): string {
  // Check for drive letter pattern (e.g. C:\Users\...)
  if (hostPath.length >= 2 && hostPath[1] === ":") {
    const driveLetter = hostPath[0].toLowerCase()
    const restOfPath = hostPath.slice(3) // Skip "C:\" or "C:/"
    const normalizedRest = restOfPath.replace(/\\/g, "/")
    return `/run/desktop/mnt/host/${driveLetter}/${normalizedRest}`
  }
  // Not a drive-letter path, return as-is with backslash conversion
  return hostPath.replace(/\\/g, "/")
}

type LocalVolumesAction = Resolved<KubernetesDeployAction> | Resolved<HelmDeployAction>

/**
 * Converts a `spec.defaultTarget` (KubernetesTargetResourceSpec) into a LocalVolumeTargetSpec
 * if it has the required kind and name fields. Returns undefined if the target is not usable
 * for local volumes (e.g. it only has a podSelector, or kind/name are missing).
 */
function resolveDefaultTargetForLocalVolumes(
  specDefaultTarget: KubernetesTargetResourceSpec | undefined
): LocalVolumeTargetSpec | undefined {
  if (specDefaultTarget?.kind && specDefaultTarget?.name) {
    return {
      kind: specDefaultTarget.kind,
      name: specDefaultTarget.name,
      containerName: specDefaultTarget.containerName,
    }
  }
  return undefined
}

/**
 * **Experimental**: Injects local host volumes into the target workloads in the given manifests.
 *
 * Follows the same pattern as `configureSyncMode()`:
 * - Deep-clones manifests to avoid modifying inputs in-place
 * - Finds target resources by kind + name
 * - Modifies their podSpec to add volumes and volumeMounts
 * - Returns the full manifest list and the updated resources
 */
export async function configureLocalVolumes({
  provider,
  action,
  defaultTarget: specDefaultTarget,
  manifests,
  log,
}: {
  provider: KubernetesProvider
  action: LocalVolumesAction
  defaultTarget?: KubernetesTargetResourceSpec
  manifests: KubernetesResource[]
  log: Log
}): Promise<{ manifests: KubernetesResource[]; updated: KubernetesResource[] }> {
  const spec = action.getSpec()
  const localVolumesSpec = (spec as { localVolumes?: LocalVolumesActionSpec }).localVolumes

  if (!localVolumesSpec?.volumes?.length || !isLocalVolumesEnabled(localVolumesSpec)) {
    return { manifests, updated: [] }
  }

  // Local volumes require a local cluster (hostPath volumes won't work on remote clusters)
  const clusterType = provider.config.clusterType
  if (!clusterType) {
    throw new ConfigurationError({
      message: dedent`
        Local volume mounts are only supported on local Kubernetes clusters (e.g. Docker Desktop, kind, minikube).
        The current provider does not appear to be a local cluster (no clusterType detected).
        Use the \`local-kubernetes\` provider for local development with volume mounts.
      `,
    })
  }

  // Deep-clone to avoid modifying inputs in-place
  manifests = cloneDeep(manifests)

  const platform = getPlatform()
  const defaultTarget = resolveDefaultTargetForLocalVolumes(specDefaultTarget)
  const updatedResources = new Map<string, KubernetesResource>()

  for (const volumeSpec of localVolumesSpec.volumes) {
    const target = volumeSpec.target || defaultTarget

    if (!target) {
      throw new ConfigurationError({
        message: dedent`
          Local volume "${volumeSpec.name}" has no target specified and no defaultTarget is set.
          Either set a target on the volume or set spec.defaultTarget with kind and name.
        `,
      })
    }

    // Find the target manifest
    const targetManifest = manifests.find((m) => m.kind === target.kind && m.metadata?.name === target.name)

    if (!targetManifest) {
      throw new ConfigurationError({
        message: `Could not find target resource ${target.kind}/${target.name} for local volume "${volumeSpec.name}".`,
      })
    }

    // Get podSpec and target container
    const podSpec = getResourcePodSpec(targetManifest as any)
    if (!podSpec) {
      throw new ConfigurationError({
        message: `Target resource ${target.kind}/${target.name} does not have a pod spec.`,
      })
    }

    const container = getResourceContainer(targetManifest as any, target.containerName)

    // Resolve and convert the source path
    const absoluteSourcePath = resolve(action.sourcePath(), volumeSpec.sourcePath)
    const convertedPath = convertHostPath(absoluteSourcePath, platform, clusterType)

    log.info(`Local volume "${volumeSpec.name}": Mounting ${absoluteSourcePath} at ${volumeSpec.containerPath}`)
    if (convertedPath !== absoluteSourcePath) {
      log.info(
        `Local volume "${volumeSpec.name}": host path converted to ${convertedPath} (${clusterType || platform})`
      )
    }

    // Add the volume to podSpec
    if (!podSpec.volumes) {
      podSpec.volumes = []
    }
    // Avoid duplicate volume names
    if (!podSpec.volumes.find((v) => v.name === volumeSpec.name)) {
      podSpec.volumes.push({
        name: volumeSpec.name,
        hostPath: {
          path: convertedPath,
          type: "DirectoryOrCreate",
        },
      })
    }

    // Add the volumeMount to the container
    if (!container.volumeMounts) {
      container.volumeMounts = []
    }
    // Avoid duplicate mount names
    if (!container.volumeMounts.find((vm) => vm.name === volumeSpec.name)) {
      container.volumeMounts.push({
        name: volumeSpec.name,
        mountPath: volumeSpec.containerPath,
      })
    }

    // Add emptyDir mask volumes for excluded subdirectories
    if (volumeSpec.excludes?.length) {
      for (const exclude of volumeSpec.excludes) {
        const sanitized = exclude
          .replace(/[^a-z0-9-]/gi, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase()
        const maskVolumeName = `${volumeSpec.name}-${sanitized}`
        const maskMountPath = `${volumeSpec.containerPath.replace(/\/$/, "")}/${exclude}`

        if (!podSpec.volumes!.find((v) => v.name === maskVolumeName)) {
          podSpec.volumes!.push({
            name: maskVolumeName,
            emptyDir: {},
          })
        }

        if (!container.volumeMounts.find((vm) => vm.name === maskVolumeName)) {
          container.volumeMounts.push({
            name: maskVolumeName,
            mountPath: maskMountPath,
          })
        }

        log.info(`Local volume "${volumeSpec.name}": excluding ${exclude} (emptyDir at ${maskMountPath})`)
      }
    }

    const resourceKey = `${target.kind}/${target.name}`
    updatedResources.set(resourceKey, targetManifest)
  }

  return { manifests, updated: Array.from(updatedResources.values()) }
}

/**
 * **Experimental**: Validates that local volume mounts are accessible on the Kubernetes node.
 * Called during prepareEnvironment for local-kubernetes provider.
 *
 * - kind: verifies project directory is mounted into the kind node via docker exec
 * - minikube: verifies project directory is accessible, starts `minikube mount` if needed
 * - generic (Docker Desktop, Orbstack): no validation needed
 */
export async function validateLocalMounts({
  provider,
  log,
  projectPath,
}: {
  provider: KubernetesProvider
  log: Log
  projectPath: string
}): Promise<void> {
  const clusterType = provider.config.clusterType
  const context = provider.config.context

  if (clusterType === "kind") {
    await validateKindMount({ context, projectPath, log })
  } else if (clusterType === "minikube") {
    await validateMinikubeMount({ projectPath, log })
  } else {
    log.verbose("Local volumes: no additional mount setup needed for this cluster type.")
  }
}

async function validateKindMount({
  context,
  projectPath,
  log,
}: {
  context: string
  projectPath: string
  log: Log
}): Promise<void> {
  // Extract cluster name from context (format: kind-<name>)
  const clusterName = context.startsWith("kind-") ? context.slice(5) : "kind"
  const nodeName = `${clusterName}-control-plane`

  log.verbose(`Checking kind mount: verifying ${projectPath} is accessible in node ${nodeName}`)

  try {
    await exec("docker", ["exec", nodeName, "ls", projectPath])
    log.info("kind: Project directory is mounted. OK.")
  } catch {
    throw new ConfigurationError({
      message: dedent`
        kind cluster does not have the project directory mounted.
        Local volume mounts will not work until the project directory is accessible in the kind node.

        To fix, recreate your kind cluster with extraMounts:

          kind delete cluster${clusterName !== "kind" ? ` --name ${clusterName}` : ""}
          kind create cluster${clusterName !== "kind" ? ` --name ${clusterName}` : ""} --config <config-with-extraMounts>

        Your kind config should include:

          nodes:
            - role: control-plane
              extraMounts:
                - hostPath: ${projectPath}
                  containerPath: ${projectPath}
      `,
    })
  }
}

async function validateMinikubeMount({ projectPath, log }: { projectPath: string; log: Log }): Promise<void> {
  log.verbose(`Checking minikube mount: verifying ${projectPath} is accessible`)

  try {
    await exec("minikube", ["ssh", `ls ${projectPath}`])
    log.info("minikube: Project directory is mounted. OK.")
    return
  } catch {
    // Mount is not available, try to start it
  }

  log.info("Starting minikube mount for project directory...")

  // Start minikube mount in background
  const { exec: cpExec } = await import("child_process")
  const mountProcess = cpExec(`minikube mount "${projectPath}:${projectPath}"`, {
    stdio: "ignore",
    detached: true,
  } as any)
  mountProcess.unref?.()

  // Wait for mount to become available (up to 30 seconds)
  const maxWaitSeconds = 30
  for (let i = 0; i < maxWaitSeconds; i++) {
    try {
      await exec("minikube", ["ssh", `ls ${projectPath}`])
      log.info(`minikube mount ready (PID ${mountProcess.pid})`)
      return
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new ConfigurationError({
    message: dedent`
      minikube mount did not become ready within ${maxWaitSeconds} seconds.
      Please check that minikube is running and try mounting manually:

        minikube mount "${projectPath}:${projectPath}"
    `,
  })
}

// --- Post-deploy validation ---

/**
 * **Experimental**: After deploying, exec into pods to verify that local volume mounts are visible.
 * Logs a success message with file count, or a warning if the mount point appears empty.
 */
export async function validateLocalVolumeMountsPostDeploy({
  api,
  namespace,
  action,
  defaultTarget: specDefaultTarget,
  updatedResources,
  log,
}: {
  api: KubeApi
  namespace: string
  action: LocalVolumesAction
  defaultTarget?: KubernetesTargetResourceSpec
  updatedResources: KubernetesResource[]
  log: Log
}): Promise<void> {
  const spec = action.getSpec()
  const localVolumesSpec = (spec as { localVolumes?: LocalVolumesActionSpec }).localVolumes
  if (!localVolumesSpec?.volumes?.length) {
    return
  }

  for (const resource of updatedResources) {
    // Find volumes that target this resource
    const defaultTarget = resolveDefaultTargetForLocalVolumes(specDefaultTarget)
    const volumesForResource = localVolumesSpec.volumes.filter((v) => {
      const target = v.target || defaultTarget
      return target && target.kind === resource.kind && target.name === resource.metadata?.name
    })

    if (!volumesForResource.length) {
      continue
    }

    // Get a running pod for this resource
    let podName: string
    let containerName: string | undefined
    try {
      const pods = await getWorkloadPods({ api, namespace, resource: resource as KubernetesWorkload })
      const runningPod = pods.find((p) => p.status?.phase === "Running")
      if (!runningPod) {
        log.verbose(
          `No running pod found for ${resource.kind}/${resource.metadata?.name}, skipping mount verification.`
        )
        continue
      }
      podName = runningPod.metadata!.name
      // Use the container name from the first volume's target (they all target the same resource)
      const target = volumesForResource[0].target || defaultTarget
      containerName = target?.containerName || runningPod.spec!.containers[0].name
    } catch {
      log.verbose(`Could not list pods for ${resource.kind}/${resource.metadata?.name}, skipping mount verification.`)
      continue
    }

    // Verify each volume mount
    for (const volumeSpec of volumesForResource) {
      try {
        const result = await api.execInPod({
          log,
          namespace,
          podName,
          containerName: containerName!,
          command: ["ls", volumeSpec.containerPath],
          buffer: true,
          tty: false,
          timeoutSec: 5,
        })

        const files = (result.stdout || "").trim().split("\n").filter(Boolean)
        if (files.length > 0) {
          log.info(
            `Verified local volume "${volumeSpec.name}": ${files.length} files visible at ${volumeSpec.containerPath}`
          )
        } else {
          log.warn(
            `Local volume "${volumeSpec.name}": mount point ${volumeSpec.containerPath} appears empty. ` +
              `Check that ${resolve(action.sourcePath(), volumeSpec.sourcePath)} exists and contains files.`
          )
        }
      } catch {
        log.warn(
          `Local volume "${volumeSpec.name}": could not verify mount at ${volumeSpec.containerPath}. ` +
            `Check that the source directory exists and is accessible from the cluster node.`
        )
      }
    }
  }
}
