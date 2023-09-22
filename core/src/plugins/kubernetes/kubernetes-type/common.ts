/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, resolve } from "path"
import { pathExists, readFile } from "fs-extra"
import { flatten, keyBy, set } from "lodash"
import { loadAll } from "js-yaml"

import { KubernetesModule } from "./module-config"
import { KubernetesResource } from "../types"
import { KubeApi } from "../api"
import { dedent, gardenAnnotationKey, naturalList, stableStringify } from "../../../util/string"
import { Log } from "../../../logger/log-entry"
import { PluginContext } from "../../../plugin-context"
import { ConfigurationError, GardenError, PluginError } from "../../../exceptions"
import { KubernetesPluginContext, KubernetesTargetResourceSpec, ServiceResourceSpec } from "../config"
import { HelmModule } from "../helm/module-config"
import { KubernetesDeployAction } from "./config"
import { CommonRunParams } from "../../../plugin/handlers/Run/run"
import { runAndCopy } from "../run"
import { getResourceContainer, getResourceKey, getResourcePodSpec, getTargetResource, makePodName } from "../util"
import { ActionMode, Resolved } from "../../../actions/types"
import { KubernetesPodRunAction, KubernetesPodTestAction } from "./kubernetes-pod"
import { V1ConfigMap } from "@kubernetes/client-node"
import { glob } from "glob"
import isGlob from "is-glob"
import pFilter from "p-filter"

/**
 * "DeployFile": Manifest has been read from one of the files declared in Garden Deploy `spec.files`
 * "DeployInline": Manifest has been declared inline using Garden Deploy `spec.manifests`
 * "DeployKustomize": Manifest has been declared inline using Garden Deploy `spec.manifests`
 */
type ManifestDeclarationInfo =
  | { type: "file"; filename: string; index: number }
  | { type: "inline"; filename?: string; index: number }
  | { type: "kustomize"; path: string; index: number }

type DeclaredManifest = {
  declaration: ManifestDeclarationInfo
  manifest: KubernetesResource
}

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
}: {
  ctx: PluginContext
  api: KubeApi
  log: Log
  action: Resolved<KubernetesDeployAction | KubernetesPodRunAction | KubernetesPodTestAction>
  defaultNamespace: string
}): Promise<KubernetesResource[]> {
  // Local function to set some default values and Garden-specific annotations.
  async function postProcessManifest({ manifest, declaration }: DeclaredManifest): Promise<DeclaredManifest> {
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

    return { manifest, declaration }
  }

  const declaredManifests = await readManifests(ctx, action, log)

  if (action.kind === "Deploy") {
    // Add metadata ConfigMap to aid quick status check
    const metadataManifest = getMetadataManifest(action, defaultNamespace, declaredManifests)
    const declaredMetadataManifest: DeclaredManifest = {
      declaration: { type: "inline", index: declaredManifests.length },
      manifest: metadataManifest,
    }
    declaredManifests.push(declaredMetadataManifest)
  }

  const postProcessedManifests: DeclaredManifest[] = await Promise.all(declaredManifests.map(postProcessManifest))

  validateDeclaredManifests(postProcessedManifests)

  return postProcessedManifests.map((m) => m.manifest)
}

/**
 * We use this annotation value for namespace resources to avoid potential conflicts with module names (since module
 * names can't start with `garden`).
 */
export function gardenNamespaceAnnotationValue(namespaceName: string) {
  return `garden-namespace--${namespaceName}`
}

/**
 * Verifies that there are no duplicates for every name, kind and namespace.
 *
 * This verification is important because otherwise this error would lead to several kinds of undefined behaviour.
 */
