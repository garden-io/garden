/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// These plugins are always registered
export const builtinPlugins = [
  require("./exec"),
  require("./container/container"),
  require("./google/google-cloud-functions"),
  require("./local/local-google-cloud-functions"),
  require("./kubernetes/kubernetes"),
  require("./kubernetes/local/local"),
  require("./npm-package"),
  require("./google/google-app-engine"),
  require("./openfaas/openfaas"),
  require("./maven-container/maven-container"),
  require("./terraform/terraform"),
].map((m) => m.gardenPlugin)
