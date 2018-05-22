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
  joiIdentifier,
  validate,
} from "../../types/common"
import {
  Module,
  ModuleSpec,
} from "../../types/module"
import { ModuleActions } from "../../types/plugin"
import {
  ParseModuleResult,
} from "../../types/plugin/outputs"
import {
  DeployServiceParams,
  GetServiceStatusParams,
  ParseModuleParams,
} from "../../types/plugin/params"
import {
  ServiceConfig,
  ServiceSpec,
  ServiceStatus,
} from "../../types/service"
import {
  TestConfig,
  TestSpec,
} from "../../types/test"
import {
  apply,
} from "./kubectl"
import { getAppNamespace } from "./namespace"

export interface KubernetesSpecsModuleSpec extends ModuleSpec {
  specs: any[],
}

export class KubernetesSpecsModule extends Module<KubernetesSpecsModuleSpec> { }

const k8sSpecSchema = Joi.object().keys({
  apiVersion: Joi.string().required(),
  kind: Joi.string().required(),
  metadata: Joi.object().keys({
    annotations: Joi.object(),
    name: joiIdentifier().required(),
    namespace: joiIdentifier(),
    labels: Joi.object(),
  }).required().unknown(true),
}).unknown(true)

const k8sSpecsSchema = Joi.array().items(k8sSpecSchema).min(1)

export const kubernetesSpecHandlers: Partial<ModuleActions> = {
  async parseModule({ moduleConfig }: ParseModuleParams<KubernetesSpecsModule>): Promise<ParseModuleResult> {
    // TODO: check that each spec namespace is the same as on the project, if specified
    const services: ServiceConfig<ServiceSpec>[] = [{
      name: moduleConfig.name,
      dependencies: [],
      outputs: {},
      spec: {
        specs: validate(moduleConfig.spec.specs, k8sSpecsSchema, { context: `${moduleConfig.name} kubernetes specs` }),
      },
    }]

    const tests: TestConfig<TestSpec>[] = []

    return {
      module: moduleConfig,
      services,
      tests,
    }
  },

  getServiceStatus: async (
    { ctx, provider, service }: GetServiceStatusParams<KubernetesSpecsModule>,
  ): Promise<ServiceStatus> => {
    const context = provider.config.context
    const namespace = await getAppNamespace(ctx, provider)
    const currentVersion = await service.module.getVersion()

    const dryRunOutputs = await Bluebird.map(
      service.module.spec.specs,
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

    await Bluebird.each(service.module.spec.specs, async (spec) => {
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

    return {}
  },
}
