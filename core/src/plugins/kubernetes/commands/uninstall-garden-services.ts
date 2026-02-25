/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginCommand } from "../../../plugin/command.js"
import type { KubernetesPluginContext } from "../config.js"
import { getGardenIngressController, ingressControllerUninstall } from "../nginx/ingress-controller.js"
import { getTraefikIngressController, traefikIngressControllerUninstall } from "../traefik/ingress-controller.js"
import { styles } from "../../../logger/styles.js"
import { aecAgentUninstall } from "./setup-aec.js"

export const uninstallGardenServices: PluginCommand = {
  name: "uninstall-garden-services",
  description: "Clean up all installed cluster-wide Garden services.",

  title: ({ environmentName }) => {
    return `Removing cluster-wide services for ${styles.highlight(environmentName)} environment`
  },

  handler: async ({ ctx, log }) => {
    const k8sCtx = <KubernetesPluginContext>ctx
    const controllerType = k8sCtx.provider.config.setupIngressController

    if (controllerType === "traefik") {
      log.info({ msg: `Uninstalling Traefik ingress controller` })
      await traefikIngressControllerUninstall(k8sCtx, log)
    } else if (controllerType === "nginx") {
      log.info({ msg: `Uninstalling Nginx ingress controller` })
      await ingressControllerUninstall(k8sCtx, log)
    }

    // Also try to clean up the other controller if it exists (handles partial migration states)
    if (controllerType === "traefik") {
      const nginxController = getGardenIngressController(k8sCtx)
      const nginxStatus = await nginxController.getStatus(k8sCtx, log)
      if (nginxStatus !== "missing") {
        log.info({ msg: `Also removing stale nginx ingress controller` })
        await ingressControllerUninstall(k8sCtx, log)
      }
    } else if (controllerType === "nginx") {
      const traefikController = getTraefikIngressController(k8sCtx)
      const traefikStatus = await traefikController.getStatus(k8sCtx, log)
      if (traefikStatus !== "missing") {
        log.info({ msg: `Also removing stale Traefik ingress controller` })
        await traefikIngressControllerUninstall(k8sCtx, log)
      }
    }

    // Clean up AEC agent if it's installed
    await aecAgentUninstall(k8sCtx, log)

    log.success({ msg: "\nDone!", showDuration: false })

    return { result: {} }
  },
}
