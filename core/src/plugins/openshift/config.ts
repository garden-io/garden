/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiProviderName } from "../../config/common.js"
import type { BaseProviderConfig, Provider } from "../../config/provider.js"
import { providerConfigBaseSchema } from "../../config/provider.js"
import type { PluginContext } from "../../plugin-context.js"
import { resourcesSchema } from "../kubernetes/config.js"

export type OpenShiftConfig = BaseProviderConfig
export type OpenShiftProvider = Provider<OpenShiftConfig>
export type OpenShiftPluginContext = PluginContext<OpenShiftConfig>

export const openshiftConfigBase = () => providerConfigBaseSchema()

export const configSchema = () =>
  providerConfigBaseSchema()
    .keys({
      name: joiProviderName("openshift"),
      resources: resourcesSchema(),
    })
    .description("The provider configuration for the openshift plugin")
