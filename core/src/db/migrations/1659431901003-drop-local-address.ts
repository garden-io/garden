/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { MigrationInterface, QueryRunner } from "typeorm-with-better-sqlite3"

export class dropLocalAddress1659431901003 implements MigrationInterface {
  name = "dropLocalAddress1659431901003"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "local_address" RENAME TO "backup_local_address"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "backup_local_address" RENAME TO "local_address"`)
  }
}
