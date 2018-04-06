/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { ensureFile, readFile } from "fs-extra"
import * as Joi from "joi"
import * as yaml from "js-yaml"
import { isPlainObject, get } from "lodash"
import { joiIdentifier, Primitive } from "./types/common"
import { GardenError } from "./exceptions"
import { dumpYaml } from "./util"

class LocalConfigError extends GardenError {
  type = "local-config"
}

export class LocalConfig {
  private configPath: string

  constructor(projectPath: string) {
    this.configPath = resolve(projectPath, ".garden", "local-config.yml")
  }

  async set(key: string[], value: Primitive) {
    const config = await this.loadLocalConfig()

    let currentValue = config

    for (let i = 0; i < key.length; i++) {
      const k = key[i]

      try {
        Joi.attempt(k, joiIdentifier())
      } catch (_) {
        throw new LocalConfigError(
          `"${k}" is not a valid key identifier`,
          {
            keyPart: k,
            key,
          },
        )
      }

      if (i == key.length - 1) {
        currentValue[k] = value
      } else if (currentValue[k] === undefined) {
        currentValue[k] = {}
      } else if (!isPlainObject(currentValue[k])) {
        const path = key.slice(i + 1).join(".")

        throw new LocalConfigError(
          `Attempting to assign a nested key on non-object (current value at ${path}: ${currentValue[k]})`,
          {
            currentValue: currentValue[k],
            path,
          },
        )
      }

      currentValue = currentValue[k]
    }

    await this.saveLocalConfig(config)
  }

  async get(key?: string[]): Promise<object | Primitive> {
    const config = await this.loadLocalConfig()

    if (key) {
      const value = get(config, key)

      if (value === undefined) {
        throw new LocalConfigError(`Could not find key ${key.join(".")} in user config`, {
          key,
          config,
        })
      }

      return value
    } else {
      return config
    }
  }

  async clear() {
    await this.saveLocalConfig({})
  }

  private async ensureConfigFileExists() {
    return ensureFile(this.configPath)
  }

  private async loadLocalConfig() {
    // TODO: cache config instead of loading from disk each time
    await this.ensureConfigFileExists()
    return yaml.safeLoad(await readFile(this.configPath)) || {}
  }

  private async saveLocalConfig(config: object) {
    return dumpYaml(this.configPath, config)
  }
}
