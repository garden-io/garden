/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildAction, BuildActionConfig } from "../../actions/build"
import { DeployAction, DeployActionConfig } from "../../actions/deploy"
import { joi, joiEnvVars, StringMap } from "../../config/common"
import { openfaasModuleOutputsSchema } from "./config"

interface OpenfaasBuildSpec {
  handler: string
  image: string
  lang: string
}

export type OpenfaasBuildConfig = BuildActionConfig<"openfaas", OpenfaasBuildSpec>
export type OpenfaasBuildAction = BuildAction<OpenfaasBuildConfig, {}>

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

interface OpenfaasDeployOutputs {
  endpoint: string
}

export const openfaasDeployOutputsSchema = () => openfaasModuleOutputsSchema()

export type OpenfaasDeployConfig = DeployActionConfig<"openfaas", OpenfaasDeploySpec>
export type OpenfaasDeployAction = DeployAction<OpenfaasDeployConfig, OpenfaasDeployOutputs>

export const openfaasDeployActionSchema = () =>
  joi
    .object()
    .keys({
      env: joiEnvVars(),
    })
    .unknown(false)

