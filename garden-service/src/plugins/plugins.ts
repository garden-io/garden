/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash"

const exec = require("./exec")
const container = require("./container/container")
const gcf = require("./google/google-cloud-functions")
const localGcf = require("./local/local-google-cloud-functions")
const kubernetes = require("./kubernetes/kubernetes")
const localKubernetes = require("./kubernetes/local/local")
const npmPackage = require("./npm-package")
const gae = require("./google/google-app-engine")
const openfaas = require("./openfaas/openfaas")
const mavenContainer = require("./maven-container/maven-container")

// These plugins are always registered
export const builtinPlugins = mapValues({
  exec,
  container,
  "google-cloud-functions": gcf,
  "local-google-cloud-functions": localGcf,
  kubernetes,
  "local-kubernetes": localKubernetes,
  "npm-package": npmPackage,
  "google-app-engine": gae,
  openfaas,
  "maven-container": mavenContainer,
}, (m => m.gardenPlugin))

// These plugins are always loaded
export const fixedPlugins = [
  "exec",
  "container",
]
