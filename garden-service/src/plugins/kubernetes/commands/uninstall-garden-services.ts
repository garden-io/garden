/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { PluginCommand } from "../../../types/plugin/command"
import { getKubernetesSystemVariables } from "../init"
import { KubernetesPluginContext } from "../config"
import { getSystemGarden } from "../system"

export const uninstallGardenServices: PluginCommand = {
  name: "uninstall-garden-services",
  description: "Clean up all installed cluster-wide Garden services.",

  title: ({ environmentName }) => {
    return `Removing cluster-wide services for ${chalk.white(environmentName)} environment`
  },

  handler: async ({ ctx, log }) => {
    const k8sCtx = <KubernetesPluginContext>ctx
    const variables = getKubernetesSystemVariables(k8sCtx.provider.config)

    const sysGarden = await getSystemGarden(k8sCtx, variables || {}, log)
    const actions = await sysGarden.getActionRouter()

    const graph = await sysGarden.getConfigGraph(log)
    const services = await graph.getServices()

    log.info("")

    // We have to delete all services except nfs-provisioner first to avoid volumes getting stuck
    const serviceNames = services.map((s) => s.name).filter((name) => name !== "nfs-provisioner")
    const serviceStatuses = await actions.deleteServices(log, serviceNames)

    if (k8sCtx.provider.config._systemServices.includes("nfs-provisioner")) {
      const service = await graph.getService("nfs-provisioner")
      await actions.deleteService({ service, log })
    }

    log.info("")

    const environmentStatuses = await actions.cleanupAll(log)

    log.info(chalk.green("\nDone!"))

    return { result: { serviceStatuses, environmentStatuses } }
  },
}
