/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiProviderName } from "../../config/common"
import { BaseProviderConfig, Provider, providerConfigBaseSchema } from "../../config/provider"
import { PluginContext } from "../../plugin-context"

export interface OpenShiftConfig extends BaseProviderConfig {}
export type OpenShiftProvider = Provider<OpenShiftConfig>
export type OpenShiftPluginContext = PluginContext<OpenShiftConfig>

export const openshiftConfigBase = () => providerConfigBaseSchema()

export const configSchema = () =>
  providerConfigBaseSchema()
    .keys({
      name: joiProviderName("openshift"),
    })
    .description("The provider configuration for the openshift plugin")
