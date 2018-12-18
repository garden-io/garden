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
import {
  Provider,
  projectNameSchema,
  projectSourcesSchema,
  environmentSchema,
  providerConfigBaseSchema,
} from "./config/project"
import { joiIdentifier, joiIdentifierMap } from "./config/common"
import { PluginError } from "./exceptions"
import { defaultProvider } from "./config/project"

type WrappedFromGarden = Pick<Garden,
  "projectName" |
  "projectRoot" |
  "projectSources" |
  // TODO: remove this from the interface
  "localConfigStore" |
  "environment"
>

const providerSchema = Joi.object()
  .options({ presence: "required" })
  .keys({
    name: joiIdentifier()
      .description("The name of the provider (plugin)."),
    config: providerConfigBaseSchema,
  })

export interface PluginContext extends WrappedFromGarden {
  provider: Provider
  providers: { [name: string]: Provider }
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
    localConfigStore: Joi.object()
      .description("Helper class for managing local configuration for plugins."),
    environment: environmentSchema,
    provider: providerSchema
      .description("The provider being used for this context."),
    providers: joiIdentifierMap(providerSchema)
      .description("Map of all configured providers for the current environment and project."),
  })

export function createPluginContext(garden: Garden, providerName: string): PluginContext {
  const projectConfig = cloneDeep(garden.environment)
  const providers = keyBy(projectConfig.providers, "name")
  let provider = providers[providerName]

  if (providerName === "_default") {
    provider = defaultProvider
  }

  if (!provider) {
    throw new PluginError(`Could not find provider '${providerName}'`, { providerName, providers })
  }

  return {
    projectName: garden.projectName,
    projectRoot: garden.projectRoot,
    projectSources: cloneDeep(garden.projectSources),
    environment: projectConfig,
    localConfigStore: garden.localConfigStore,
    provider,
    providers,
  }
}
