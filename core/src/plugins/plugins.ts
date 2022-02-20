/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// These plugins are always registered and the providers documented
export const getSupportedPlugins = () => [
  { name: "container", callback: () => require("./container/container").gardenPlugin() },
  { name: "exec", callback: () => require("./exec/exec").gardenPlugin() },
  { name: "hadolint", callback: () => require("./hadolint/hadolint").gardenPlugin() },
  { name: "kubernetes", callback: () => require("./kubernetes/kubernetes").gardenPlugin() },
  { name: "local-kubernetes", callback: () => require("./kubernetes/local/local").gardenPlugin() },
  { name: "octant", callback: () => require("./octant/octant").gardenPlugin() },
  { name: "openfaas", callback: () => require("./openfaas/openfaas").gardenPlugin() },
  { name: "terraform", callback: () => require("./terraform/terraform").gardenPlugin() },
]

// These plugins are always registered
export const getBuiltinPlugins = () =>
  getSupportedPlugins().concat([
    { name: "google-app-engine", callback: () => require("./google/google-app-engine").gardenPlugin() },
    { name: "google-cloud-functions", callback: () => require("./google/google-cloud-functions").gardenPlugin() },
    {
      name: "local-google-cloud-functions",
      callback: () => require("./local/local-google-cloud-functions").gardenPlugin(),
    },
    { name: "npm-package", callback: () => require("./npm-package").gardenPlugin() },
    { name: "templated", callback: () => require("./templated").gardenPlugin() },
  ])
