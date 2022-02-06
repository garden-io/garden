/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "./logger/log-entry"

export async function emitWarning(params: { key: string; log: LogEntry; message: string }) {
  // Note: lazy-loading for startup performance
  const { Warning } = require("./db/entities/warning")
  await Warning.emit(params)
}

export async function hideWarning(key: string) {
  // Note: lazy-loading for startup performance
  const { Warning } = require("./db/entities/warning")
  await Warning.hide(key)
}
