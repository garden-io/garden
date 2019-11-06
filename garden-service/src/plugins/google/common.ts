/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Module } from "../../types/module"
import { PrepareEnvironmentParams, PrepareEnvironmentResult } from "../../types/plugin/provider/prepareEnvironment"
import { ConfigurationError } from "../../exceptions"
import { ExecTestSpec } from "../exec"
import { GCloud } from "./gcloud"
import { ModuleSpec } from "../../config/module"
import { CommonServiceSpec } from "../../config/service"
import { EnvironmentStatus } from "../../types/plugin/provider/getEnvironmentStatus"

export const GOOGLE_CLOUD_DEFAULT_REGION = "us-central1"

export interface GoogleCloudModule<
  M extends ModuleSpec = ModuleSpec,
  S extends CommonServiceSpec = CommonServiceSpec,
  T extends ExecTestSpec = ExecTestSpec
> extends Module<M, S, T> {}

export async function getEnvironmentStatus() {
  let sdkInfo: any

  const output: EnvironmentStatus = {
    ready: true,
    detail: {
      sdkInstalled: true,
      sdkInitialized: true,
      betaComponentsInstalled: true,
      sdkInfo: {},
    },
    outputs: {},
  }

  try {
    sdkInfo = output.detail.sdkInfo = await gcloud().json(["info"])
  } catch (err) {
    output.ready = false
    output.detail.sdkInstalled = false
  }

  if (!sdkInfo.config.account) {
    output.ready = false
    output.detail.sdkInitialized = false
  }

  if (!sdkInfo.installation.components.beta) {
    output.ready = false
    output.detail.betaComponentsInstalled = false
  }

  return output
}

export async function prepareEnvironment({ status, log }: PrepareEnvironmentParams): Promise<PrepareEnvironmentResult> {
  if (!status.detail.sdkInstalled) {
    throw new ConfigurationError(
      "Google Cloud SDK is not installed. " +
        "Please visit https://cloud.google.com/sdk/downloads for installation instructions.",
      {}
    )
  }

  if (!status.detail.betaComponentsInstalled) {
    log.info({
      section: "google-cloud-functions",
      msg: `Installing gcloud SDK beta components...`,
    })
    await gcloud().call(["components update"])
    await gcloud().call(["components install beta"])
  }

  if (!status.detail.sdkInitialized) {
    log.info({
      section: "google-cloud-functions",
      msg: `Initializing SDK...`,
    })
    await gcloud().call(["init"], { timeout: 600, tty: true })
  }

  return { status: { ready: true, outputs: {} } }
}

export function gcloud(project?: string, account?: string) {
  return new GCloud({ project, account })
}
