/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { MigrationInterface, QueryRunner } from "typeorm-with-better-sqlite3"

export class Init1599658427984 implements MigrationInterface {
  name = "Init1599658427984"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "client_auth_token" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "_createdAt" datetime NOT NULL DEFAULT (datetime('now')), "_updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "_version" integer NOT NULL, "token" varchar NOT NULL)`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_3f2902720f10884e413933e582" ON "client_auth_token" ("token") `
    )
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "garden_process" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "_createdAt" datetime NOT NULL DEFAULT (datetime('now')), "_updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "_version" integer NOT NULL, "pid" integer NOT NULL, "startedAt" datetime NOT NULL, "arguments" varchar NOT NULL, "sessionId" varchar, "projectRoot" varchar, "projectName" varchar, "environmentName" varchar, "namespace" varchar, "persistent" boolean NOT NULL DEFAULT (0), "serverHost" varchar, "serverAuthKey" varchar, "command" varchar)`
    )
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "local_address" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "_createdAt" datetime NOT NULL DEFAULT (datetime('now')), "_updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "_version" integer NOT NULL, "projectName" varchar NOT NULL, "moduleName" varchar NOT NULL, "serviceName" varchar NOT NULL, "hostname" varchar NOT NULL)`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ccb1b3de9e2a1bd39c4619d516" ON "local_address" ("projectName", "moduleName", "serviceName", "hostname") `
    )
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "warning" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "_createdAt" datetime NOT NULL DEFAULT (datetime('now')), "_updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "_version" integer NOT NULL, "key" varchar NOT NULL, "hidden" boolean NOT NULL)`
    )
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_e32e342758d4c83273d405698e" ON "warning" ("key") `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_e32e342758d4c83273d405698e"`)
    await queryRunner.query(`DROP TABLE "warning"`)
    await queryRunner.query(`DROP INDEX "IDX_ccb1b3de9e2a1bd39c4619d516"`)
    await queryRunner.query(`DROP TABLE "local_address"`)
    await queryRunner.query(`DROP TABLE "garden_process"`)
    await queryRunner.query(`DROP INDEX "IDX_3f2902720f10884e413933e582"`)
    await queryRunner.query(`DROP TABLE "client_auth_token"`)
  }
}
