/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams, BooleanParameter } from "../base"
import { ConfigDump } from "../../garden"
import { environmentNameSchema } from "../../config/project"
import { joiIdentifier, joiIdentifierMap, joiVariables, joiArray, joi } from "../../config/common"
import { providerSchemaWithoutTools } from "../../config/provider"
import { moduleConfigSchema } from "../../config/module"
import { workflowConfigSchema } from "../../config/workflow"

export const getConfigOptions = {
  "exclude-disabled": new BooleanParameter({
    help: "Exclude disabled module, service, test, and task configs from output.",
  }),
}

type Opts = typeof getConfigOptions

export class GetConfigCommand extends Command<{}, Opts> {
  name = "config"
  help = "Outputs the fully resolved configuration for this project and environment."

  workflows = true

  outputsSchema = () =>
    joi.object().keys({
      environmentName: environmentNameSchema().required(),
      namespace: joiIdentifier().description("The namespace of the current environment (if applicable)."),
      providers: joiArray(providerSchemaWithoutTools()).description(
        "A list of all configured providers in the environment."
      ),
      variables: joiVariables().description("All configured variables in the environment."),
      moduleConfigs: joiArray(moduleConfigSchema()).description("All module configs in the project."),
      workflowConfigs: joi
        .array()
        .items(workflowConfigSchema())
        .description("All workflow configs in the project."),
      projectRoot: joi.string().description("The local path to the project root."),
      projectId: joi.string().description("The project ID (Garden Enterprise only)."),
    })

  options = getConfigOptions

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<ConfigDump>> {
    const config = await garden.dumpConfig(log, !opts["exclude-disabled"])

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
