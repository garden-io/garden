/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
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

/**
 * Reads the manifests and makes sure each has a namespace set (when applicable) and adds annotations.
 * Use this when applying to the cluster, or comparing against deployed resources.
 */
export async function getManifests(
  api: KubeApi,
  log: LogEntry,
  module: KubernetesModule,
  defaultNamespace: string
): Promise<KubernetesResource[]> {
  const manifests = await readManifests(module)

  return Bluebird.map(manifests, async (manifest) => {
    // Ensure a namespace is set, if not already set, and if required by the resource type
    if (!manifest.metadata.namespace) {
      const info = await api.getApiResourceInfo(log, manifest)

      if (info.namespaced) {
        manifest.metadata.namespace = defaultNamespace
      }
    }

    // Set Garden annotations
    set(manifest, ["metadata", "annotations", gardenAnnotationKey("service")], module.name)
    set(manifest, ["metadata", "labels", gardenAnnotationKey("service")], module.name)

    return manifest
  })
}

/**
 * Read the manifests from the module config, as well as any referenced files in the config.
 */
export async function readManifests(module: KubernetesModule) {
  const fileManifests = flatten(
    await Bluebird.map(module.spec.files, async (path) => {
      const absPath = resolve(module.buildPath, path)
      return safeLoadAll((await readFile(absPath)).toString())
    })
  )

  return [...module.spec.manifests, ...fileManifests]
}
