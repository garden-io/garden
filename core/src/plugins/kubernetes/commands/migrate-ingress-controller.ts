/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginCommand } from "../../../plugin/command.js"
import type { KubernetesPluginContext } from "../config.js"
import { getGardenIngressController } from "../nginx/ingress-controller.js"
import { ensureTraefikIngressController } from "../traefik/ingress-controller.js"
import { styles } from "../../../logger/styles.js"

export const migrateIngressController: PluginCommand = {
  name: "migrate-ingress-controller",
  description:
    "Migrate from nginx to Traefik ingress controller. Uninstalls Garden-managed nginx and installs Traefik.",

  title: ({ environmentName }) => {
    return `Migrating ingress controller for the ${styles.highlight(environmentName)} environment`
  },

  handler: async ({ ctx, log }) => {
    const k8sCtx = <KubernetesPluginContext>ctx

    // Step 1: Detect and uninstall Garden-installed nginx
    const nginxController = getGardenIngressController(k8sCtx)
    const nginxStatus = await nginxController.getStatus(k8sCtx, log)

    if (nginxStatus !== "missing") {
      log.info("Detected Garden-installed nginx ingress controller. Uninstalling...")
      await nginxController.uninstall(k8sCtx, log)
      log.info("nginx ingress controller uninstalled successfully.")
    } else {
      log.info("No Garden-installed nginx ingress controller detected.")
    }

    // Step 2: Install Traefik
    log.info("Installing Traefik ingress controller...")
    await ensureTraefikIngressController(k8sCtx, log)

    log.success({ msg: "\nMigration complete!", showDuration: false })
    log.info(
      `Please update your Garden provider configuration:\n` +
        `  Set ${styles.highlight("setupIngressController: traefik")} (or remove the setting to use the new default).\n` +
        `  Set ${styles.highlight('ingressClass: "traefik"')} if you have a custom ingressClass configured.`
    )

    return { result: {} }
  },
}
