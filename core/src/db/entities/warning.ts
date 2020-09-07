/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Entity, Column, Index } from "typeorm-with-better-sqlite3"
import { GardenEntity } from "../base-entity"
import { LogEntry } from "../../logger/log-entry"
import chalk from "chalk"

/**
 * Provides a mechanism to emit warnings that the user can then hide, via the `garden util hide-warning` command.
 */
@Entity()
@Index(["key"], { unique: true })
export class Warning extends GardenEntity {
  @Column()
  key: string

  @Column()
  hidden: boolean

  static async emit({ key, log, message }: { key: string; log: LogEntry; message: string }) {
    const existing = await this.findOne({ where: { key } })

    if (!existing || !existing.hidden) {
      log.warn(
        chalk.yellow(message + `\nRun ${chalk.underline(`garden util hide-warning ${key}`)} to disable this warning.`)
      )
    }
  }

  static async hide(key: string) {
    try {
      await this.createQueryBuilder().insert().values({ key, hidden: true }).execute()
    } catch {}
  }
}
