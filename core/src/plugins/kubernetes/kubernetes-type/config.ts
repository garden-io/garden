/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi, joiSparseArray } from "../../../config/common"
import {
  portForwardsSchema,
  PortForwardSpec,
  KubernetesTargetResourceSpec,
  k8sDeploymentTimeoutSchema,
  namespaceNameSchema,
} from "../config"
import { kubernetesDeployDevModeSchema, KubernetesDeployDevModeSpec } from "../dev-mode"
import { KubernetesKustomizeSpec, kustomizeSpecSchema } from "./kustomize"
import type { KubernetesResource } from "../types"
import type { DeployAction, DeployActionConfig } from "../../../actions/deploy"
import { defaultTargetSchema } from "../helm/config"
import type { KubernetesRunActionConfig } from "./run"
import type { KubernetesTestActionConfig } from "./test"
import { kubernetesLocalModeSchema, KubernetesLocalModeSpec } from "../local-mode"

export interface KubernetesTypeCommonDeploySpec {
  files: string[]
  kustomize?: KubernetesKustomizeSpec
  manifests: KubernetesResource[]
  namespace?: string
  portForwards?: PortForwardSpec[]
  timeout?: number
}

export interface KubernetesDeployActionSpec extends KubernetesTypeCommonDeploySpec {
  defaultTarget?: KubernetesTargetResourceSpec
  devMode?: KubernetesDeployDevModeSpec
  localMode?: KubernetesLocalModeSpec
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
  files: joiSparseArray(joi.posixPath().subPathOnly()).description(
    "POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any Garden template strings, which will be resolved before applying the manifests."
  ),
  kustomize: kustomizeSpecSchema(),
  manifests: joiSparseArray(kubernetesResourceSchema()).description(
    "List of Kubernetes resource manifests to deploy. If `files` is also specified, this is combined with the manifests read from the files."
  ),
  namespace: namespaceNameSchema(),
  portForwards: portForwardsSchema(),
  timeout: k8sDeploymentTimeoutSchema(),
})

export const kubernetesDeploySchema = () =>
  joi.object().keys({
    ...kubernetesCommonDeploySpecKeys(),
    defaultTarget: defaultTargetSchema(),
    devMode: kubernetesDeployDevModeSchema(),
    localMode: kubernetesLocalModeSchema(),
  })

export type KubernetesActionConfig =
  | KubernetesDeployActionConfig
  | KubernetesRunActionConfig
  | KubernetesTestActionConfig
