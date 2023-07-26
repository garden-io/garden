/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { readFile } from "fs-extra"
import Bluebird from "bluebird"
import { flatten, set } from "lodash"
import { loadAll } from "js-yaml"

import { KubernetesModule } from "./module-config"
import { KubernetesResource } from "../types"
import { KubeApi } from "../api"
import { gardenAnnotationKey } from "../../../util/string"
import { Log } from "../../../logger/log-entry"
import { PluginContext } from "../../../plugin-context"
import { ConfigurationError, PluginError } from "../../../exceptions"
import { KubernetesPluginContext, KubernetesTargetResourceSpec, ServiceResourceSpec } from "../config"
import { HelmModule } from "../helm/module-config"
import { KubernetesDeployAction } from "./config"
import { CommonRunParams } from "../../../plugin/handlers/Run/run"
import { runAndCopy } from "../run"
import { getTargetResource, getResourcePodSpec, getResourceContainer, makePodName } from "../util"
import { Resolved } from "../../../actions/types"
import { KubernetesPodRunAction, KubernetesPodTestAction } from "./kubernetes-pod"

/**
 * Reads the manifests and makes sure each has a namespace set (when applicable) and adds annotations.
 * Use this when applying to the cluster, or comparing against deployed resources.
 */
export async function getManifests({
  ctx,
  api,
  log,
  action,
  defaultNamespace,
  readFromSrcDir = false,
}: {
  ctx: PluginContext
  api: KubeApi
  log: Log
  action: Resolved<KubernetesDeployAction | KubernetesPodRunAction | KubernetesPodTestAction>
  defaultNamespace: string
  readFromSrcDir?: boolean
}): Promise<KubernetesResource[]> {
  const rawManifests = (await readManifests(ctx, action, log, readFromSrcDir)) as KubernetesResource[]

  // remove *List objects
  const manifests = rawManifests.flatMap((manifest) => {
    if (manifest?.kind?.endsWith("List")) {
      if (!manifest.items || manifest.items.length === 0) {
        // empty list
        return []
      } else if (manifest.items.length > 0 && manifest.items[0].kind) {
        // at least the first manifest has a kind: seems to be a valid List
        return manifest.items as KubernetesResource[]
      } else {
        throw new PluginError({
          message: "Failed to read Kubernetes manifest: Encountered an invalid List manifest",
          detail: {
            manifest,
          },
        })
      }
    }
    return manifest
  })

  return Bluebird.map(manifests, async (manifest) => {
    // Ensure a namespace is set, if not already set, and if required by the resource type
    if (!manifest.metadata?.namespace) {
      if (!manifest.metadata) {
        // TODO: Type system complains that name is missing
        ;(manifest as any).metadata = {}
      }

      const info = await api.getApiResourceInfo(log, manifest.apiVersion, manifest.kind)

      if (info?.namespaced) {
        manifest.metadata.namespace = defaultNamespace
      }
    }

    /**
     * Set Garden annotations.
     *
     * For namespace resources, we use the namespace's name as the annotation value, to ensure that namespace resources
     * with different names aren't considered by Garden to be the same resource.
     *
     * This is relevant e.g. in the context of a shared dev cluster, where several users might create their own
     * copies of a namespace resource (each named e.g. "${username}-some-namespace") through deploying a `kubernetes`
     * module that includes a namespace resource in its manifests.
     */
    const annotationValue =
      manifest.kind === "Namespace" ? gardenNamespaceAnnotationValue(manifest.metadata.name) : action.name
    set(manifest, ["metadata", "annotations", gardenAnnotationKey("service")], annotationValue)
    set(manifest, ["metadata", "annotations", gardenAnnotationKey("mode")], action.mode())
    set(manifest, ["metadata", "labels", gardenAnnotationKey("service")], annotationValue)

    return manifest
  })
}

const disallowedKustomizeArgs = ["-o", "--output", "-h", "--help"]

/**
 * Read the manifests from the module config, as well as any referenced files in the config.
 *
 * @param module The kubernetes module to read manifests for.
 * @param readFromSrcDir Whether or not to read the manifests from the module build dir or from the module source dir.
 * In general we want to read from the build dir to ensure that manifests added via the `build.dependencies[].copy`
 * field will be included. However, in some cases, e.g. when getting the service status, we can't be certain that
 * the build has been staged and we therefore read the manifests from the source.
 *
 * TODO: Remove this once we're checking for kubernetes module service statuses with version hashes.
 */
