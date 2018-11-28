/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as yaml from "js-yaml"
import { highlightYaml } from "../../util/util"
import { Provider } from "../../config/project"
import { PrimitiveMap } from "../../config/common"
import { Module } from "../../types/module"
import { Command, CommandResult, CommandParams } from "../base"

interface ConfigOutput {
  environmentName: string
  providers: Provider[]
  variables: PrimitiveMap
  modules: Module[]
}

export class GetConfigCommand extends Command {
  name = "config"
  help = "Outputs the fully resolved configuration for this project and environment."

  async action({ garden, log }: CommandParams): Promise<CommandResult<ConfigOutput>> {
    const modules = await garden.getModules()

    // Remove circular references and superfluous keys.
    for (const module of modules) {
      delete module._ConfigType

      for (const service of module.services) {
        delete service.module
      }
      for (const task of module.tasks) {
        delete task.module
      }
    }

    const config: ConfigOutput = {
      environmentName: garden.environment.name,
      providers: garden.environment.providers,
      variables: garden.environment.variables,
      modules,
    }

    const yamlConfig = yaml.safeDump(config, { noRefs: true, skipInvalid: true })

    // TODO: do a nicer print of this by default and use --yaml/--json options for exporting
    log.info(highlightYaml(yamlConfig))

    return { result: config }
  }
}
