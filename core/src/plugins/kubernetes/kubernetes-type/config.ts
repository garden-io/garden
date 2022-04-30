/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi, joiSparseArray } from "../../../config/common"
import {
  namespaceNameSchema,
  portForwardsSchema,
  PortForwardSpec,
  KubernetesCommonRunSpec,
  kubernetesCommonRunSchemaKeys,
  targetResourceSpecSchema,
  KubernetesTargetResourceSpec,
} from "../config"
import {
  kubernetesDeployDevModeSchema,
  KubernetesDeployDevModeSpec,
} from "../dev-mode"
import { KubernetesKustomizeSpec, kustomizeSpecSchema } from "./kustomize"
import { KubernetesResource } from "../types"
import { DeployAction, DeployActionConfig } from "../../../actions/deploy"
import { RunAction, RunActionConfig } from "../../../actions/run"
import { TestAction, TestActionConfig } from "../../../actions/test"
import { defaultTargetSchema } from "../helm/config"
import { containerRunOutputSchema } from "../../container/config"

// DEPLOY //

export interface KubernetesTypeCommonDeploySpec {
  files: string[]
  kustomize?: KubernetesKustomizeSpec
  manifests: KubernetesResource[]
  namespace?: string
  portForwards?: PortForwardSpec[]
  timeout?: number
}

interface KubernetesDeployActionSpec extends KubernetesTypeCommonDeploySpec {
  defaultTarget?: KubernetesTargetResourceSpec
  devMode?: KubernetesDeployDevModeSpec
}
export type KubernetesDeployActionConfig = DeployActionConfig<"kubernetes", KubernetesDeployActionSpec>
export type KubernetesDeployAction = DeployAction<KubernetesDeployActionConfig>

const kubernetesResourceSchema = () =>
  joi
    .object()
    .keys({
      apiVersion: joi.string().required().description("The API version of the resource."),
      kind: joi.string().required().description("The kind of the resource."),
      metadata: joi
        .object()
        .required()
        .keys({
          name: joi.string().required().description("The name of the resource."),
        })
        .unknown(true),
    })
    .unknown(true)

export const kubernetesCommonDeploySpecKeys = () => ({
  kustomize: kustomizeSpecSchema(),
  manifests: joiSparseArray(kubernetesResourceSchema()).description(
    "List of Kubernetes resource manifests to deploy. If `files` is also specified, this is combined with the manifests read from the files."
  ),
  portForwards: portForwardsSchema(),
})

export const kubernetesDeploySchema = () =>
  joi.object().keys({
    ...kubernetesCommonDeploySpecKeys(),
    defaultTarget: defaultTargetSchema(),
    devMode: kubernetesDeployDevModeSchema(),
  })

// RUN //

interface KubernetesRunOutputs {
  log: string
}

export const kubernetesRunOutputsSchema = () => containerRunOutputSchema()

interface KubernetesRunActionSpec extends KubernetesCommonRunSpec {
  target: KubernetesTargetResourceSpec
}
export type KubernetesRunActionConfig = RunActionConfig<"kubernetes", KubernetesRunActionSpec>
export type KubernetesRunAction = RunAction<KubernetesRunActionConfig, KubernetesRunOutputs>

export const kubernetesRunActionSchema = () =>
  joi.object().keys({
    ...kubernetesCommonRunSchemaKeys(),
    target: targetResourceSpecSchema()
      .required()
      .description("The Kubernetes resource to derive the Pod spec from, for the run."),
    // TODO
    // execInTarget: joi.boolean().description("Run directly inside a running container for the matched `target`.")
  })

// TEST //

interface KubernetesTestOutputs extends KubernetesRunOutputs {}
export const kubernetesTestOutputsSchema = () => kubernetesRunOutputsSchema()

interface KubernetesTestActionSpec extends KubernetesRunActionSpec {}
export type KubernetesTestActionConfig = TestActionConfig<"kubernetes", KubernetesTestActionSpec>
export type KubernetesTestAction = TestAction<KubernetesTestActionConfig, KubernetesTestOutputs>

export const kubernetesTestActionSchema = () => kubernetesRunActionSchema()

// COMMON //

export type KubernetesActionConfig =
  | KubernetesDeployActionConfig
  | KubernetesRunActionConfig
  | KubernetesTestActionConfig
