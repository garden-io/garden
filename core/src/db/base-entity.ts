/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  BaseEntity,
  ObjectType,
  Repository,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  PrimaryGeneratedColumn,
} from "typeorm-with-better-sqlite3"

export class GardenEntity extends BaseEntity {
  // Add these auto-populated columns on every entity
  @PrimaryGeneratedColumn()
  _id: number

  @CreateDateColumn()
  _createdAt: Date

  @UpdateDateColumn()
  _updatedAt: Date

  @VersionColumn()
  _version: number

  /**
   * Gets current entity's Repository.
   *
   * Overriding this to make sure our connection parameters are correctly set.
   */
  static getRepository<T extends BaseEntity>(this: ObjectType<T>): Repository<T> {
    const { getConnection } = require("./connection")
    const connection = getConnection()
    return connection.getRepository(this)
  }

  /**
   * Helper method to avoid circular import issues.
   */
  static getConnection() {
    const { getConnection } = require("./connection")
    return getConnection()
  }
}
