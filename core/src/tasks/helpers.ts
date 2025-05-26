/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapKeys, mapValues, pickBy, omit } from "lodash-es"
import type { GraphResults } from "../graph/results.js"
import type { DeployStatus } from "../plugin/handlers/Deploy/get-status.js"
import { splitLast } from "../util/string.js"
import type { ActionLog } from "../logger/log-entry.js"
import { LogLevel } from "../logger/logger.js"

export function makeGetStatusLog(log: ActionLog, force: boolean): ActionLog {
  // TODO: We shouldn't need to call the `getStatus` handler when forcing, but for now we semi-mute any log output
  // from the handler (i.e. put it at the debug level).
  return log.createLog(force ? { fixLevel: LogLevel.debug } : {})
}

export function getDeployStatuses(dependencyResults: GraphResults): { [name: string]: DeployStatus } {
  const deployResults = pickBy(dependencyResults.getMap(), (r) => r && r.type === "deploy")
  const statuses = mapValues(deployResults, (r) => omit(r!.result, "version") as DeployStatus)
  return mapKeys(statuses, (_, key) => splitLast(key, ".")[1])
}
