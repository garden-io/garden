/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigureProviderParams } from "../../plugin/handlers/Provider/configureProvider"
import { createGardenPlugin } from "../../plugin/plugin"
import { OpenShiftConfig, configSchema } from "./config"
import { openshiftContainerDeployExtension } from "./container"

export async function configureProvider({ config }: ConfigureProviderParams<OpenShiftConfig>) {
  return { config }
}

export const gardenPlugin = () => {
  return createGardenPlugin({
    name: "openshift",
    dependencies: [{ name: "container" }],
    configSchema: configSchema(),
    handlers: {
      configureProvider,
    },

    extendActionTypes: {
      Deploy: [openshiftContainerDeployExtension()],
    },
  })
}
