/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { MigrationInterface, QueryRunner } from "typeorm-with-better-sqlite3"

export class refreshAuthToken1605039158093 implements MigrationInterface {
  name = "refreshAuthToken1605039158093"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_3f2902720f10884e413933e582"`)
    await queryRunner.query(
      `CREATE TABLE "temporary_client_auth_token" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "_createdAt" datetime NOT NULL DEFAULT (datetime('now')), "_updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "_version" integer NOT NULL, "token" varchar NOT NULL, "refreshToken" varchar NOT NULL, "validity" datetime NOT NULL)`
    )
    await queryRunner.query(
      `INSERT INTO "temporary_client_auth_token"("_id", "_createdAt", "_updatedAt", "_version", "token") SELECT "_id", "_createdAt", "_updatedAt", "_version", "token" FROM "client_auth_token"`
    )
    await queryRunner.query(`DROP TABLE "client_auth_token"`)
    await queryRunner.query(`ALTER TABLE "temporary_client_auth_token" RENAME TO "client_auth_token"`)
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3f2902720f10884e413933e582" ON "client_auth_token" ("token") `)
    await queryRunner.query(
      `CREATE TABLE "temporary_garden_process" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "_createdAt" datetime NOT NULL DEFAULT (datetime('now')), "_updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "_version" integer NOT NULL, "pid" integer NOT NULL, "startedAt" datetime NOT NULL, "arguments" varchar NOT NULL, "sessionId" varchar, "projectRoot" varchar, "projectName" varchar, "environmentName" varchar, "namespace" varchar, "persistent" boolean NOT NULL DEFAULT (0), "serverHost" varchar, "serverAuthKey" varchar, "command" varchar)`
    )
    await queryRunner.query(
      `INSERT INTO "temporary_garden_process"("_id", "_createdAt", "_updatedAt", "_version", "pid", "startedAt", "arguments", "sessionId", "projectRoot", "projectName", "environmentName", "namespace", "persistent", "serverHost", "serverAuthKey", "command") SELECT "_id", "_createdAt", "_updatedAt", "_version", "pid", "startedAt", "arguments", "sessionId", "projectRoot", "projectName", "environmentName", "namespace", "persistent", "serverHost", "serverAuthKey", "command" FROM "garden_process"`
    )
    await queryRunner.query(`DROP TABLE "garden_process"`)
    await queryRunner.query(`ALTER TABLE "temporary_garden_process" RENAME TO "garden_process"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "garden_process" RENAME TO "temporary_garden_process"`)
    await queryRunner.query(
      `CREATE TABLE "garden_process" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "_createdAt" datetime NOT NULL DEFAULT (datetime('now')), "_updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "_version" integer NOT NULL, "pid" integer NOT NULL, "startedAt" datetime NOT NULL, "arguments" varchar NOT NULL, "sessionId" varchar, "projectRoot" varchar, "projectName" varchar, "environmentName" varchar, "namespace" varchar, "persistent" boolean NOT NULL DEFAULT (0), "serverHost" varchar, "serverAuthKey" varchar, "command" varchar)`
    )
    await queryRunner.query(
      `INSERT INTO "garden_process"("_id", "_createdAt", "_updatedAt", "_version", "pid", "startedAt", "arguments", "sessionId", "projectRoot", "projectName", "environmentName", "namespace", "persistent", "serverHost", "serverAuthKey", "command") SELECT "_id", "_createdAt", "_updatedAt", "_version", "pid", "startedAt", "arguments", "sessionId", "projectRoot", "projectName", "environmentName", "namespace", "persistent", "serverHost", "serverAuthKey", "command" FROM "temporary_garden_process"`
    )
    await queryRunner.query(`DROP TABLE "temporary_garden_process"`)
    await queryRunner.query(`DROP INDEX "IDX_3f2902720f10884e413933e582"`)
    await queryRunner.query(`ALTER TABLE "client_auth_token" RENAME TO "temporary_client_auth_token"`)
    await queryRunner.query(
      `CREATE TABLE "client_auth_token" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "_createdAt" datetime NOT NULL DEFAULT (datetime('now')), "_updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "_version" integer NOT NULL, "token" varchar NOT NULL)`
    )
    await queryRunner.query(
      `INSERT INTO "client_auth_token"("_id", "_createdAt", "_updatedAt", "_version", "token") SELECT "_id", "_createdAt", "_updatedAt", "_version", "token" FROM "temporary_client_auth_token"`
    )
    await queryRunner.query(`DROP TABLE "temporary_client_auth_token"`)
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3f2902720f10884e413933e582" ON "client_auth_token" ("token") `)
  }
}
