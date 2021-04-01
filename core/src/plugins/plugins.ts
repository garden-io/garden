/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { InternalError } from "../exceptions"
import { GardenPluginCallback } from "../types/plugin/plugin"
import { arch } from "os"

// These plugins are always registered and the providers documented
export const getSupportedPlugins = () => {
  let lst = [
    require("./container/container"),
    require("./exec"),
    require("./kubernetes/kubernetes"),
    require("./kubernetes/local/local"),
    require("./maven-container/maven-container"),
    require("./octant/octant"),
    require("./openfaas/openfaas"),
    require("./terraform/terraform"),
  ]
  // hadolint is not currently available on arm64
  // https://github.com/hadolint/hadolint/issues/411
  if (arch() !== "arm64") {
    lst.push(require("./hadolint/hadolint"))
  }
  return lst.map(resolvePluginFromModule)
}

// These plugins are always registered
export const getBuiltinPlugins = () =>
  getSupportedPlugins().concat(
    [
      require("./google/google-app-engine"),
      require("./google/google-cloud-functions"),
      require("./local/local-google-cloud-functions"),
      require("./npm-package"),
      require("./templated"),
    ].map(resolvePluginFromModule)
  )

function resolvePluginFromModule(module: NodeModule): GardenPluginCallback {
  const filename = module.filename
  const gardenPlugin = module["gardenPlugin"]

  if (!gardenPlugin) {
    throw new InternalError(`Module ${filename} does not define a gardenPlugin`, { filename })
  }

  return gardenPlugin
}
