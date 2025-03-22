/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { V1PersistentVolumeClaim, V1PersistentVolumeClaimSpec } from "@kubernetes/client-node"
import fsExtra from "fs-extra"
import { memoize } from "lodash-es"
import { join } from "path"
import type { DeployAction, DeployActionConfig } from "../../../actions/deploy.js"
import { ResolvedDeployAction } from "../../../actions/deploy.js"
import type { Resolved } from "../../../actions/types.js"
import { createSchema, joi, joiIdentifier, joiSparseArray } from "../../../config/common.js"
import { baseBuildSpecSchema } from "../../../config/module.js"
import { STATIC_DIR } from "../../../constants.js"
import type { DeployActionDefinition } from "../../../plugin/action-types.js"
import type { ConfigureModuleParams } from "../../../plugin/handlers/Module/configure.js"
import type { ConvertModuleParams } from "../../../plugin/handlers/Module/convert.js"
import type { ModuleTypeDefinition } from "../../../plugin/plugin.js"
import type { GardenModule } from "../../../types/module.js"
import { dedent } from "../../../util/string.js"
import { KUBECTL_DEFAULT_TIMEOUT } from "../kubectl.js"
import type { KubernetesDeployActionConfig } from "../kubernetes-type/config.js"
import { deleteKubernetesDeploy, getKubernetesDeployStatus, kubernetesDeploy } from "../kubernetes-type/handlers.js"
import type { KubernetesResource } from "../types.js"
import { reportDeprecatedFeatureUsage } from "../../../util/deprecations.js"

const { readFileSync } = fsExtra

export interface PersistentVolumeClaimDeploySpec {
  namespace?: string
  spec: V1PersistentVolumeClaimSpec
}

const commonSpecKeys = memoize(() => ({
  namespace: joiIdentifier().description(
    "The namespace to deploy the PVC in. Note that any resources referencing the PVC must be in the same namespace, so in most cases you should leave this unset."
  ),
  // TODO: validation for this doesn't work, but kubernetes does the validation for us on apply
  spec: kubernetesPVCSchema(),
}))

interface PersistentVolumeClaimSpec extends PersistentVolumeClaimDeploySpec {
  dependencies: string[]
}

type PersistentVolumeClaimModule = GardenModule<PersistentVolumeClaimSpec, PersistentVolumeClaimSpec>

type PersistentVolumeClaimActionConfig = DeployActionConfig<"persistentvolumeclaim", PersistentVolumeClaimDeploySpec>
type PersistentVolumeClaimAction = DeployAction<PersistentVolumeClaimActionConfig, {}>

const getPVCJsonSchema = memoize(() => {
  // Need to use a sync read to avoid having to refactor createGardenPlugin()
  // The `persistentvolumeclaim.json` file is copied from the handy
  // kubernetes-json-schema repo (https://github.com/instrumenta/kubernetes-json-schema/tree/master/v1.17.0-standalone).
  const jsonSchemaRaw = () =>
    JSON.parse(readFileSync(join(STATIC_DIR, "kubernetes", "persistentvolumeclaim.json")).toString())

  const jsonSchema = { ...jsonSchemaRaw().properties.spec, type: "object" }

  return jsonSchema
})

const kubernetesPVCSchema = memoize(() =>
  joi
    .object()
    .jsonSchema(getPVCJsonSchema())
    .required()
    .description(
      "The spec for the PVC. This is passed directly to the created PersistentVolumeClaim resource. Note that the spec schema may include (or even require) additional fields, depending on the used `storageClass`. See the [PersistentVolumeClaim docs](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) for details."
    )
)

export const persistentvolumeclaimDeployDefinition = (): DeployActionDefinition<PersistentVolumeClaimAction> => ({
  name: "persistentvolumeclaim",
  docs: dedent`
    Creates a [PersistentVolumeClaim](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) in your namespace, that can be referenced and mounted by other resources and [\`container\` Deploy actions](./container.md).

    See the [PersistentVolumeClaim](../../../k8s-plugins/actions/deploy/persistentvolumeclaim.md) guide for more info and usage examples.
  `,
  schema: joi.object().keys(commonSpecKeys()),
  handlers: {
    configure: async ({ config, log }) => {
      reportDeprecatedFeatureUsage({
        log,
        deprecation: "persistentvolumeclaimDeployAction",
      })

      // No need to scan for files
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

    delete: async (params) => {
      const result = await deleteKubernetesDeploy({
        ...(<any>params),
        action: getKubernetesAction(params.action),
      })

      return { ...result, outputs: {} }
    },
  },
})

const pvcModuleSchema = createSchema({
  name: "kubernetes:persistentvolumeclaim:Module",
  keys: () => ({
    build: baseBuildSpecSchema(),
    dependencies: joiSparseArray(joiIdentifier()).description(
      "List of services and tasks to deploy/run before deploying this PVC."
    ),
    ...commonSpecKeys(),
  }),
})

export const pvcModuleDefinition = (): ModuleTypeDefinition => ({
  name: "persistentvolumeclaim",
  docs: dedent`
    Creates a [PersistentVolumeClaim](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) in your namespace, that can be referenced and mounted by other resources and [container modules](./container.md).

    See the [PersistentVolumeClaim](../../k8s-plugins/actions/deploy/persistentvolumeclaim.md) guide for more info and usage examples.
  `,

  schema: pvcModuleSchema(),
  needsBuild: false,

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
          path: module.path,
          actions: [
            ...(dummyBuild ? [dummyBuild] : []),
            {
              kind: "Deploy",
              type: "persistentvolumeclaim",
              name: module.name,
              ...params.baseFields,

              build: dummyBuild?.name,
              dependencies: prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),

              timeout: KUBECTL_DEFAULT_TIMEOUT,
              spec: {
                namespace: module.spec.namespace,
                spec: module.spec.spec,
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
function getKubernetesAction(action: Resolved<PersistentVolumeClaimAction>) {
  const pvcManifest: KubernetesResource<V1PersistentVolumeClaim> = {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name: action.name,
    },
    spec: action.getSpec("spec"),
  }

  const config: KubernetesDeployActionConfig = {
    kind: "Deploy",
    type: "kubernetes",
    name: action.name,
    internal: {
      basePath: action.sourcePath(),
    },
    include: [],
    timeout: KUBECTL_DEFAULT_TIMEOUT,
    spec: {
      namespace: action.getSpec("namespace"),
      files: [],
      manifestFiles: [],
      manifestTemplates: [],
      manifests: [pvcManifest],
    },
  }

  return new ResolvedDeployAction<KubernetesDeployActionConfig, {}>({
    ...action["params"],
    config,
    spec: config.spec,
  })
}
