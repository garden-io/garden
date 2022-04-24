/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildActionConfig } from "../../actions/build"
import { DeployActionConfig } from "../../actions/deploy"
import { joi, joiEnvVars, joiSparseArray, StringMap } from "../../config/common"

interface OpenfaasBuildSpec {
  handler: string
  image: string
  lang: string
}

export type OpenfaasBuildConfig = BuildActionConfig<OpenfaasBuildSpec>

export const openfaasBuildActionSchema = () =>
  joi
    .object()
    .keys({
      handler: joi
        .posixPath()
        .subPathOnly()
        .default(".")
        .description("Specify which directory under the module contains the handler file/function."),
      image: joi
        .string()
        .description("The image name to use for the built OpenFaaS container (defaults to the module name)"),
      lang: joi.string().required().description("The OpenFaaS language template to use to build this function."),
    })
    .unknown(false)

interface OpenfaasDeploySpec {
  env: StringMap
}

export type OpenfaasDeployConfig = DeployActionConfig<OpenfaasDeploySpec>

export const openfaasDeployActionSchema = () =>
  joi
    .object()
    .keys({
      env: joiEnvVars(),
    })
    .unknown(false)

