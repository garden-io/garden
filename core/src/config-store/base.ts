/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fsExtra from "fs-extra"
import AsyncLock from "async-lock"

const { ensureFile, readFile } = fsExtra
import type { z, ZodType } from "zod"
import writeFileAtomic from "write-file-atomic"
import { InternalError } from "../exceptions.js"

// Just a shorthand to make the code below a little more compact
type I<T extends ZodType<any>> = z.infer<T>

export abstract class ConfigStore<T extends z.ZodObject<any>> {
  fileMode: number | undefined

  // to prevent concurrent writes from the same garden process
  // does not prevent concurrent writes from multiple CLI instances.
  // For protection against data corruption we use atomic writes, and we accept data loss in case
  // of concurrent writes from multiple processes.
  private lock = new AsyncLock()

  abstract schema: T

  abstract getConfigPath(): string

  protected abstract initConfig(migrate: boolean): Promise<I<T>>

  /**
   * Get the full config or the value for the specific section or section key/record.
   */
  async get(): Promise<I<T>>
  async get<S extends keyof I<T>>(section: S): Promise<I<T>[S]>
  async get<S extends keyof I<T>, K extends keyof I<T>[S]>(section: S, key: K): Promise<I<T>[S][K] | undefined>
  async get<S extends keyof I<T>, K extends keyof I<T>[S]>(
    section?: S,
    key?: K
  ): Promise<I<T> | I<T>[S] | I<T>[S][K] | undefined> {
    const path = this.getConfigPath()

    // we also acquire the lock to make sure we get the latest version of the config in case a write is in progress
    return await this.lock.acquire(path, async () => {
      const config = await this.readConfig()
      if (section === undefined) {
        return config
      } else if (key === undefined) {
        return config[section]
      } else {
        return config[section][key]
      }
    })
  }

  /**
   * Set the value for the given section or key in a section.
   */
  async set<S extends keyof I<T>, _K extends keyof I<T>[S]>(section: S, value: I<T>[S]): Promise<void>
  async set<S extends keyof I<T>, K extends keyof I<T>[S]>(section: S, key: K, value: I<T>[S][K]): Promise<void>
  async set<S extends keyof I<T>, K extends keyof I<T>[S]>(section: S, key: K | I<T>[S], value?: I<T>[S][K]) {
    const path = this.getConfigPath()
    await this.lock.acquire(path, async () => {
      const config = await this.readConfig()
      if (value === undefined) {
        config[section] = <I<T>[S]>key
      } else {
        config[section][<K>key] = value
      }
      const validated = this.validate(config, "updating")
      await this.writeConfig(validated)
    })
  }

  /**
   * Update the given object/record in the store. The object/record for the section and key must already
   * exist, otherwise an error is thrown. If a partial record is provided, the record is updated with the fields
   * given. Returns the full record after update.
   */
  async update<S extends keyof I<T>, K extends keyof I<T>[S], _N extends keyof I<T>[S][K]>(
    section: S,
    key: K,
    value: Partial<I<T>[S][K]>
  ): Promise<I<T>[S][K]>
  async update<S extends keyof I<T>, K extends keyof I<T>[S], N extends keyof I<T>[S][K]>(
    section: S,
    key: K,
    name: N,
    value: I<T>[S][K][N]
  ): Promise<I<T>[S][K]>
  async update<S extends keyof I<T>, K extends keyof I<T>[S], N extends keyof I<T>[S][K]>(
    section: S,
    key: K,
    nameOrPartialValue: N | Partial<I<T>[S][K]>,
    value?: I<T>[S][K][N]
  ) {
    const path = this.getConfigPath()
    await this.lock.acquire(path, async () => {
      const config = await this.readConfig()
      const record = config[section]?.[key]

      if (!record) {
        throw new InternalError({
          message: `The config store does not contain a record for key '${String(section)}.${String(
            key
          )}. Cannot update.'`,
        })
      }

      if (value) {
        config[section][key][<N>nameOrPartialValue] = value
      } else {
        config[section][key] = { ...config[section][key], ...(<Partial<I<T>[S][K]>>nameOrPartialValue) }
      }

      const validated = this.validate(config, "updating")
      await this.writeConfig(validated)
    })
  }

  /**
   * Delete the given object/record from the specified section, if it exists.
   */
  async delete<S extends keyof I<T>, K extends keyof I<T>[S]>(section: S, key: K) {
    const path = this.getConfigPath()
    await this.lock.acquire(path, async () => {
      const config = await this.readConfig()

      if (config[section]?.[key]) {
        delete config[section][key]
        const validated = this.validate(config, "deleting from")
        await this.writeConfig(validated)
      }
    })
  }

  async clear() {
    const config = await this.initConfig(false)
    await this.writeConfig(config)
  }

  protected validate(data: any, context: string): I<T> {
    try {
      return this.schema.parse(data)
    } catch (error) {
      const configPath = this.getConfigPath()
      throw new InternalError({
        message: `Validation error(s) when ${context} configuration file at ${configPath}:\n${error}`,
      })
    }
  }

  private async readConfig(): Promise<I<T>> {
    const configPath = this.getConfigPath()
    await ensureFile(configPath)

    let parsed: I<T>
    try {
      const data = await readFile(configPath)
      parsed = JSON.parse(data.toString())
    } catch {
      parsed = await this.initConfig(true)
    }
    return this.validate(parsed, "reading")
  }

  private async writeConfig(config: I<T>) {
    await writeFileAtomic(this.getConfigPath(), JSON.stringify(config), { mode: this.fileMode })
  }
}
