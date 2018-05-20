/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import * as Joi from "joi"
import { GARDEN_ANNOTATION_KEYS_VERSION } from "../../constants"
import {
  joiArray,
  joiIdentifier,
  validate,
} from "../../types/common"
import {
  baseServiceSchema,
  Module,
  ModuleConfig,
} from "../../types/module"
import {
  DeployServiceParams,
  GetServiceStatusParams,
  ParseModuleParams,
} from "../../types/plugin"
import {
  ServiceConfig,
  ServiceStatus,
} from "../../types/service"
import {
  apply,
} from "./kubectl"
import { getAppNamespace } from "./namespace"

export interface KubernetesSpecsServiceConfig extends ServiceConfig {
  specs: object[]
}

export interface KubernetesSpecsModuleConfig extends ModuleConfig<KubernetesSpecsServiceConfig> { }

export class KubernetesSpecsModule extends Module<KubernetesSpecsModuleConfig> { }

const k8sSpecSchema = Joi.object().keys({
  apiVersion: Joi.string().required(),
  kind: Joi.string().required(),
  metadata: Joi.object().keys({
    annotations: Joi.object(),
    name: joiIdentifier().required(),
    namespace: joiIdentifier(),
  }).required(),
}).unknown(true)

const specsServicesSchema = joiArray(baseServiceSchema.keys({
  specs: Joi.array().items(k8sSpecSchema).required(),
  // TODO: support spec files as well
  // specFiles: Joi.array().items(Joi.string()),
})).unique("name")

export const kubernetesSpecHandlers = {
  parseModule: async ({ ctx, moduleConfig }: ParseModuleParams): Promise<KubernetesSpecsModule> => {
    moduleConfig.services = validate(
      moduleConfig.services,
      specsServicesSchema,
      { context: `${moduleConfig.name} services` },
    )

    // TODO: check that each spec namespace is the same as on the project, if specified

    return new KubernetesSpecsModule(ctx, <KubernetesSpecsModuleConfig>moduleConfig)
  },

  getServiceStatus: async (
    { ctx, provider, service }: GetServiceStatusParams<KubernetesSpecsModule>,
  ): Promise<ServiceStatus> => {
    const context = provider.config.context
    const namespace = await getAppNamespace(ctx, provider)
    const currentVersion = await service.module.getVersion()

    const dryRunOutputs = await Bluebird.map(
      service.config.specs,
      (spec) => apply(context, spec, { dryRun: true, namespace }),
    )

    for (const dryRunOutput of dryRunOutputs) {
      const annotations = dryRunOutput.metadata.annotations || {}
      const version: string = annotations[GARDEN_ANNOTATION_KEYS_VERSION]

      if (!version || version !== currentVersion.versionString) {
        // TODO: return more complete information. for now we just need to signal whether the deployed specs are current
        return {}
      }
    }

    return { state: "ready" }
  },

  deployService: async ({ ctx, provider, service }: DeployServiceParams<KubernetesSpecsModule>) => {
    const context = provider.config.context
    const namespace = await getAppNamespace(ctx, provider)
    const currentVersion = await service.module.getVersion()

    return Bluebird.each(service.config.specs, async (spec) => {
      const annotatedSpec = {
        metadata: <any>{},
        ...spec,
      }

      if (!annotatedSpec.metadata.annotations) {
        annotatedSpec.metadata.annotations = { [GARDEN_ANNOTATION_KEYS_VERSION]: currentVersion.versionString }
      } else {
        annotatedSpec.metadata.annotations[GARDEN_ANNOTATION_KEYS_VERSION] = currentVersion.versionString
      }

      await apply(context, annotatedSpec, { namespace })
    })
  },
}
