/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiIdentifier, joi, joiSparseArray, joiStringMap } from "../../../config/common"
import { dedent } from "../../../util/string"
import { BaseVolumeSpec, baseVolumeSpecKeys } from "../../base-volume"
import { V1ConfigMap } from "@kubernetes/client-node"
import { ModuleTypeDefinition } from "../../../plugin/plugin"
import { DOCS_BASE_URL } from "../../../constants"
import { baseBuildSpecSchema } from "../../../config/module"
import { ConfigureModuleParams } from "../../../plugin/handlers/module/configure"
import { GardenModule } from "../../../types/module"
import { KubernetesResource } from "../types"
import { kubernetesDeploy, getKubernetesDeployStatus } from "../kubernetes-type/handlers"
import { ConvertModuleParams } from "../../../plugin/handlers/module/convert"
import { omit } from "lodash"
import { DeployActionDefinition } from "../../../plugin/action-types"
import { DeployAction, DeployActionConfig } from "../../../actions/deploy"
import { KubernetesDeployActionConfig } from "../kubernetes-type/config"

// TODO: If we make a third one in addition to this and `persistentvolumeclaim`, we should dedupe some code.

export interface ConfigmapDeploySpec extends BaseVolumeSpec {
  namespace?: string
  data: Required<V1ConfigMap["data"]>
}

const commonSpecKeys = () => ({
  ...baseVolumeSpecKeys(),
  namespace: joiIdentifier().description(
    "The namespace to deploy the ConfigMap in. Note that any module referencing the ConfigMap must be in the same namespace, so in most cases you should leave this unset."
  ),
  data: joiStringMap(joi.string()).required().description("The ConfigMap data, as a key/value map of string values."),
})

export interface ConfigMapSpec extends ConfigmapDeploySpec {
  dependencies: string[]
}
type ConfigMapModule = GardenModule<ConfigMapSpec, ConfigMapSpec>

type ConfigmapActionConfig = DeployActionConfig<"configmap", ConfigmapDeploySpec>
type ConfigmapAction = DeployAction<ConfigmapActionConfig, {}>

const docs = dedent`
  Creates a [ConfigMap](https://kubernetes.io/docs/concepts/configuration/configmap/) in your namespace, that can be referenced and mounted by other resources and [container modules](./container.md).

  See the [Mounting Kubernetes ConfigMaps](${DOCS_BASE_URL}/guides/container-modules#mounting-kubernetes-configmaps) guide for more info and usage examples.
`

export const configmapDeployDefinition = (): DeployActionDefinition<ConfigmapAction> => ({
  name: "configmap",
  docs,
  schema: joi.object().keys(commonSpecKeys()),
  handlers: {
    deploy: async (params) => {
      const result = await kubernetesDeploy({
        ...(<any>params),
        action: getKubernetesAction(params.action),
        devMode: false,
      })

      return { ...result, outputs: {} }
    },

    getStatus: async (params) => {
      const result = await getKubernetesDeployStatus({
        ...(<any>params),
        action: getKubernetesAction(params.action),
        devMode: false,
      })

      return { ...result, outputs: {} }
    },
  },
})

export const configMapModuleDefinition = (): ModuleTypeDefinition => ({
  name: "configmap",
  docs,

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

      moduleConfig.spec.accessModes = ["ReadOnlyMany"]

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
          actions: [
            ...(dummyBuild ? [dummyBuild] : []),
            {
              kind: "deploy",
              type: "configmap",
              name: module.name,
              ...params.baseFields,

              build: dummyBuild?.name,
              dependencies: prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),

              spec: {
                ...omit(module.spec, ["dependencies"]),
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
function getKubernetesAction(action: ConfigmapAction) {
  const configMapManifest: KubernetesResource<V1ConfigMap> = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: action.name,
    },
    data: action.getSpec("data"),
  }

  const config: KubernetesDeployActionConfig = {
    kind: "deploy",
    type: "kubernetes",
    name: action.name,
    basePath: action.basePath(),
    include: [],
    spec: {
      namespace: action.getSpec("namespace"),
      files: [],
      manifests: [configMapManifest],
    },
  }

  return new DeployAction<KubernetesDeployActionConfig, {}>({
    ...action["params"],
    config,
  })
}
