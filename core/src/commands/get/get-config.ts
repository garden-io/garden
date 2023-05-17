/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams } from "../base"
import { ConfigDump } from "../../garden"
import { environmentNameSchema, projectSourceSchema } from "../../config/project"
import { joiIdentifier, joiVariables, joiArray, joi, joiStringMap } from "../../config/common"
import { providerConfigBaseSchema, providerSchema } from "../../config/provider"
import { moduleConfigSchema } from "../../config/module"
import { workflowConfigSchema } from "../../config/workflow"
import { BooleanParameter, ChoicesParameter } from "../../cli/params"
import { printHeader } from "../../logger/util"
import { buildActionConfigSchema } from "../../actions/build"
import { deployActionConfigSchema } from "../../actions/deploy"
import { runActionConfigSchema } from "../../actions/run"
import { testActionConfigSchema } from "../../actions/test"
import { suggestedCommandSchema } from "../../plugin/handlers/Provider/suggestCommands"

export const getConfigOptions = {
  "exclude-disabled": new BooleanParameter({
    help: "Exclude disabled action and module configs from output.",
  }),
  "resolve": new ChoicesParameter({
    help: "Choose level of resolution of config templates. Defaults to full. Specify --resolve=partial to avoid resolving providers.",
    // TODO: add "raw" option, to just scan for configs and return completely unresolved
    choices: ["full", "partial"],
    defaultValue: "full",
  }),
}

type Opts = typeof getConfigOptions

export class GetConfigCommand extends Command<{}, Opts, ConfigDump> {
  name = "config"
  help = "Outputs the full configuration for this project and environment."

  override outputsSchema = () =>
    joi.object().keys({
      allEnvironmentNames: joiArray(environmentNameSchema()).required(),
      environmentName: environmentNameSchema().required(),
      namespace: joiIdentifier().description("The namespace of the current environment (if applicable)."),
      providers: joiArray(joi.alternatives(providerSchema(), providerConfigBaseSchema())).description(
        "A list of all configured providers in the environment."
      ),
      variables: joiVariables().description("All configured variables in the environment."),
      actionConfigs: joi
        .object()
        .keys({
          Build: joiStringMap(buildActionConfigSchema()).optional().description("Build action configs in the project."),
          Deploy: joiStringMap(deployActionConfigSchema())
            .optional()
            .description("Deploy action configs in the project."),
          Run: joiStringMap(runActionConfigSchema()).optional().description("Run action configs in the project."),
          Test: joiStringMap(testActionConfigSchema()).optional().description("Test action configs in the project."),
        })
        .description("All action configs in the project."),
      moduleConfigs: joiArray(moduleConfigSchema()).description("All module configs in the project."),
      workflowConfigs: joi.array().items(workflowConfigSchema()).description("All workflow configs in the project."),
      projectName: joi.string().description("The name of the project."),
      projectRoot: joi.string().description("The local path to the project root."),
      projectId: joi.string().optional().description("The project ID (Garden Cloud only)."),
      domain: joi.string().optional().description("The Garden Cloud domain (Garden Cloud only)."),
      sources: joi.array().items(projectSourceSchema()).description("All configured external project sources."),
      suggestedCommands: joiArray(suggestedCommandSchema()).description(
        "A list of suggested commands to run in the project."
      ),
    })

  override options = getConfigOptions

  override printHeader({ log }) {
    printHeader(log, "Get config", "📂")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<ConfigDump>> {
    const partial = opts["resolve"] === "partial"

    const config = await garden.dumpConfig({
      log,
      includeDisabled: !opts["exclude-disabled"],
      resolveGraph: !partial,
      resolveProviders: !partial,
      resolveWorkflows: !partial,
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

      for (const configs of Object.values(config.actionConfigs)) {
        // TODO: work out why c resolves as any
        for (const [key, c] of Object.entries(configs)) {
          if (c.disabled) {
            delete configs[key]
          }
        }
      }
    }

    // TODO: do a nicer print of this by default
    log.info({ data: config })

    return { result: config }
  }
}
