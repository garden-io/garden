/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import {
  containerTemplate,
  functionTemplate,
  npmPackageTemplate,
  ModuleConfigOpts,
  ModuleType,
  moduleTemplate,
  ConfigOpts,
} from "./config-templates"
import { join } from "path"
import { pathExists } from "fs-extra"
import { validate } from "../../types/common"
import { EntryStyle } from "../../logger/types"
import { LogNode } from "../../logger/logger"
import { dumpYaml } from "../../util/util"
import { MODULE_CONFIG_FILENAME } from "../../constants"

export function prepareNewModuleConfig(name: string, type: ModuleType, path: string): ModuleConfigOpts {
  const moduleTypeTemplate = {
    container: containerTemplate,
    function: functionTemplate,
    "npm-package": npmPackageTemplate,
  }[type]
  return {
    name,
    type,
    path,
    config: {
      module: {
        ...moduleTemplate(name, type),
        ...moduleTypeTemplate(name),
      },
    },
  }
}

export async function dumpConfig(configOpts: ConfigOpts, schema: Joi.Schema, logger: LogNode) {
  const { config, name, path } = configOpts
  const yamlPath = join(path, MODULE_CONFIG_FILENAME)
  const task = logger.info({
    msg: `Writing config for ${name}`,
    entryStyle: EntryStyle.activity,
  })

  if (await pathExists(yamlPath)) {
    task.setWarn({ msg: `Garden config file already exists at path, skipping`, append: true })
    return
  }

  try {
    validate(config, schema)
    await dumpYaml(yamlPath, config)
    task.setSuccess()
  } catch (err) {
    task.setError({ msg: `Generated config is invalid, skipping`, append: true })
    throw new Error(err)
  }
}
