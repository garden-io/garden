/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { identifierRegex } from "../../types/common"
import {
  baseServiceSchema,
  Module,
  ModuleConfig,
} from "../../types/module"
import { ServiceConfig } from "../../types/service"

export interface KubernetesRawServiceConfig extends ServiceConfig {
  specs: string[]
}

export interface KubernetesRawModuleConfig extends ModuleConfig<KubernetesRawServiceConfig> { }

export const k8sRawServicesSchema = Joi.object()
  .pattern(identifierRegex, baseServiceSchema.keys({
    specs: Joi.array().items(Joi.string()).required(),
  }))
  .default(() => ({}), "{}")

export class KubernetesRawModule extends Module<KubernetesRawModuleConfig> { }
