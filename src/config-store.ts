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
import { get, isPlainObject, unset } from "lodash"
import { joiIdentifier, Primitive, validate } from "./types/common"
import { LocalConfigError } from "./exceptions"
import { dumpYaml } from "./util/util"

export type ConfigValue = Primitive | Primitive[]

export type SetManyParam = { keyPath: Array<string>, value: ConfigValue }[]

export abstract class ConfigStore<T extends object = any> {
  private cached: null | T
  protected configPath: string

  constructor(projectPath: string) {
    this.configPath = this.setConfigPath(projectPath)
    this.cached = null
  }

  abstract setConfigPath(projectPath: string): string
  abstract validate(config): T

  /**
   * Would've been nice to allow something like: set(["path", "to", "valA", valA], ["path", "to", "valB", valB]...)
   * but Typescript support is missing at the moment
   */
  public async set(param: SetManyParam)
  public async set(keyPath: string[], value: ConfigValue)
  public async set(...args) {
    let config = await this.getConfig()
    let entries: SetManyParam

    if (args.length === 1) {
      entries = args[0]
    } else {
      entries = [{ keyPath: args[0], value: args[1] }]
    }

    for (const { keyPath, value } of entries) {
      config = this.updateConfig(config, keyPath, value)
    }

    return this.saveLocalConfig(config)
  }

  public async get(): Promise<T>
  public async get(keyPath: string[]): Promise<Object | ConfigValue>
  public async get(keyPath?: string[]): Promise<Object | ConfigValue> {
    const config = await this.getConfig()

    if (keyPath) {
      const value = get(config, keyPath)

      if (value === undefined) {
        this.throwKeyNotFound(config, keyPath)
      }

      return value
    }

    return config
  }

  public async clear() {
    return this.saveLocalConfig(<T>{})
  }

  public async delete(keyPath: string[]) {
    let config = await this.getConfig()
    if (get(config, keyPath) === undefined) {
      this.throwKeyNotFound(config, keyPath)
    }
    const success = unset(config, keyPath)
    if (!success) {
      throw new LocalConfigError(`Unable to delete key ${keyPath.join(".")} in user config`, {
        keyPath,
        config,
      })
    }
    return this.saveLocalConfig(config)
  }

  private async getConfig(): Promise<T> {
    let config: T
    if (this.cached) {
      // Spreading does not work on generic types, see: https://github.com/Microsoft/TypeScript/issues/13557
      config = Object.assign(this.cached, {})
    } else {
      config = await this.loadConfig()
    }
    return config
  }

  private updateConfig(config: T, keyPath: string[], value: ConfigValue): T {
    let currentValue = config

    for (let i = 0; i < keyPath.length; i++) {
      const k = keyPath[i]

      if (i === keyPath.length - 1) {
        currentValue[k] = value
      } else if (currentValue[k] === undefined) {
        currentValue[k] = {}
      } else if (!isPlainObject(currentValue[k])) {
        const path = keyPath.slice(i + 1).join(".")

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
    return config
  }

  private async ensureConfigFileExists() {
    return ensureFile(this.configPath)
  }

  private async loadConfig(): Promise<T> {
    await this.ensureConfigFileExists()
    const config = await yaml.safeLoad((await readFile(this.configPath)).toString()) || {}

    this.cached = this.validate(config)

    return this.cached
  }

  private async saveLocalConfig(config: T) {
    this.cached = null
    const validated = this.validate(config)
    await dumpYaml(this.configPath, validated)
    this.cached = config
  }

  private throwKeyNotFound(config: T, keyPath: string[]) {
    throw new LocalConfigError(`Could not find key ${keyPath.join(".")} in user config`, {
      keyPath,
      config,
    })
  }

}

export interface KubernetesLocalConfig {
  username?: string
  "previous-usernames"?: Array<string>
}

export interface LocalConfig {
  kubernetes?: KubernetesLocalConfig
}

const kubernetesLocalConfigSchema = Joi.object()
  .keys({
    username: joiIdentifier().allow("").optional(),
    "previous-usernames": Joi.array().items(joiIdentifier()).optional(),
  })
  .meta({ internal: true })

// TODO: Dynamically populate schema with all possible provider keys?
const localConfigSchema = Joi.object()
  .keys({
    kubernetes: kubernetesLocalConfigSchema,
  })
  .meta({ internal: true })

export class LocalConfigStore extends ConfigStore<LocalConfig> {

  setConfigPath(projectPath): string {
    return resolve(projectPath, ".garden", "local-config.yml")
  }

  validate(config): LocalConfig {
    return validate(
      config,
      localConfigSchema,
      { context: this.configPath, ErrorClass: LocalConfigError },
    )
  }

}
