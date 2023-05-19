/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiIdentifier, joi, joiSparseArray, joiStringMap } from "../../../config/common"
import { dedent } from "../../../util/string"
import { BaseVolumeSpec } from "../../base-volume"
import { V1ConfigMap } from "@kubernetes/client-node"
import { ModuleTypeDefinition } from "../../../plugin/plugin"
import { baseBuildSpecSchema } from "../../../config/module"
import { ConfigureModuleParams } from "../../../plugin/handlers/Module/configure"
import { GardenModule } from "../../../types/module"
import { KubernetesResource } from "../types"
import { kubernetesDeploy, getKubernetesDeployStatus } from "../kubernetes-type/handlers"
import { ConvertModuleParams } from "../../../plugin/handlers/Module/convert"
import { DeployActionDefinition } from "../../../plugin/action-types"
import { DeployAction, DeployActionConfig, ResolvedDeployAction } from "../../../actions/deploy"
import { KubernetesDeployActionConfig } from "../kubernetes-type/config"
import { Resolved } from "../../../actions/types"
import { makeDocsLink } from "../../../docs/common"
import { KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"

// TODO: If we make a third one in addition to this and `persistentvolumeclaim`, we should dedupe some code.

export interface ConfigmapDeploySpec extends BaseVolumeSpec {
  namespace?: string
  data: Required<V1ConfigMap["data"]>
}

const commonSpecKeys = () => ({
  namespace: joiIdentifier().description(
    "The namespace to deploy the ConfigMap in. Note that any resource referencing the ConfigMap must be in the same namespace, so in most cases you should leave this unset."
  ),
  data: joiStringMap(joi.string()).required().description("The ConfigMap data, as a key/value map of string values."),
})

export interface ConfigMapSpec extends ConfigmapDeploySpec {
  dependencies: string[]
}

type ConfigMapModule = GardenModule<ConfigMapSpec, ConfigMapSpec>

type ConfigmapActionConfig = DeployActionConfig<"configmap", ConfigmapDeploySpec>
type ConfigmapAction = DeployAction<ConfigmapActionConfig, {}>

const getDocs = () => dedent`
  Creates a [ConfigMap](https://kubernetes.io/docs/concepts/configuration/configmap/) in your namespace, that can be referenced and mounted by other resources and [container actions](./container.md).

  See the [Mounting Kubernetes ConfigMaps](${makeDocsLink`k8s-plugins/action-types/configmap`}) guide for more info and usage examples.
`

export const configmapDeployDefinition = (): DeployActionDefinition<ConfigmapAction> => ({
  name: "configmap",
  docs: getDocs(),
  schema: joi.object().keys(commonSpecKeys()),
  handlers: {
    configure: async ({ config }) => {
      config.include = []
      return { config, supportedModes: {} }
    },

    deploy: async (params) => {
      const result = await kubernetesDeploy({
        ...(<any>params),
        action: getKubernetesAction(params.action),
      })

      return { ...result, outputs: {} }
    },

    getStatus: async (params) => {
      const result = await getKubernetesDeployStatus({
        ...(<any>params),
        action: getKubernetesAction(params.action),
      })

      return { ...result, outputs: {} }
    },
  },
})

export const configMapModuleDefinition = (): ModuleTypeDefinition => ({
  name: "configmap",
  docs: getDocs(),
  schema: joi.object().keys({
    build: baseBuildSpecSchema(),
    dependencies: joiSparseArray(joiIdentifier()).description(
      "List of services and tasks to deploy/run before deploying this ConfigMap."
    ),
    ...commonSpecKeys(),
  }),
  needsBuild: false,

  handlers: {
    async configure({ moduleConfig }: ConfigureModuleParams) {
      // No need to scan for files
      moduleConfig.include = []
      moduleConfig.serviceConfigs = [
        {
          dependencies: moduleConfig.spec.dependencies,
          disabled: moduleConfig.spec.disabled,
          name: moduleConfig.name,
          spec: moduleConfig.spec,
        },
      ]

      return { moduleConfig }
    },

    async convert(params: ConvertModuleParams<ConfigMapModule>) {
      const { module, dummyBuild, prepareRuntimeDependencies } = params

      return {
        group: {
          kind: "Group",
          name: module.name,
          path: module.path,
          actions: [
            ...(dummyBuild ? [dummyBuild] : []),
            {
              kind: "Deploy",
              type: "configmap",
              name: module.name,
              ...params.baseFields,

              build: dummyBuild?.name,
              dependencies: prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),

              timeout: KUBECTL_DEFAULT_TIMEOUT,
              spec: {
                namespace: module.spec.namespace,
                data: module.spec.data,
              },
            },
          ],
        },
      }
    },
  },
})

/**
 * Maps a `configmap` action to a `kubernetes` action (so we can re-use those handlers).
 */
function getKubernetesAction(action: Resolved<ConfigmapAction>) {
  const configMapManifest: KubernetesResource<V1ConfigMap> = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: action.name,
    },
    data: action.getSpec("data"),
  }

  const config: KubernetesDeployActionConfig = {
    kind: "Deploy",
    type: "kubernetes",
    name: action.name,
    internal: {
      basePath: action.basePath(),
    },
    include: [],
    timeout: KUBECTL_DEFAULT_TIMEOUT,
    spec: {
      namespace: action.getSpec("namespace"),
      files: [],
      manifests: [configMapManifest],
    },
  }

  return new ResolvedDeployAction<KubernetesDeployActionConfig, {}>({
    ...action["params"],
    config,
    spec: config.spec,
  })
}
