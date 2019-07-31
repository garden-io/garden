/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "./garden"
import { cloneDeep } from "lodash"
import { projectNameSchema, projectSourcesSchema, environmentNameSchema } from "./config/project"
import { Provider, providerSchema, ProviderConfig } from "./config/provider"
import { configStoreSchema } from "./config-store"
import { deline } from "./util/string"
import { joi } from "./config/common"

type WrappedFromGarden = Pick<Garden,
  "projectName" |
  "projectRoot" |
  "projectSources" |
  "gardenDirPath" |
  "workingCopyId" |
  // TODO: remove this from the interface
  "configStore" |
  "environmentName"
>

export interface PluginContext<C extends ProviderConfig = ProviderConfig> extends WrappedFromGarden {
  provider: Provider<C>
}

// NOTE: this is used more for documentation than validation, outside of internal testing
// TODO: validate the output from createPluginContext against this schema (in tests)
export const pluginContextSchema = joi.object()
  .options({ presence: "required" })
  .keys({
    projectName: projectNameSchema,
    projectRoot: joi.string()
      .description("The absolute path of the project root."),
    gardenDirPath: joi.string()
      .description(deline`
        The absolute path of the project's Garden dir. This is the directory the contains builds, logs and
        other meta data. A custom path can be set when initialising the Garden class. Defaults to \`.garden\`.
      `),
    projectSources: projectSourcesSchema,
    configStore: configStoreSchema,
    environmentName: environmentNameSchema,
    provider: providerSchema
      .description("The provider being used for this context."),
    workingCopyId: joi.string()
      .description("A unique ID assigned to the current project working copy."),
  })

export function createPluginContext(garden: Garden, provider: Provider): PluginContext {
  return {
    environmentName: garden.environmentName,
    projectName: garden.projectName,
    projectRoot: garden.projectRoot,
    gardenDirPath: garden.gardenDirPath,
    projectSources: cloneDeep(garden.projectSources),
    configStore: garden.configStore,
    provider,
    workingCopyId: garden.workingCopyId,
  }
}
