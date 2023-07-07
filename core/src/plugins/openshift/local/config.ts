/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiProviderName } from "../../../config/common"
import { ConfigureProviderParams } from "../../../plugin/handlers/Provider/configureProvider"
import { OpenShiftConfig, openshiftConfigBase } from "../config"

export interface LocalOpenShiftConfig extends OpenShiftConfig {}

export const configSchema = () =>
  openshiftConfigBase()
    .keys({
      name: joiProviderName("local-openshift"),
    })
    .description("The provider configuration for the local-openshift plugin")

export async function configureProvider(
  params: ConfigureProviderParams<LocalOpenShiftConfig>
): Promise<{ config: LocalOpenShiftConfig }> {
  const { base, log, projectName, ctx } = params

  let { config } = await base!(params)
  const providerLog = log.createLog({ name: config.name })

  providerLog.warn("EXPERIMENTAL: The local-openshift plugin is under construction.")
  return { config }
}
