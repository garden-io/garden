/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { readFile } from "fs-extra"
import Bluebird from "bluebird"
import { flatten, set } from "lodash"
import { safeLoadAll } from "js-yaml"

import { KubernetesModule } from "./config"
import { KubernetesResource } from "../types"
import { KubeApi } from "../api"
import { gardenAnnotationKey } from "../../../util/string"
import { LogEntry } from "../../../logger/log-entry"
import { PluginContext } from "../../../plugin-context"

/**
 * Reads the manifests and makes sure each has a namespace set (when applicable) and adds annotations.
 * Use this when applying to the cluster, or comparing against deployed resources.
 */
export async function getManifests({
  ctx,
  api,
  log,
  module,
  defaultNamespace,
  readFromSrcDir = false,
}: {
  ctx: PluginContext
  api: KubeApi
  log: LogEntry
  module: KubernetesModule
  defaultNamespace: string
  readFromSrcDir?: boolean
}): Promise<KubernetesResource[]> {
  const manifests = await readManifests(ctx, module, log, readFromSrcDir)

  return Bluebird.map(manifests, async (manifest) => {
    // Ensure a namespace is set, if not already set, and if required by the resource type
    if (!manifest.metadata?.namespace) {
      if (!manifest.metadata) {
        manifest.metadata = {}
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
      manifest.kind === "Namespace" ? gardenNamespaceAnnotationValue(manifest.metadata.name) : module.name
    set(manifest, ["metadata", "annotations", gardenAnnotationKey("service")], annotationValue)
    set(manifest, ["metadata", "labels", gardenAnnotationKey("service")], annotationValue)

    return manifest
  })
}

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
  module: KubernetesModule,
  log: LogEntry,
  readFromSrcDir = false
) {
  const fileManifests = flatten(
    await Bluebird.map(module.spec.files, async (path) => {
      const manifestPath = readFromSrcDir ? module.path : module.buildPath
      const absPath = resolve(manifestPath, path)
      log.debug(`Reading manifest for module ${module.name} from path ${absPath}`)
      const str = (await readFile(absPath)).toString()
      const resolved = ctx.resolveTemplateStrings(str, { allowPartial: true, unescape: true })
      return safeLoadAll(resolved)
    })
  )

  return [...module.spec.manifests, ...fileManifests]
}

/**
 * We use this annotation value for namespace resources to avoid potential conflicts with module names (since module
 * names can't start with `garden`).
 */
export function gardenNamespaceAnnotationValue(namespaceName: string) {
  return `garden-namespace--${namespaceName}`
}
