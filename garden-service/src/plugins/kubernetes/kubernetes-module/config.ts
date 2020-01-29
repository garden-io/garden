/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dependenciesSchema } from "../../../config/service"
import { joiArray, joi, joiModuleIncludeDirective } from "../../../config/common"
import { Module } from "../../../types/module"
import { ConfigureModuleParams, ConfigureModuleResult } from "../../../types/plugin/module/configure"
import { Service } from "../../../types/service"
import { ContainerModule } from "../../container/config"
import { baseBuildSpecSchema } from "../../../config/module"
import { KubernetesResource } from "../types"
import { deline, dedent } from "../../../util/string"
import {
  serviceResourceSchema,
  kubernetesTaskSchema,
  kubernetesTestSchema,
  ServiceResourceSpec,
  KubernetesTestSpec,
  KubernetesTaskSpec,
  namespaceSchema,
} from "../config"

// A Kubernetes Module always maps to a single Service
export type KubernetesModuleSpec = KubernetesServiceSpec

export interface KubernetesModule extends Module<KubernetesModuleSpec, KubernetesServiceSpec> {}
export type KubernetesModuleConfig = KubernetesModule["_ConfigType"]

export interface KubernetesServiceSpec {
  dependencies: string[]
  files: string[]
  namespace?: string
  manifests: KubernetesResource[]
  serviceResource?: ServiceResourceSpec
  tasks: KubernetesTaskSpec[]
  tests: KubernetesTestSpec[]
}

export type KubernetesService = Service<KubernetesModule, ContainerModule>

const kubernetesResourceSchema = joi
  .object()
  .keys({
    apiVersion: joi
      .string()
      .required()
      .description("The API version of the resource."),
    kind: joi
      .string()
      .required()
      .description("The kind of the resource."),
    metadata: joi
      .object()
      .required()
      .keys({
        name: joi
          .string()
          .required()
          .description("The name of the resource."),
      })
      .unknown(true),
  })
  .unknown(true)

export const kubernetesModuleSpecSchema = joi.object().keys({
  build: baseBuildSpecSchema,
  dependencies: dependenciesSchema,
  manifests: joiArray(kubernetesResourceSchema).description(
    deline`
          List of Kubernetes resource manifests to deploy. Use this instead of the \`files\` field if you need to
          resolve template strings in any of the manifests.`
  ),
  files: joiArray(joi.posixPath().subPathOnly()).description(
    "POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests."
  ),
  include: joiModuleIncludeDirective(dedent`
    If neither \`include\` nor \`exclude\` is set, Garden automatically sets \`include\` to equal the
    \`files\` directive so that only the Kubernetes manifests get included.
  `),
  namespace: namespaceSchema,
  serviceResource: serviceResourceSchema.description(
    deline`The Deployment, DaemonSet or StatefulSet that Garden should regard as the _Garden service_ in this module
      (not to be confused with Kubernetes Service resources).
      Because a \`kubernetes\` can contain any number of Kubernetes resources, this needs to be specified for certain
      Garden features and commands to work.`
  ),
  tasks: joiArray(kubernetesTaskSchema),
  tests: joiArray(kubernetesTestSchema),
})

export async function configureKubernetesModule({
  moduleConfig,
}: ConfigureModuleParams<KubernetesModule>): Promise<ConfigureModuleResult<KubernetesModule>> {
  moduleConfig.serviceConfigs = [
    {
      name: moduleConfig.name,
      dependencies: moduleConfig.spec.dependencies,
      disabled: moduleConfig.disabled,
      hotReloadable: false,
      spec: moduleConfig.spec,
    },
  ]

  // Unless include is explicitly specified, we should just have it equal the `files` field
  if (!(moduleConfig.include || moduleConfig.exclude)) {
    moduleConfig.include = moduleConfig.spec.files
  }

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((t) => ({
    name: t.name,
    dependencies: t.dependencies,
    disabled: t.disabled,
    spec: t,
    timeout: t.timeout,
  }))

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((t) => ({
    name: t.name,
    dependencies: t.dependencies,
    disabled: t.disabled,
    spec: t,
    timeout: t.timeout,
  }))

  return { moduleConfig }
}
