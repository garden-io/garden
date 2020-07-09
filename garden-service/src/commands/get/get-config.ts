/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams, BooleanParameter, ChoicesParameter } from "../base"
import { ConfigDump } from "../../garden"
import { environmentNameSchema } from "../../config/project"
import { joiIdentifier, joiVariables, joiArray, joi } from "../../config/common"
import { providerSchemaWithoutTools, providerConfigBaseSchema } from "../../config/provider"
import { moduleConfigSchema } from "../../config/module"
import { workflowConfigSchema } from "../../config/workflow"

export const getConfigOptions = {
  "exclude-disabled": new BooleanParameter({
    help: "Exclude disabled module, service, test, and task configs from output.",
  }),
  "resolve": new ChoicesParameter({
    help:
      "Choose level of resolution of config templates. Defaults to full. Specify --resolve=partial to avoid resolving providers.",
    // TODO: add "raw" option, to just scan for configs and return completely unresolved
    choices: ["full", "partial"],
    defaultValue: "full",
  }),
}

type Opts = typeof getConfigOptions

export class GetConfigCommand extends Command<{}, Opts> {
  name = "config"
  help = "Outputs the full configuration for this project and environment."

  workflows = true

  outputsSchema = () =>
    joi.object().keys({
      allEnvironmentNames: joiArray(environmentNameSchema()).required(),
      environmentName: environmentNameSchema().required(),
      namespace: joiIdentifier().description("The namespace of the current environment (if applicable)."),
      providers: joiArray(joi.alternatives(providerSchemaWithoutTools(), providerConfigBaseSchema())).description(
        "A list of all configured providers in the environment."
      ),
      variables: joiVariables().description("All configured variables in the environment."),
      moduleConfigs: joiArray(moduleConfigSchema()).description("All module configs in the project."),
      workflowConfigs: joi
        .array()
        .items(workflowConfigSchema())
        .description("All workflow configs in the project."),
      projectName: joi.string().description("The name of the project."),
      projectRoot: joi.string().description("The local path to the project root."),
      projectId: joi
        .string()
        .optional()
        .description("The project ID (Garden Enterprise only)."),
    })

  options = getConfigOptions

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<ConfigDump>> {
    const config = await garden.dumpConfig({
      log,
      includeDisabled: !opts["exclude-disabled"],
      partial: opts["resolve"] === "partial",
    })

    // Also filter out service, task, and test configs
    if (opts["exclude-disabled"]) {
      const filteredModuleConfigs = config.moduleConfigs.map((moduleConfig) => {
        const filteredConfig = {
          ...moduleConfig,
          serviceConfigs: moduleConfig.serviceConfigs.filter((c) => !c.disabled),
          taskConfigs: moduleConfig.taskConfigs.filter((c) => !c.disabled),
          testConfigs: moduleConfig.testConfigs.filter((c) => !c.disabled),
        }
        return filteredConfig
      })

      config.moduleConfigs = filteredModuleConfigs
    }

    // TODO: do a nicer print of this by default
    log.info({ data: config })

    return { result: config }
  }
}
