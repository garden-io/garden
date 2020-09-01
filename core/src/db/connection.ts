/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { Connection, getConnectionManager, ConnectionOptions } from "typeorm"
import { gardenEnv } from "../constants"

let connection: Connection

const databasePath = join(gardenEnv.GARDEN_DB_DIR, "db")

// Note: This function needs to be synchronous to work with the typeorm Active Record pattern (see ./base-entity.ts)
export function getConnection(): Connection {
  if (!connection) {
    const { LocalAddress } = require("./entities/local-address")
    const { ClientAuthToken } = require("./entities/client-auth-token")
    const { GardenProcess } = require("./entities/garden-process")
    const { Warning } = require("./entities/warning")

    // Prepare the connection (the ormconfig.json in the static dir is only used for the typeorm CLI during dev)
    const options: ConnectionOptions = {
      type: "sqlite",
      database: databasePath,
      // IMPORTANT: All entities and migrations need to be manually referenced here because of how we
      // package the garden binary
      entities: [LocalAddress, ClientAuthToken, GardenProcess, Warning],
      migrations: [],
      // Auto-create new tables on init
      synchronize: true,
      // Auto-run migrations on init
      migrationsRun: true,
    }
    connection = getConnectionManager().create(options)
  }

  return connection
}

export async function ensureConnected() {
  const _connection = getConnection()
  if (!_connection.isConnected) {
    await _connection.connect()
  }
}
