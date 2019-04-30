/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten } from "lodash"
import { ModuleConfig } from "garden-cli/src/config/module"

export function getServiceNames(moduleConfigs: ModuleConfig[]) {
  return flatten(moduleConfigs.map(m => m.serviceConfigs.map(s => s.name)))
}

export function timeConversion(millisec) {
  const seconds = +(millisec / 1000).toFixed(1)
  const minutes = +(millisec / (1000 * 60)).toFixed(1)
  const hours = +(millisec / (1000 * 60 * 60)).toFixed(1)
  const days = +(millisec / (1000 * 60 * 60 * 24)).toFixed(1)
  let formatTime = (num, prefix) => `${num} ${prefix}`
  let timeFormatted: string | null = null
  if (seconds < 60) {
    timeFormatted = formatTime(seconds, "Sec")
  } else if (minutes < 60) {
    timeFormatted = formatTime(minutes, "Min")
  } else if (hours < 24) {
    timeFormatted = formatTime(hours, "Hrs")
  } else {
    timeFormatted = formatTime(days, "Days")
  }

  return timeFormatted
}
