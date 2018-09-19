/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { builderWorkDir, stackFilename } from "./openfaas"

export interface FaasCliCmdParams {
  buildPath: string,
  imageId: string,
  faasCmd: string,
  faasOpts?: string[],
  dockerOpts?: string[],
}

export function faasCliCmd(
  cmdParams: FaasCliCmdParams,
): string[] {

  return [
    "docker",
    ...(faasCliDockerArgs(cmdParams)),
  ]

}

export function faasCliDockerArgs(
  { buildPath, imageId, faasCmd, faasOpts = [], dockerOpts = [] }: FaasCliCmdParams): string[] {

  return [
    "run", "-i",
    "-v", `${buildPath}:${builderWorkDir}`,
    "-v", "/var/run/docker.sock:/var/run/docker.sock",
    "--workdir", builderWorkDir,
    ...dockerOpts,
    imageId,
    "faas-cli", faasCmd, "-f", stackFilename,
    ...faasOpts,
  ]

}
