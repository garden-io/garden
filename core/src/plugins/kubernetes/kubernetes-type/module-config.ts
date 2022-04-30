/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dependenciesSchema } from "../../../config/service"
import { joi, joiModuleIncludeDirective, joiSparseArray } from "../../../config/common"
import { GardenModule } from "../../../types/module"
import { ConfigureModuleParams, ConfigureModuleResult } from "../../../plugin/handlers/module/configure"
import { GardenService } from "../../../types/service"
import { baseBuildSpecSchema } from "../../../config/module"
import { dedent } from "../../../util/string"
import {
  containerModuleSchema,
  k8sDeploymentTimeoutSchema,
  kubernetesLocalModeSchema,
  KubernetesLocalModeSpec,
  kubernetesTaskSchema,
  KubernetesTaskSpec,
  kubernetesTestSchema,
  KubernetesTestSpec,
  serviceResourceDescription,
  serviceResourceSchema,
  ServiceResourceSpec,
} from "../config"
import { ContainerModule } from "../../container/moduleConfig"
import { kubernetesModuleDevModeSchema, KubernetesModuleDevModeSpec } from "../dev-mode"
import { KubernetesTypeCommonDeploySpec, kubernetesCommonDeploySpecKeys } from "./config"

// A Kubernetes Module always maps to a single Service
export type KubernetesModuleSpec = KubernetesServiceSpec

export interface KubernetesModule
  extends GardenModule<KubernetesModuleSpec, KubernetesServiceSpec, KubernetesTestSpec, KubernetesTaskSpec> {}

export type KubernetesModuleConfig = KubernetesModule["_config"]

export interface KubernetesServiceSpec extends KubernetesTypeCommonDeploySpec {
  dependencies: string[]
  devMode?: KubernetesModuleDevModeSpec
  localMode?: KubernetesLocalModeSpec
  serviceResource?: ServiceResourceSpec
  tasks: KubernetesTaskSpec[]
  tests: KubernetesTestSpec[]
}

export type KubernetesService = GardenService<KubernetesModule, ContainerModule>

export const kubernetesModuleSpecSchema = () =>
  joi.object().keys({
    ...kubernetesCommonDeploySpecKeys(),
    build: baseBuildSpecSchema(),
    dependencies: dependenciesSchema(),
    devMode: kubernetesModuleDevModeSchema(),
    localMode: kubernetesLocalModeSchema(),
    files: joiSparseArray(joi.posixPath().subPathOnly()).description(
      "POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any Garden template strings, which will be resolved before applying the manifests."
    ),
    include: joiModuleIncludeDirective(dedent`
      If neither \`include\` nor \`exclude\` is set, Garden automatically sets \`include\` to equal the
      \`files\` directive so that only the Kubernetes manifests get included.
    `),
    serviceResource: serviceResourceSchema()
      .description(
        dedent`
        The Deployment, DaemonSet or StatefulSet or Pod that Garden should regard as the _Garden service_ in this module (not to be confused with Kubernetes Service resources).

        ${serviceResourceDescription}

        Because a \`kubernetes\` module can contain any number of Kubernetes resources, this needs to be specified for certain Garden features and commands to work.
        `
      )
      .keys({
        containerModule: containerModuleSchema(),
        // TODO: remove in 0.14 (not used, kept for compatibility)
        hotReloadArgs: joi.any().meta({ internal: true }),
      }),
    tasks: joiSparseArray(kubernetesTaskSchema()),
    tests: joiSparseArray(kubernetesTestSchema()),
    timeout: k8sDeploymentTimeoutSchema(),
  })

export async function configureKubernetesModule({
  moduleConfig,
}: ConfigureModuleParams<KubernetesModule>): Promise<ConfigureModuleResult<KubernetesModule>> {
  const { serviceResource, kustomize } = moduleConfig.spec
  const sourceModuleName = serviceResource ? serviceResource.containerModule : undefined

  // TODO-G2: validate serviceResource.containerModule to be a build dependency

  moduleConfig.serviceConfigs = [
    {
      name: moduleConfig.name,
      dependencies: moduleConfig.spec.dependencies,
      disabled: moduleConfig.disabled,
      sourceModuleName,
      spec: moduleConfig.spec,
    },
  ]

  // Unless include is explicitly specified and we're not using kustomize, we just have it equal the `files` field.
  // If we are using kustomize, it's not really feasible to extract an include list, so we need the user to do it.
  if (!(moduleConfig.include || moduleConfig.exclude) && !kustomize) {
    moduleConfig.include = [...(moduleConfig.spec.files || [])]
  }

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((t) => ({
    name: t.name,
    cacheResult: t.cacheResult,
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
