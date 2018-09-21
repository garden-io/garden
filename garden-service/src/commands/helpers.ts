/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import dedent = require("dedent")
import { uniq, flatten } from "lodash"
import { Garden } from "../garden"
import { Module } from "../types/module"
import { prepareRuntimeContext, Service } from "../types/service"
import { LogEntry } from "../logger/log-entry"

// Returns true if validation succeeded, false otherwise.
export async function validateHotReloadOpt(
  garden: Garden, log: LogEntry, hotReloadServiceNames: string[],
): Promise<boolean> {
  const incompatibleServices: Service[] = []

  for (const hotReloadService of await garden.getServices(hotReloadServiceNames)) {
    if (!hotReloadService.module.spec.hotReload) {
      incompatibleServices.push(hotReloadService)
    }
  }

  if (incompatibleServices.length === 0) {
    return true
  } else {
    const singular = incompatibleServices.length === 1
    const incompatibleServicesDescription = incompatibleServices
      .map(s => `${s.name} (from module ${s.module.name})`)
      .join("\n")
    const errMsg = dedent`
      Error: Hot reloading was requested for the following ${singular ? "service" : "services"}, \
      but ${singular ? "its parent module is" : "their parent modules are"} not configured \
      for hot reloading:

      ${incompatibleServicesDescription}

      Aborting.
    `
    log.error({ msg: errMsg })
    return false
  }

}

export async function hotReloadAndLog(garden: Garden, log: LogEntry, module: Module) {
  log.info({
    section: module.name,
    msg: "Hot reloading",
    status: "active",
  })

  const serviceDependencyNames = uniq(flatten(module.services.map(s => s.config.dependencies)))
  const runtimeContext = await prepareRuntimeContext(
    garden, log, module, await garden.getServices(serviceDependencyNames),
  )

  try {
    await garden.actions.hotReload({ log, module, runtimeContext })
  } catch (err) {
    log.setError()
    throw err
  }

  const msec = log.getDuration(5) * 1000
  log.setSuccess({
    msg: chalk.green(`Done (took ${msec} ms)`),
    append: true,
  })

}
