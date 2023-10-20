/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Log } from "../../../logger/log-entry"
import { exec } from "../../../util/util"
import chalk from "chalk"
import { KubernetesPluginContext } from "../config"
import { DeployState } from "../../../types/service"
import { configureMicrok8sAddons } from "../local/microk8s"

export async function microk8sNginxStatus(log: Log): Promise<DeployState> {
  const statusCommandResult = await exec("microk8s", ["status", "--format", "short"])
  const status = statusCommandResult.stdout
  const addonEnabled = status.includes("core/ingress: enabled")
  log.debug(chalk.yellow(`Status of microk8s ingress controller addon: ${addonEnabled ? "enabled" : "disabled"}`))
  if (addonEnabled) {
    return "ready"
  }
  return "missing"
}

export async function microk8sNginxInstall(ctx: KubernetesPluginContext, log: Log) {
  const status = await microk8sNginxStatus(log)
  if (status === "ready") {
    return
  }
  log.info("Enabling microk8s ingress controller addon")
  await configureMicrok8sAddons(log, ["ingress"])
}

export async function microk8sNginxUninstall(ctx: KubernetesPluginContext, log: Log) {
  const status = await microk8sNginxStatus(log)
  if (status === "missing") {
    return
  }
  log.info("Disabling microk8s ingress controller addon")
  await exec("microk8s", ["disable", "ingress"])
}
