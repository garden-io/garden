/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Log } from "../../../logger/log-entry"
import { DeployState } from "../../../types/service"
import { exec } from "../../../util/util"
import chalk from "chalk"

interface MinikubeAddons {
  [key: string]: {
    Profile: string
    Status: string
  }
}

export async function minikubeNginxStatus(log: Log): Promise<DeployState> {
  const result = await exec("minikube", ["addons", "list", "-o=json"])
  const minikubeAddons = JSON.parse(result.stdout) as MinikubeAddons
  const addonEnabled = minikubeAddons.ingress.Status === "enabled"
  log.debug(chalk.yellow(`Status of minikube ingress controller addon: ${addonEnabled ? "enabled" : "disabled"}`))
  return addonEnabled ? "ready" : "missing"
}

export async function minikubeNginxInstall(log: Log) {
  const status = await minikubeNginxStatus(log)
  if (status === "ready") {
    return
  }
  log.info("Enabling minikube ingress controller addon")
  await exec("minikube", ["addons", "enable", "ingress"])
}

export async function minikubeNginxUninstall(log: Log) {
  const status = await minikubeNginxStatus(log)
  if (status === "missing") {
    return
  }
  log.info("Disabling minikube ingress controller addon")
  await exec("minikube", ["addons", "disable", "ingress"])
}
