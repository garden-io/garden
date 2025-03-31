/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ConfigureProviderParams } from "../../plugin/handlers/Provider/configureProvider.js"
import { createGardenPlugin } from "../../plugin/plugin.js"
import { k8sContainerRunExtension, k8sContainerTestExtension } from "../kubernetes/container/extensions.js"
import {
  kubernetesExecRunDefinition,
  kubernetesExecTestDefinition,
} from "../kubernetes/kubernetes-type/kubernetes-exec.js"
import { openshiftContainerBuildExtension } from "./build.js"
import type { OpenShiftConfig } from "./config.js"
import { configSchema } from "./config.js"
import { openshiftContainerDeployExtension } from "./deploy.js"

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

    createActionTypes: {
      Run: [kubernetesExecRunDefinition()],
      Test: [kubernetesExecTestDefinition()],
    },

    extendActionTypes: {
      Deploy: [openshiftContainerDeployExtension()],
      Build: [openshiftContainerBuildExtension()],
      Run: [k8sContainerRunExtension()],
      Test: [k8sContainerTestExtension()],
    },
  })
}
