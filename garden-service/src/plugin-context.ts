/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "./garden"
import { keyBy, cloneDeep } from "lodash"
import * as Joi from "joi"
import { projectNameSchema, projectSourcesSchema, environmentNameSchema } from "./config/project"
import { PluginError } from "./exceptions"
import { defaultProvider, Provider, providerSchema, ProviderConfig } from "./config/provider"
import { configStoreSchema } from "./config-store"

type WrappedFromGarden = Pick<Garden,
  "projectName" |
  "projectRoot" |
  "projectSources" |
  // TODO: remove this from the interface
  "configStore" |
  "environmentName"
>

export interface PluginContext<C extends ProviderConfig = ProviderConfig> extends WrappedFromGarden {
  provider: Provider<C>
}

// NOTE: this is used more for documentation than validation, outside of internal testing
// TODO: validate the output from createPluginContext against this schema (in tests)
export const pluginContextSchema = Joi.object()
  .options({ presence: "required" })
  .keys({
    projectName: projectNameSchema,
    projectRoot: Joi.string()
      .uri(<any>{ relativeOnly: true })
      .description("The absolute path of the project root."),
    projectSources: projectSourcesSchema,
    configStore: configStoreSchema,
    environmentName: environmentNameSchema,
    provider: providerSchema
      .description("The provider being used for this context."),
  })

export async function createPluginContext(garden: Garden, providerName: string): Promise<PluginContext> {
  const providers = keyBy(await garden.resolveProviders(), "name")
  let provider = providers[providerName]

  if (providerName === "_default") {
    provider = defaultProvider
  }

  if (!provider) {
    throw new PluginError(`Could not find provider '${providerName}'`, { providerName, providers })
  }

  return {
    environmentName: garden.environmentName,
    projectName: garden.projectName,
    projectRoot: garden.projectRoot,
    projectSources: cloneDeep(garden.projectSources),
    configStore: garden.configStore,
    provider,
  }
}
