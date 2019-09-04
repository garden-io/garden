/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigGraph } from "../config-graph"
import { Service } from "../types/service"

export async function getHotReloadServiceNames(namesFromOpt: string[] | undefined, configGraph: ConfigGraph) {
  const names = namesFromOpt || []
  if (names[0] === "*") {
    return (await configGraph.getServices()).filter((s) => supportsHotReloading(s)).map((s) => s.name)
  } else {
    return names
  }
}

/**
 * Returns an error message string if one or more serviceNames refers to a service that's not configured for
 * hot reloading, or if one or more of serviceNames referes to a non-existent service. Returns null otherwise.
 */
export async function validateHotReloadServiceNames(
  serviceNames: string[],
  configGraph: ConfigGraph
): Promise<string | null> {
  const services = await configGraph.getServices(serviceNames)
  const invalidNames = services.filter((s) => !supportsHotReloading(s)).map((s) => s.name)
  if (invalidNames.length > 0) {
    return `The following requested services are not configured for hot reloading: ${invalidNames.join(", ")}`
  } else {
    return null
  }
}

function supportsHotReloading(service: Service) {
  return service.config.hotReloadable
}
