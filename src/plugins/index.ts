/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DockerModuleHandler } from "./container"
import { GoogleCloudFunctionsProvider } from "./google/google-cloud-functions"
import { LocalGoogleCloudFunctionsProvider } from "./local/local-google-cloud-functions"
import { KubernetesProvider } from "./kubernetes"
import { NpmPackageModuleHandler } from "./npm-package"
import { GoogleAppEngineProvider } from "./google/google-app-engine"
import { PluginFactory } from "../types/plugin"

// TODO: these should be configured, either explicitly or as dependencies of other plugins
export const defaultPlugins: PluginFactory[] = [
  DockerModuleHandler,
  NpmPackageModuleHandler,
  KubernetesProvider,
  GoogleAppEngineProvider,
  GoogleCloudFunctionsProvider,
  LocalGoogleCloudFunctionsProvider,
].map(pluginClass => (_ctx) => new pluginClass())