export function validateDeclaredManifests(declaredManifests: DeclaredManifest[]) {
  const renderManifestDeclaration = (m: DeclaredManifest): string => {
    switch (m.declaration.type) {
      case "file":
        return `${m.manifest.kind} ${m.manifest.metadata.name} declared in the file ${m.declaration.filename} (index: ${m.declaration.index})`
      case "inline":
        return `${m.manifest.kind} ${m.manifest.metadata.name} declared inline in the Garden configuration (filename: ${
          m.declaration.filename || "unknown"
        }, index: ${m.declaration.index})`
      case "kustomize":
        return `${m.manifest.kind} ${m.manifest.metadata.name} generated by Kustomize at path ${m.declaration.path} (index: ${m.declaration.index})`
    }
  }

  for (const examinee of declaredManifests) {
    const duplicate = declaredManifests.find(
      (candidate) =>
        examinee !== candidate &&
        examinee.manifest.kind === candidate.manifest.kind &&
        examinee.manifest.metadata.name === candidate.manifest.metadata.name &&
        examinee.manifest.metadata.namespace === candidate.manifest.metadata.namespace
    )

    if (duplicate) {
      throw new ConfigurationError({
        message: dedent`
          Duplicate manifest definition: ${duplicate.manifest.kind} named ${
            duplicate.manifest.metadata.name
          } is declared more than once:

          - ${renderManifestDeclaration(duplicate)}
          - ${renderManifestDeclaration(examinee)}
          `,
      })
    }
  }
}

export interface ManifestMetadata {
  key: string
  apiVersion: string
  kind: string
  name: string
  namespace: string
}

export interface ParsedMetadataManifestData {
  resolvedVersion: string
  mode: ActionMode
  manifestMetadata: { [key: string]: ManifestMetadata }
}

export function getMetadataManifest(
  action: Resolved<KubernetesDeployAction>,
  defaultNamespace: string,
  declaredManifests: DeclaredManifest[]
): KubernetesResource<V1ConfigMap> {
  const manifestMetadata: ManifestMetadata[] = declaredManifests.map((declaredManifest) => {
    const m = declaredManifest.manifest
    return {
      key: getResourceKey(m),
      apiVersion: m.apiVersion,
      kind: m.kind,
      name: m.metadata.name,
      namespace: m.metadata.namespace || defaultNamespace,
    }
  })

  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: `garden-meta-${action.kind.toLowerCase()}-${action.name}`,
    },
    data: {
      resolvedVersion: action.versionString(),
      mode: action.mode(),
      manifestMetadata: stableStringify(keyBy(manifestMetadata, "key")),
    },
  }
}

export function parseMetadataResource(log: Log, resource: KubernetesResource<V1ConfigMap>): ParsedMetadataManifestData {
  // TODO: validate schema here
  const output: ParsedMetadataManifestData = {
    resolvedVersion: resource.data?.resolvedVersion || "",
    mode: (resource.data?.mode || "default") as ActionMode,
    manifestMetadata: {},
  }

  const manifestMetadata = resource.data?.manifestMetadata

  if (manifestMetadata) {
    try {
      // TODO: validate by schema
      output.manifestMetadata = JSON.parse(manifestMetadata)
    } catch (error) {
      log.debug({ msg: `Failed querying for remote resources: ${error}` })
    }
  }

  return output
}

/**
 * Read the manifests from the module config, as well as any referenced files in the config.
 */
export async function readManifests(
  ctx: PluginContext,
  action: Resolved<KubernetesDeployAction | KubernetesPodRunAction | KubernetesPodTestAction>,
  log: Log
): Promise<DeclaredManifest[]> {
  const manifestPath = action.getBuildPath()

  const inlineManifests = readInlineManifests(action)
  const fileManifests = await readFileManifests(ctx, action, log, manifestPath)
  const kustomizeManifests = await readKustomizeManifests(ctx, action, log, manifestPath)

  return [...inlineManifests, ...fileManifests, ...kustomizeManifests]
}

function readInlineManifests(
  action: Resolved<KubernetesDeployAction | KubernetesPodRunAction | KubernetesPodTestAction>
): DeclaredManifest[] {
  const manifests = expandListManifests(action.getSpec().manifests)
  return manifests.map((manifest, index) => ({
    declaration: {
      type: "inline",
      filename: action.configPath(),
      index,
    },
    manifest,
  }))
}

const disallowedKustomizeArgs = ["-o", "--output", "-h", "--help"]

