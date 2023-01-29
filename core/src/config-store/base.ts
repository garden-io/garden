/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ensureFile, readFile, writeFile } from "fs-extra"
import { z, ZodObject, ZodRecord, ZodType } from "zod"
import { lock } from "proper-lockfile"

export type ConfigStoreSchema = z.ZodObject<{ [section: string]: ZodObject<any> | ZodRecord }>

// Just a shorthand to make the code below a little more compact
type I<T extends ZodType<any>> = z.infer<T>

export abstract class ConfigStore<T extends ConfigStoreSchema> {
  abstract schema: T

  abstract getConfigPath(): string
  protected abstract initConfig(migrate: boolean): Promise<I<T>>

  async get(): Promise<I<T>>
  async get<S extends keyof I<T>>(section: S): Promise<I<T>[S]>
  async get<S extends keyof I<T>, K extends keyof I<T>[S]>(section: S, key: K): Promise<I<T>[S][K]>
  async get<S extends keyof I<T>, K extends keyof I<T>[S]>(section?: S, key?: K) {
    const release = await this.lock()
    try {
      const config = await this.readConfig()
      if (section === undefined) {
        return config
      } else if (key === undefined) {
        return config[section]
      } else {
        return config[section][key]
      }
    } finally {
      await release()
    }
  }

  async set<S extends keyof I<T>, K extends keyof I<T>[S]>(section: S, value: I<T>[S]): Promise<void>
  async set<S extends keyof I<T>, K extends keyof I<T>[S]>(section: S, key: K, value: I<T>[S][K]): Promise<void>
  async set<S extends keyof I<T>, K extends keyof I<T>[S]>(section: S, key: K | I<T>[S], value?: I<T>[S][K]) {
    const release = await this.lock()
    try {
      const config = await this.readConfig()
      if (value === undefined) {
        config[section] = <I<T>[S]>key
      } else {
        config[section][<K>key] = value
      }
      const validated = this.validate(config)
      await this.writeConfig(validated)
    } finally {
      await release()
    }
  }

  async clear() {
    const config = await this.initConfig(false)
    await this.writeConfig(config)
  }

  protected validate(data: any): I<T> {
    return this.schema.parse(data)
  }

  private async lock() {
    const path = this.getConfigPath()
    await ensureFile(path)
    return lock(path)
  }

  private async readConfig(): Promise<I<T>> {
    let parsed: I<T>
    try {
      const data = await readFile(this.getConfigPath())
      parsed = JSON.parse(data.toString())
    } catch {
      parsed = await this.initConfig(true)
    }
    return this.validate(parsed)
  }

  private async writeConfig(config: I<T>) {
    await writeFile(this.getConfigPath(), JSON.stringify(config))
  }
}
