/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiIdentifier, joi, joiSparseArray } from "../../../config/common"
import { dedent } from "../../../util/string"
import { BaseVolumeSpec } from "../../base-volume"
import { V1PersistentVolumeClaimSpec, V1PersistentVolumeClaim } from "@kubernetes/client-node"
import { readFileSync } from "fs-extra"
import { join } from "path"
import { ModuleTypeDefinition } from "../../../plugin/plugin"
import { STATIC_DIR } from "../../../constants"
import { baseBuildSpecSchema } from "../../../config/module"
import { ConfigureModuleParams } from "../../../plugin/handlers/module/configure"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { GardenModule } from "../../../types/module"
import { KubernetesModule, KubernetesModuleConfig } from "../kubernetes-type/module-config"
import { KubernetesResource } from "../types"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { GardenService } from "../../../types/service"
import { ConvertModuleParams } from "../../../plugin/handlers/module/convert"
import { omit } from "lodash"

export interface PersistentVolumeClaimDeploySpec extends BaseVolumeSpec {
  namespace: string
  spec: V1PersistentVolumeClaimSpec
}

export interface PersistentVolumeClaimSpec extends PersistentVolumeClaimDeploySpec {
  dependencies: string[]
}

type PersistentVolumeClaimModule = GardenModule<PersistentVolumeClaimSpec, PersistentVolumeClaimSpec>
type PersistentVolumeClaimService = GardenService<PersistentVolumeClaimModule>

// Need to use a sync read to avoid having to refactor createGardenPlugin()
// The `persistentvolumeclaim.json` file is copied from the handy
// kubernetes-json-schema repo (https://github.com/instrumenta/kubernetes-json-schema/tree/master/v1.17.0-standalone).
const jsonSchema = JSON.parse(readFileSync(join(STATIC_DIR, "kubernetes", "persistentvolumeclaim.json")).toString())

export const pvcModuleDefinition = (): ModuleTypeDefinition => ({
  name: "persistentvolumeclaim",
  base: "base-volume",

  docs: dedent`
    Creates a [PersistentVolumeClaim](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) in your namespace, that can be referenced and mounted by other resources and [container modules](./container.md).

    See the [Mounting volumes](../../guides/container-modules.md#mounting-volumes) guide for more info and usage examples.
    `,

  schema: joi.object().keys({
    build: baseBuildSpecSchema(),
    dependencies: joiSparseArray(joiIdentifier()).description(
      "List of services and tasks to deploy/run before deploying this PVC."
    ),
    namespace: joiIdentifier().description(
      "The namespace to deploy the PVC in. Note that any module referencing the PVC must be in the same namespace, so in most cases you should leave this unset."
    ),
    spec: joi
      .object()
      .jsonSchema({ ...jsonSchema.properties.spec, type: "object" })
      .required()
      .description(
        "The spec for the PVC. This is passed directly to the created PersistentVolumeClaim resource. Note that the spec schema may include (or even require) additional fields, depending on the used `storageClass`. See the [PersistentVolumeClaim docs](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) for details."
      ),
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
              kind: "Deploy",
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
 * Maps a `persistentvolumeclaim` module to a `kubernetes` module (so we can re-use those handlers).
 */
function getKubernetesService(
  pvcService: PersistentVolumeClaimService
): GardenService<KubernetesModule, KubernetesModule> {
  const pvcManifest: KubernetesResource<V1PersistentVolumeClaim> = {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name: pvcService.name,
    },
    spec: pvcService.spec.spec,
  }

  const spec = {
    dependencies: pvcService.spec.dependencies,
    files: [],
    manifests: [pvcManifest],
    tasks: [],
    tests: [],
  }

  const serviceConfig = {
    ...pvcService.config,
    spec,
  }

  const config: KubernetesModuleConfig = {
    ...pvcService.module,
    include: [],
    serviceConfigs: [serviceConfig],
    spec,
    taskConfigs: [],
    testConfigs: [],
  }

  const module: KubernetesModule = {
    ...pvcService.module,
    _config: config,
    ...config,
    spec: {
      ...pvcService.spec,
      files: [],
      manifests: [pvcManifest],
      tasks: [],
      tests: [],
    },
  }

  return {
    name: pvcService.name,
    config: serviceConfig,
    disabled: pvcService.disabled,
    module,
    sourceModule: module,
    spec,
    version: pvcService.version,
  }
}
