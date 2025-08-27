/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ConfigDump, ConfigDumpWithInternalFields } from "../../garden.js"

export function filterDisableFromConfigDump<T extends ConfigDump | ConfigDumpWithInternalFields>(config: T) {
  const filteredModuleConfigs = config.moduleConfigs.map((moduleConfig) => {
    const filteredConfig = {
      ...moduleConfig,
      serviceConfigs: moduleConfig.serviceConfigs.filter((c) => !c.disabled),
      taskConfigs: moduleConfig.taskConfigs.filter((c) => !c.disabled),
      testConfigs: moduleConfig.testConfigs.filter((c) => !c.disabled),
    }
    return filteredConfig
  })

  const filteredActionConfigs = Object.fromEntries(
    Object.entries(config.actionConfigs).map(([key, configs]) => [
      key,
      Object.fromEntries(Object.entries(configs).filter(([, c]) => !c.disabled)),
    ])
  ) as T["actionConfigs"]

  return {
    moduleConfigs: filteredModuleConfigs,
    actionConfigs: filteredActionConfigs,
  }
}