async function readKustomizeManifests(
  ctx: PluginContext,
  action: Resolved<KubernetesDeployAction | KubernetesPodRunAction | KubernetesPodTestAction>,
  log: Log,
  manifestPath: string
): Promise<DeclaredManifest[]> {
  const spec = action.getSpec()

  if (!spec.kustomize?.path) {
    return []
  }

  const kustomizePath = spec.kustomize!.path
  const kustomize = ctx.tools["kubernetes.kustomize"]

  const extraArgs = spec.kustomize.extraArgs || []

  for (const arg of disallowedKustomizeArgs) {
    if (extraArgs.includes(arg)) {
      throw new ConfigurationError({
        message: `Invalid spec on ${action.longDescription()}: kustomize.extraArgs must not include any of ${disallowedKustomizeArgs.join(
          ", "
        )}. Got: ${naturalList(extraArgs)}`,
      })
    }
  }

  try {
    const kustomizeOutput = await kustomize.stdout({
      cwd: manifestPath,
      log,
      args: ["build", kustomizePath, ...extraArgs],
    })
    const manifests = expandListManifests(loadAll(kustomizeOutput) as KubernetesResource[])
    return manifests.map((manifest, index) => ({
      declaration: {
        type: "kustomize",
        path: join(manifestPath, kustomizePath),
        index,
      },
      manifest,
    }))
  } catch (error) {
    if (!(error instanceof GardenError)) {
      throw error
    }
    throw new PluginError({
      message: `Failed resolving kustomize manifests: ${error.message}`,
      wrappedErrors: [error],
    })
  }
}

async function readFileManifests(
  ctx: PluginContext,
  action: Resolved<KubernetesDeployAction | KubernetesPodRunAction | KubernetesPodTestAction>,
  log: Log,
  manifestPath: string
): Promise<DeclaredManifest[]> {
  const spec = action.getSpec()
  const specFiles = spec.files
  const regularPaths = specFiles.filter((f) => !isGlob(f))
  const missingPaths = await pFilter(regularPaths, async (regularPath) => {
    const resolvedPath = resolve(manifestPath, regularPath)
    return !(await pathExists(resolvedPath))
  })
  if (missingPaths.length) {
    throw new ConfigurationError({
      message: `Invalid manifest file path(s) declared in ${action.longDescription()}. Cannot find manifest file(s) at ${naturalList(
        missingPaths
      )} in ${manifestPath} directory.`,
    })
  }

  const resolvedFiles = await glob(specFiles, { cwd: manifestPath })
  if (specFiles.length > 0 && resolvedFiles.length === 0) {
    throw new ConfigurationError({
      message: `Invalid manifest file path(s) declared in ${action.longDescription()}. Cannot find any manifest files for paths ${naturalList(
        specFiles
      )} in ${manifestPath} directory.`,
    })
  }

  return flatten(
    await Promise.all(
      resolvedFiles.map(async (path): Promise<DeclaredManifest[]> => {
        const absPath = resolve(manifestPath, path)
        log.debug(`Reading manifest for ${action.longDescription()} from path ${absPath}`)
        const str = (await readFile(absPath)).toString()
        const resolved = ctx.resolveTemplateStrings(str, { allowPartial: true, unescape: true })
        const manifests = expandListManifests(loadAll(resolved) as KubernetesResource[])
        return manifests.map((manifest, index) => ({
          declaration: {
            type: "file",
            filename: absPath,
            index,
          },
          manifest,
        }))
      })
    )
  )
}

function expandListManifests(manifests: KubernetesResource[]): KubernetesResource[] {
  return manifests.flatMap((manifest) => {
    if (manifest?.kind?.endsWith("List")) {
      if (!manifest.items || manifest.items.length === 0) {
        // empty list
        return []
      } else if (manifest.items.length > 0 && manifest.items[0].kind) {
        // at least the first manifest has a kind: seems to be a valid List
        return manifest.items as KubernetesResource[]
      } else {
        // This should be extremely rare. If this happens, consider adding a validation layer before reading Kubernetes manifests from a file and changing this to an InternalError.
        throw new PluginError({
          message: `Failed to read Kubernetes manifest: Encountered an invalid List manifest: ${JSON.stringify(
            manifest
          )}`,
        })
      }
    }
    return manifest
  })
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
  })
}
