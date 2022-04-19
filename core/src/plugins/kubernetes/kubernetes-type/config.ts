/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiIdentifier, joi, joiSparseArray } from "../../../config/common"
import { dedent } from "../../../util/string"
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
  KubernetesDeployDevModeSpec,
  KubernetesDeployHotReloadSpec,
  kubernetesDevModeDefaultsSchema,
} from "../dev-mode"
import { KubernetesKustomizeSpec, kustomizeSpecSchema } from "./kustomize"
import { KubernetesResource } from "../types"
import { DeployAction, DeployActionConfig } from "../../../actions/deploy"
import { RunAction, RunActionConfig } from "../../../actions/run"
import { TestAction, TestActionConfig } from "../../../actions/test"
import { templateStringLiteral } from "../../../docs/common"
import { hotReloadArgsSchema, hotReloadCommandSchema, hotReloadConfigSchema } from "../../container/config"

// DEPLOY //

const exampleActionRef = templateStringLiteral("build.my-container-image.sourcePath")

const devModeSyncSchema = () =>
  kubernetesDevModeDefaultsSchema()
    .keys({
      sourcePath: joi
        .string()
        .uri()
        .default(".")
        .description(
          dedent`
          The local path to sync from, either absolute or relative to the source directory where the Deploy action is defined.

          This should generally be a templated path to another action's source path (e.g. ${exampleActionRef}), or a relative path. If a path is hard-coded, you must make sure the path exists, and that it is reliably the correct path for every user.
          `
        ),
      target: targetResourceSpecSchema()
        .required()
        .description(
          dedent`
          The remote Kubernetes resource to sync to.

          One of (and only one of) \`deployment\`, \`daemonSet\`, \`statefulSet\` or \`podSelector\` must be specified. Should be one of the resources deployed by this action.

          Set \`containerName\` to specify a container to sync to in the matching Pod. By default the first container in the Pod is used.

          Note that if you specify \`podSelector\` here, it is not validated to be a selector matching one of the resources deployed by the action.
          `
        ),
    })
    .description(
      dedent`
      Define a sync to start after the initial Deploy is complete.
      `
    )

export interface KubernetesTypeCommonDeploySpec {
  files: string[]
  kustomize?: KubernetesKustomizeSpec
  manifests: KubernetesResource[]
  namespace?: string
  portForwards?: PortForwardSpec[]
  timeout?: number
}

interface KubernetesDeployActionSpec extends KubernetesTypeCommonDeploySpec {
  devMode?: KubernetesDeployDevModeSpec
  // DEPRECATED, remove in 0.13
  hotReload?: KubernetesDeployHotReloadSpec
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
  namespace: namespaceNameSchema(),
  portForwards: portForwardsSchema(),
})

export const kubernetesDeploySchema = () =>
  joi.object().keys({
    ...kubernetesCommonDeploySpecKeys(),

    devMode: joi
      .object()
      .keys({
        defaults: kubernetesDevModeDefaultsSchema().description(
          "Defaults to set across every sync for this Deploy. If you use the `exclude` field here, it will be merged with any excludes set in individual syncs."
        ),
        syncs: joi
          .array()
          .items(devModeSyncSchema())
          .description("A list of syncs to start once the Deploy is successfully started."),
      })
      .description(
        dedent`
        Configure dev mode syncs for the resources in this Deploy.

        If you have multiple syncs for the Deploy, you can use the \`defaults\` field to set common configuration for every individual sync.
        `
      ),

    hotReload: hotReloadConfigSchema()
      .keys({
        build: joiIdentifier().required().description("The Build to sync files from, to the target."),
        command: hotReloadCommandSchema(),
        args: hotReloadArgsSchema(),
      })
      .description(
        dedent`
          **DEPRECATED: Please use devMode.sync instead.**

          Configure this action for hot reloading.
        `
      )
      .meta({ deprecated: true }),
  })

// RUN //

interface KubernetesRunActionSpec extends KubernetesCommonRunSpec {
  target: KubernetesTargetResourceSpec
}
export type KubernetesRunActionConfig = RunActionConfig<"kubernetes", KubernetesRunActionSpec>
export type KubernetesRunAction = RunAction<KubernetesRunActionConfig>

export const kubernetesRunActionSchema = () =>
  joi.object().keys({
    ...kubernetesCommonRunSchemaKeys(),
    target: targetResourceSpecSchema().description("The Kubernetes resource to derive the Pod spec from, for the run."),
    // TODO
    // execInTarget: joi.boolean().description("Run directly inside a running container for the matched `target`.")
  })

// TEST //

interface KubernetesTestActionSpec extends KubernetesRunActionSpec {}
export type KubernetesTestActionConfig = TestActionConfig<"kubernetes", KubernetesTestActionSpec>
export type KubernetesTestAction = TestAction<KubernetesTestActionConfig>

export const kubernetesTestActionSchema = () => kubernetesRunActionSchema()

// COMMON //

export type KubernetesActionConfig =
  | KubernetesDeployActionConfig
  | KubernetesRunActionConfig
  | KubernetesTestActionConfig
