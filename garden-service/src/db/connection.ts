/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Connection, getConnectionManager, ConnectionOptions } from "typeorm"
import { join } from "path"
import { GARDEN_GLOBAL_PATH } from "../constants"
import { LocalAddress } from "./entities/local-address"

let connection: Connection

// Note: This function needs to be synchronous to work with the typeorm Active Record pattern (see ./base-entity.ts)
export function getConnection(): Connection {
  if (!connection) {
    // Prepare the connection (the ormconfig.json in the static dir is only used for the typeorm CLI during dev)
    const options: ConnectionOptions = {
      type: "sqlite",
      database: join(GARDEN_GLOBAL_PATH, "db"),
      // IMPORTANT: All entities and migrations need to be manually referenced here because of how we
      // package the garden binary
      entities: [LocalAddress],
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
