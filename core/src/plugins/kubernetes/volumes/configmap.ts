/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiIdentifier, joi, joiSparseArray, joiStringMap } from "../../../config/common"
import { dedent } from "../../../util/string"
import { BaseVolumeSpec } from "../../base-volume"
import { V1ConfigMap } from "@kubernetes/client-node"
import { ModuleTypeDefinition } from "../../../types/plugin/plugin"
import { DOCS_BASE_URL } from "../../../constants"
import { baseBuildSpecSchema } from "../../../config/module"
import { ConfigureModuleParams } from "../../../types/plugin/module/configure"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { GardenModule } from "../../../types/module"
import { KubernetesModule, KubernetesModuleConfig } from "../kubernetes-module/config"
import { KubernetesResource } from "../types"
import { getKubernetesServiceStatus, deployKubernetesService } from "../kubernetes-module/handlers"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { getModuleTypeUrl } from "../../../docs/common"
import { GardenService } from "../../../types/service"

// TODO: If we make a third one in addition to this and `persistentvolumeclaim`, we should dedupe some code.

export interface ConfigMapSpec extends BaseVolumeSpec {
  dependencies: string[]
  namespace: string
  data: Required<V1ConfigMap["data"]>
}

type ConfigMapModule = GardenModule<ConfigMapSpec, ConfigMapSpec>
type ConfigMapService = GardenService<ConfigMapModule>

const containerTypeUrl = getModuleTypeUrl("container")

export const configMapModuleDefinition = (): ModuleTypeDefinition => ({
  name: "configmap",
  docs: dedent`
    Creates a [ConfigMap](https://kubernetes.io/docs/concepts/configuration/configmap/) in your namespace, that can be referenced and mounted by other resources and [container modules](${containerTypeUrl}).

    See the [Mounting Kubernetes ConfigMaps](${DOCS_BASE_URL}/guides/container-modules#mounting-kubernetes-configmaps) guide for more info and usage examples.
    `,
  schema: joi.object().keys({
    build: baseBuildSpecSchema(),
    dependencies: joiSparseArray(joiIdentifier()).description(
      "List of services and tasks to deploy/run before deploying this ConfigMap."
    ),
    namespace: joiIdentifier().description(
      "The namespace to deploy the ConfigMap in. Note that any module referencing the ConfigMap must be in the same namespace, so in most cases you should leave this unset."
    ),
    data: joiStringMap(joi.string()).required().description("The ConfigMap data, as a key/value map of string values."),
  }),
  handlers: {
    async configure({ moduleConfig }: ConfigureModuleParams) {
      // No need to scan for files
      moduleConfig.include = []

      moduleConfig.spec.accessModes = ["ReadOnlyMany"]

      moduleConfig.serviceConfigs = [
        {
          dependencies: moduleConfig.spec.dependencies,
          disabled: moduleConfig.spec.disabled,
          hotReloadable: false,
          name: moduleConfig.name,
          spec: moduleConfig.spec,
        },
      ]

      return { moduleConfig }
    },

    async getServiceStatus(params: GetServiceStatusParams) {
      params.service = getKubernetesService(params.service)
      params.module = params.service.module

      return getKubernetesServiceStatus({
        ...params,
        devMode: false,
      })
    },

    async deployService(params: DeployServiceParams) {
      params.service = getKubernetesService(params.service)
      params.module = params.service.module

      return deployKubernetesService({
        ...params,
        devMode: false,
      })
    },
  },
})

/**
 * Maps a `configmap` module to a `kubernetes` module (so we can re-use those handlers).
 */
function getKubernetesService(configMapService: ConfigMapService): GardenService<KubernetesModule, KubernetesModule> {
  const configMapManifest: KubernetesResource<V1ConfigMap> = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: configMapService.name,
    },
    data: configMapService.spec.data,
  }

  const spec = {
    dependencies: configMapService.spec.dependencies,
    files: [],
    manifests: [configMapManifest],
    tasks: [],
    tests: [],
  }

  const serviceConfig = {
    ...configMapService.config,
    spec,
  }

  const config: KubernetesModuleConfig = {
    ...configMapService.module,
    serviceConfigs: [serviceConfig],
    spec,
    taskConfigs: [],
    testConfigs: [],
  }

  const module: KubernetesModule = {
    ...configMapService.module,
    _config: config,
    ...config,
    spec: {
      ...configMapService.spec,
      files: [],
      manifests: [configMapManifest],
      tasks: [],
      tests: [],
    },
  }

  return {
    name: configMapService.name,
    config: serviceConfig,
    disabled: configMapService.disabled,
    module,
    sourceModule: module,
    spec,
    version: configMapService.version,
  }
}
