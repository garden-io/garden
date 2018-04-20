/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
// TODO: these should be configured, either explicitly or as dependencies of other plugins
import { RegisterPluginParam } from "../types/plugin"

// These plugins are always registered
export const builtinPlugins: RegisterPluginParam[] = [
  "./generic",
  "./container",
  "./google/google-cloud-functions",
  "./local/local-google-cloud-functions",
  "./kubernetes",
  "./npm-package",
  "./google/google-app-engine",
].map(p => resolve(__dirname, p))

// These plugins are always loaded
export const fixedPlugins = [
  "generic",
]
