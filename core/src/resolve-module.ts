/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { cloneDeep } from "lodash"
import { validateWithPath } from "./config/validation"
import { resolveTemplateStrings } from "./template-string"
import { ContextResolveOpts, ModuleConfigContext } from "./config/config-context"
import { relative } from "path"
import { Garden } from "./garden"
import { ConfigurationError } from "./exceptions"
import { deline } from "./util/string"
import { getModuleKey } from "./types/module"
import { getModuleTypeBases } from "./plugins"
import { ModuleConfig, moduleConfigSchema } from "./config/module"
import { profileAsync } from "./util/profiling"

export interface ModuleConfigResolveOpts extends ContextResolveOpts {
  configContext: ModuleConfigContext
}

export const resolveModuleConfig = profileAsync(async function $resolveModuleConfig(
  garden: Garden,
  config: ModuleConfig,
  opts: ModuleConfigResolveOpts
): Promise<ModuleConfig> {
  // Allowing partial resolution here, to defer runtime remplate resolution
  config = resolveTemplateStrings(cloneDeep(config), opts.configContext, { allowPartial: true, ...opts })

  const moduleTypeDefinitions = await garden.getModuleTypes()
  const description = moduleTypeDefinitions[config.type]

  if (!description) {
    const configPath = relative(garden.projectRoot, config.configPath || config.path)

    throw new ConfigurationError(
      deline`
      Unrecognized module type '${config.type}' (defined at ${configPath}).
      Are you missing a provider configuration?
      `,
      { config, configuredModuleTypes: Object.keys(moduleTypeDefinitions) }
    )
  }

  // Validate the module-type specific spec
  if (description.schema) {
    config.spec = validateWithPath({
      config: config.spec,
      schema: description.schema,
      name: config.name,
      path: config.path,
      projectRoot: garden.projectRoot,
    })
  }

  /*
    We allow specifying modules by name only as a shorthand:

    dependencies:
      - foo-module
      - name: foo-module // same as the above
  */
  if (config.build && config.build.dependencies) {
    config.build.dependencies = config.build.dependencies.map((dep) =>
      typeof dep === "string" ? { name: dep, copy: [] } : dep
    )
  }

  // Validate the base config schema
  config = validateWithPath({
    config,
    schema: moduleConfigSchema(),
    configType: "module",
    name: config.name,
    path: config.path,
    projectRoot: garden.projectRoot,
  })

  if (config.repositoryUrl) {
    config.path = await garden.loadExtSourcePath({
      name: config.name,
      repositoryUrl: config.repositoryUrl,
      sourceType: "module",
    })
  }

  const actions = await garden.getActionRouter()
  const configureResult = await actions.configureModule({
    moduleConfig: config,
    log: garden.log,
  })

  config = configureResult.moduleConfig

  // Validate the configure handler output against the module type's bases
  const bases = getModuleTypeBases(moduleTypeDefinitions[config.type], moduleTypeDefinitions)

  for (const base of bases) {
    if (base.schema) {
      garden.log.silly(`Validating '${config.name}' config against '${base.name}' schema`)

      config.spec = <ModuleConfig>validateWithPath({
        config: config.spec,
        schema: base.schema.unknown(true),
        path: garden.projectRoot,
        projectRoot: garden.projectRoot,
        configType: `configuration for module '${config.name}' (base schema from '${base.name}' plugin)`,
        ErrorClass: ConfigurationError,
      })
    }
  }

  // FIXME: We should be able to avoid this
  config.name = getModuleKey(config.name, config.plugin)

  if (config.plugin) {
    for (const serviceConfig of config.serviceConfigs) {
      serviceConfig.name = getModuleKey(serviceConfig.name, config.plugin)
    }
    for (const taskConfig of config.taskConfigs) {
      taskConfig.name = getModuleKey(taskConfig.name, config.plugin)
    }
    for (const testConfig of config.testConfigs) {
      testConfig.name = getModuleKey(testConfig.name, config.plugin)
    }
  }

  return config
})
