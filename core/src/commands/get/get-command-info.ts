/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams } from "../base"
import { environmentNameSchema } from "../../config/project"
import { joiIdentifier, joiVariables, joiArray, joi } from "../../config/common"
import { providerConfigBaseSchema, providerSchema } from "../../config/provider"
import { printHeader } from "../../logger/util"
import { pick, sortBy } from "lodash"
import { dedent } from "../../util/string"
import { getBuiltinCommands } from "../commands"
import { getCustomCommands } from "../custom"

export class GetCommandInfoCommand extends Command<{}, {}> {
  name = "command-info"
  help = "Returns command information, similar to the help commands."

  description = dedent`
    Returns command information with extra metadata that's read from the config.

    Similar to the help command but meant to be used for automation. It's recommended
    to use the --output=json flag so that it's machine readable.
  `

  outputsSchema = () =>
    joi.object().keys({
      allEnvironmentNames: joiArray(environmentNameSchema()).required(),
      environmentName: environmentNameSchema().required(),
      namespace: joiIdentifier().description("The namespace of the current environment (if applicable)."),
      providers: joiArray(joi.alternatives(providerSchema(), providerConfigBaseSchema())).description(
        "A list of all configured providers in the environment."
      ),
      variables: joiVariables().description("All configured variables in the environment."),
      moduleNames: joiArray(joi.string()).description("All modules names."),
      serviceNames: joiArray(joi.string()).description("All service names."),
      taskNames: joiArray(joi.string()).description("All task names."),
      testNames: joiArray(joi.string()).description("All test names."),
      workflowNames: joiArray(joi.string()).description("All workflow names."),
      projectName: joi.string().description("The name of the project."),
      projectRoot: joi.string().description("The local path to the project root."),
      projectId: joi.string().optional().description("The project ID (Garden Cloud only)."),
      domain: joi.string().optional().description("The Garden Cloud domain (Garden Cloud only)."),
    })

  printHeader({ headerLog }) {
    printHeader(headerLog, "Get config", "open_file_folder")
  }

  // TODO: Add types to result
  async action({ garden, log }: CommandParams<{}, {}>): Promise<CommandResult> {
    const config = await garden.dumpConfig({
      log,
      partial: true,
    })

    let serviceNames: string[] = []
    let moduleNames: string[] = []
    let taskNames: string[] = []
    let testNames: string[] = []

    config.moduleConfigs.forEach((moduleConfig) => {
      moduleNames.push(moduleConfig.name)
      serviceNames.push(...moduleConfig.serviceConfigs.map((s) => s.name))
      taskNames.push(...moduleConfig.taskConfigs.map((s) => s.name))
      testNames.push(...moduleConfig.testConfigs.map((s) => s.name))
    })
    const workflowNames = config.workflowConfigs.map((w) => w.name)

    const commands = sortBy(getBuiltinCommands(), (c) => c.name)
    const customCommands = await getCustomCommands(Object.values(commands), garden.projectRoot)

    const commandsInfo = commands.map((c) => {
      return {
        help: c.help,
        description: c.description,
        name: c.getFullName(),
        internalName: c.getFullName().replace(/ /g, "."),
        arguments: Object.keys(c.arguments || {}),
        options: Object.keys(c.options || {}),
      }
    })
    const customCommandsInfo = customCommands.map((c) => {
      return {
        help: c.help,
        description: c.description,
        name: c.getFullName(),
        arguments: Object.keys(c.arguments || {}),
        internalName: c.getFullName().replace(/ /g, "."),
        options: Object.keys(c.options || {}),
      }
    })

    const result = {
      ...pick(config, [
        "allEnvironmentNames",
        "environmentName",
        "namespace",
        "providers",
        "variables",
        "projectName",
        "projectRoot",
        "projectId",
        "domain",
      ]),
      moduleNames,
      serviceNames,
      taskNames,
      testNames,
      workflowNames,
      commands: commandsInfo,
      customCommands: customCommandsInfo,
    }

    log.info({ data: result })

    return { result }
  }
}
