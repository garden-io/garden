/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiIdentifier, joi, joiSparseArray } from "../../../config/common"
import { dedent } from "../../../util/string"
import { BaseVolumeSpec, baseVolumeSpecKeys } from "../../base-volume"
import { V1PersistentVolumeClaimSpec, V1PersistentVolumeClaim } from "@kubernetes/client-node"
import { readFileSync } from "fs-extra"
import { join } from "path"
import { ModuleTypeDefinition } from "../../../plugin/plugin"
import { STATIC_DIR } from "../../../constants"
import { baseBuildSpecSchema } from "../../../config/module"
import { ConfigureModuleParams } from "../../../plugin/handlers/module/configure"
import { GardenModule } from "../../../types/module"
import { KubernetesResource } from "../types"
import { ConvertModuleParams } from "../../../plugin/handlers/module/convert"
import { omit } from "lodash"
import { DeployAction, DeployActionConfig } from "../../../actions/deploy"
import { KubernetesDeployActionConfig } from "../kubernetes-type/config"
import { DeployActionDefinition } from "../../../plugin/action-types"
import { getKubernetesDeployStatus, kubernetesDeploy } from "../kubernetes-type/handlers"

export interface PersistentVolumeClaimDeploySpec extends BaseVolumeSpec {
  namespace?: string
  spec: V1PersistentVolumeClaimSpec
}

const commonSpecKeys = () => ({
  ...baseVolumeSpecKeys(),
  namespace: joiIdentifier().description(
    "The namespace to deploy the PVC in. Note that any module referencing the PVC must be in the same namespace, so in most cases you should leave this unset."
  ),
  spec: joi
    .object()
    .jsonSchema({ ...jsonSchema().properties.spec, type: "object" })
    .required()
    .description(
      "The spec for the PVC. This is passed directly to the created PersistentVolumeClaim resource. Note that the spec schema may include (or even require) additional fields, depending on the used `storageClass`. See the [PersistentVolumeClaim docs](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) for details."
    ),
})

interface PersistentVolumeClaimSpec extends PersistentVolumeClaimDeploySpec {
  dependencies: string[]
}
type PersistentVolumeClaimModule = GardenModule<PersistentVolumeClaimSpec, PersistentVolumeClaimSpec>

type PersistentVolumeClaimActionConfig = DeployActionConfig<"persistentvolumeclaim", PersistentVolumeClaimDeploySpec>
type PersistentVolumeClaimAction = DeployAction<PersistentVolumeClaimActionConfig, {}>

// Need to use a sync read to avoid having to refactor createGardenPlugin()
// The `persistentvolumeclaim.json` file is copied from the handy
// kubernetes-json-schema repo (https://github.com/instrumenta/kubernetes-json-schema/tree/master/v1.17.0-standalone).
const jsonSchema = () =>
  JSON.parse(readFileSync(join(STATIC_DIR, "kubernetes", "persistentvolumeclaim.json")).toString())

const docs = dedent`
  Creates a [PersistentVolumeClaim](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) in your namespace, that can be referenced and mounted by other resources and [container modules](./container.md).

  See the [Mounting volumes](../../guides/container-modules.md#mounting-volumes) guide for more info and usage examples.
`

export const persistentvolumeclaimDeployDefinition = (): DeployActionDefinition<PersistentVolumeClaimAction> => ({
  name: "persistentvolumeclaim",
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

export const pvcModuleDefinition = (): ModuleTypeDefinition => ({
  name: "persistentvolumeclaim",
  docs,

  schema: joi.object().keys({
    build: baseBuildSpecSchema(),
    dependencies: joiSparseArray(joiIdentifier()).description(
      "List of services and tasks to deploy/run before deploying this PVC."
    ),
    ...commonSpecKeys(),
  }),

  handlers: {
    async configure({ moduleConfig }: ConfigureModuleParams) {
      // No need to scan for files
      moduleConfig.include = []

      // Copy the access modes field to match the BaseVolumeSpec schema
      moduleConfig.spec.accessModes = moduleConfig.spec.spec.accessModes

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

    async convert(params: ConvertModuleParams<PersistentVolumeClaimModule>) {
      const { module, dummyBuild, prepareRuntimeDependencies } = params

      return {
        group: {
          kind: "Group",
          name: module.name,
          actions: [
            ...(dummyBuild ? [dummyBuild] : []),
            {
              kind: "deploy",
              type: "persistentvolumeclaim",
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
 * Maps a `persistentvolumeclaim` action to a `kubernetes` action (so we can re-use those handlers).
 */
function getKubernetesAction(action: PersistentVolumeClaimAction) {
  const pvcManifest: KubernetesResource<V1PersistentVolumeClaim> = {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name: action.name,
    },
    spec: action.getSpec("spec"),
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
      manifests: [pvcManifest],
    },
  }

  return new DeployAction<KubernetesDeployActionConfig, {}>({
    ...action["params"],
    config,
  })
}