export async function readManifests(
  ctx: PluginContext,
  action: Resolved<KubernetesDeployAction | KubernetesPodRunAction | KubernetesPodTestAction>,
  log: Log,
  readFromSrcDir = false
) {
  const manifestPath = readFromSrcDir ? action.basePath() : action.getBuildPath()

  const spec = action.getSpec()

  const fileManifests = flatten(
    await Bluebird.map(spec.files, async (path) => {
      const absPath = resolve(manifestPath, path)
      log.debug(`Reading manifest for module ${action.name} from path ${absPath}`)
      const str = (await readFile(absPath)).toString()
      const resolved = ctx.resolveTemplateStrings(str, { allowPartial: true, unescape: true })
      return loadAll(resolved)
    })
  )

  let kustomizeManifests: any[] = []

  if (spec.kustomize?.path) {
    const kustomize = ctx.tools["kubernetes.kustomize"]

    const extraArgs = spec.kustomize.extraArgs || []

    for (const arg of disallowedKustomizeArgs) {
      if (extraArgs.includes(arg)) {
        throw new ConfigurationError({
          message: `kustomize.extraArgs must not include any of ${disallowedKustomizeArgs.join(", ")}`,
          detail: {
            spec,
            extraArgs,
          },
        })
      }
    }

    try {
      const kustomizeOutput = await kustomize.stdout({
        cwd: manifestPath,
        log,
        args: ["build", spec.kustomize.path, ...extraArgs],
      })
      kustomizeManifests = loadAll(kustomizeOutput)
    } catch (error) {
      throw new PluginError({
        message: `Failed resolving kustomize manifests: ${error.message}`,
        detail: {
          error,
          spec,
        },
      })
    }
  }

  return [...spec.manifests, ...fileManifests, ...kustomizeManifests]
}

/**
 * We use this annotation value for namespace resources to avoid potential conflicts with module names (since module
 * names can't start with `garden`).
 */
export function gardenNamespaceAnnotationValue(namespaceName: string) {
  return `garden-namespace--${namespaceName}`
}

export function convertServiceResource(
  module: KubernetesModule | HelmModule,
  serviceResourceSpec?: ServiceResourceSpec
): KubernetesTargetResourceSpec | null {
  const s = serviceResourceSpec || module.spec.serviceResource

  if (!s) {
    return null
  }

  return {
    kind: s.kind,
    name: s.name || module.name,
    podSelector: s.podSelector,
    containerName: s.containerName,
  }
}

export async function runOrTestWithPod(
  params: CommonRunParams & {
    ctx: KubernetesPluginContext
    action: Resolved<KubernetesPodRunAction | KubernetesPodTestAction>
    log: Log
    namespace: string
  }
) {
  const { ctx, action, log, namespace } = params
  // Get the container spec to use for running
  const spec = action.getSpec()
  const version = action.versionString()

  let podSpec = spec.podSpec
  let container = spec.podSpec?.containers[0]

  if (!podSpec) {
    const resourceSpec = spec.resource

    if (!resourceSpec) {
      // Note: This will generally be caught in schema validation.
      throw new ConfigurationError({
        message: `${action.longDescription()} specified neither podSpec nor resource.`,
        detail: { spec },
      })
    }
    const k8sCtx = <KubernetesPluginContext>ctx
    const provider = k8sCtx.provider
    const api = await KubeApi.factory(log, ctx, provider)
    const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })
    const target = await getTargetResource({
      ctx,
      log,
      provider: ctx.provider,
      action,
      manifests,
      query: resourceSpec,
    })
    podSpec = getResourcePodSpec(target)
    container = getResourceContainer(target, resourceSpec.containerName)
  } else if (!container) {
    throw new ConfigurationError({
      message: `${action.longDescription()} specified a podSpec without containers. Please make sure there is at least one container in the spec.`,
      detail: { spec },
    })
  }

  return runAndCopy({
    ...params,
    container,
    podSpec,
    command: spec.command,
    args: spec.args,
    artifacts: spec.artifacts,
    envVars: spec.env,
    image: container.image!,
    namespace,
    podName: makePodName(action.kind.toLowerCase(), action.name),
    timeout: action.getConfig().timeout,
    version,
  })
}
