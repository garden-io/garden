/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { BooleanParameter } from "../../cli/params.js"
import type { Garden } from "../../garden.js"
import type { Log } from "../../logger/log-entry.js"

export const watchParameter = new BooleanParameter({
  help: "[REMOVED] Watch for changes and update actions automatically.",
  aliases: ["w"],
  cliOnly: true,
  hidden: true,
})

export async function watchRemovedWarning(garden: Garden, log: Log) {
  return garden.emitWarning({
    log,
    key: "watch-flag-removed",
    message:
      "The -w/--watch flag has been removed. Please use other options instead, such as the --sync option for Deploy actions. If you need this feature and would like it re-introduced, please don't hesitate to reach out: https://garden.io/community",
  })
}
