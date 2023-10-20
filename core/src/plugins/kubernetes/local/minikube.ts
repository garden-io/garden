/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ChildProcessError } from "../../../exceptions.js"
import { Log } from "../../../logger/log-entry.js"
import type { DeployState } from "../../../types/service.js"
import { exec } from "../../../util/util.js"
import chalk from "chalk"

interface minikubeAddons {
  [key: string]: {
    Profile: string
    Status: string
  }
}

/**
 * Automatically set docker environment variables for minikube
 * TODO: it would be better to explicitly provide those to docker instead of using process.env
 */
export async function setMinikubeDockerEnv() {
  let minikubeEnv: string

  try {
    minikubeEnv = (await exec("minikube", ["docker-env", "--shell=bash"])).stdout
  } catch (err) {
    if (!(err instanceof ChildProcessError)) {
      throw err
    }
    if (err.details.output.includes("driver does not support")) {
      return
    }
    throw err
  }

  for (const line of minikubeEnv.split("\n")) {
    const matched = line.match(/^export (\w+)="(.+)"$/)
    if (matched) {
      process.env[matched[1]] = matched[2]
    }
  }
}

export async function minikubeNginxStatus(log: Log): Promise<DeployState> {
  const result = await exec("minikube", ["addons", "list", "-o=json"])
  const minikubeAddons = JSON.parse(result.stdout) as minikubeAddons
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
