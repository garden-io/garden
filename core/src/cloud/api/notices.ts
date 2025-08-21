/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CloudApiError } from "../../exceptions.js"
import type { Log } from "../../logger/log-entry.js"

type ServerNotice = {
  message: string
  severity: "warning" | "error" | "info"
}

export function handleServerNotices(notices: ServerNotice[], log: Log) {
  for (const notice of notices) {
    switch (notice.severity) {
      case "warning":
        log.warn(`WARNING: ${notice.message}`)
        break
      case "error":
        log.error(`ERROR: ${notice.message}`)
        break
      case "info":
        log.info(notice.message)
        break
    }
  }

  const errors = notices.filter((notice) => notice.severity === "error")
  if (errors.length > 0) {
    throw new CloudApiError({
      message: `There ${errors.length > 1 ? `were ${errors.length} errors` : "was an error"} connecting to Garden Cloud (See error logs above).`,
    })
  }
}
