/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ModuleActionHandlers } from "../../../plugin/plugin"
import { HelmModule, configureHelmModule, HelmService } from "./module-config"
import { getBaseModule } from "./common"
import { ExecBuildConfig } from "../../exec/build"
import { HelmActionConfig, HelmDeployConfig, HelmPodTestConfig } from "./config"
import { getServiceResourceSpec } from "../util"
import { jsonMerge } from "../../../util/util"
import cloneDeep from "fast-copy"
import { omit } from "lodash"
import { DeepPrimitiveMap } from "../../../config/common"
import { convertServiceResource } from "../kubernetes-type/common"
import { ConvertModuleParams } from "../../../plugin/handlers/Module/convert"
import { makeDummyBuild } from "../../../resolve-module"
import { convertKubernetesModuleDevModeSpec } from "../sync"

export const helmModuleHandlers: Partial<ModuleActionHandlers<HelmModule>> = {
  configure: configureHelmModule,

  convert: async (params: ConvertModuleParams<HelmModule>) => {
    const {
      module,
      services,
      baseFields,
      tasks,
      tests,
      dummyBuild,
      convertBuildDependency,
      prepareRuntimeDependencies,
    } = params
    const actions: (ExecBuildConfig | HelmActionConfig)[] = []

    if (dummyBuild) {
      actions.push(dummyBuild)
    } else {
      // We make a dummy build without a `copyFrom` or any build dependencies. This is to ensure there's a build action
      // for this module if it's used as a base by another Helm module.
      actions.push(makeDummyBuild({ module, copyFrom: undefined, dependencies: undefined }))
    }

    // There's one service on helm modules expect when skipDeploy = true
    const service: (typeof services)[0] | undefined = services[0]

    // The helm Deploy type does not support the `base` field. We handle the field here during conversion,
    // for compatibility.
    // Note: A dummyBuild will be set if `base` is set on the Module, because the module configure handler then
    //       sets a `build.dependencies[].copy` directive.

    let deployAction: HelmDeployConfig | null = null
    let deployDep: string | null = null

    // If this Helm module has `skipDeploy = true`, there won't be a service config for us to convert here.
    if (service) {
      deployAction = prepareDeployAction({
        module,
        service,
        baseFields,
        dummyBuild,
        convertBuildDependency,
        prepareRuntimeDependencies,
      })
      deployDep = `deploy.${deployAction.name}`
      actions.push(deployAction)
    }

    const { namespace, values, valueFiles } = module.spec
    const releaseName = module.spec.releaseName || module.name
    const chart = {
      name: module.spec.chart,
      path: module.spec.chart ? undefined : module.spec.chartPath,
      repo: module.spec.repo,
      version: module.spec.version,
    }

    for (const task of tasks) {
      const resource = convertServiceResource(module, task.spec.resource)

      if (!resource) {
        continue
      }

      actions.push({
        kind: "Run",
        type: "helm-pod",
        name: task.name,
        description: task.spec.description,
        ...params.baseFields,
        disabled: task.disabled,
        build: dummyBuild?.name,
        dependencies: prepareRuntimeDependencies(task.config.dependencies, dummyBuild),
        timeout: task.spec.timeout,
        spec: {
          ...omit(task.spec, ["name", "description", "dependencies", "disabled", "timeout"]),
          resource,
          namespace,
          releaseName,
          values,
          valueFiles,
          chart,
        },
      })
    }

    for (const test of tests) {
      const testName = module.name + "-" + test.name
      const resource = convertServiceResource(module, test.spec.resource)

      if (!resource) {
        continue
      }

      const testAction: HelmPodTestConfig = {
        kind: "Test",
        type: "helm-pod",
        name: testName,
        ...params.baseFields,
        disabled: test.disabled,
        build: dummyBuild?.name,
        dependencies: prepareRuntimeDependencies(test.config.dependencies, dummyBuild),
        timeout: test.spec.timeout,
        spec: {
          ...omit(test.spec, ["name", "dependencies", "disabled", "timeout"]),
          resource,
          namespace,
          releaseName,
          values,
          valueFiles,
          chart,
        },
      }

      actions.push(testAction)
    }

    return {
      group: {
        kind: "Group",
        name: module.name,
        path: module.path,
        actions,
      },
    }
  },

  getModuleOutputs: async ({ moduleConfig }) => {
    return {
      outputs: {
        "release-name": moduleConfig.spec.releaseName || moduleConfig.name,
      },
    }
  },
}

function prepareDeployAction({
  module,
  service,
  baseFields,
  dummyBuild,
  convertBuildDependency,
  prepareRuntimeDependencies,
}: {
  module: HelmModule
  service: HelmService
  baseFields: ConvertModuleParams<HelmModule>["baseFields"]
  dummyBuild: ConvertModuleParams<HelmModule>["dummyBuild"]
  convertBuildDependency: ConvertModuleParams<HelmModule>["convertBuildDependency"]
  prepareRuntimeDependencies: ConvertModuleParams<HelmModule>["prepareRuntimeDependencies"]
}) {
  const baseModule = getBaseModule(module)
  const serviceResource = getServiceResourceSpec(module, baseModule)
  const deployAction: HelmDeployConfig = {
    kind: "Deploy",
    type: "helm",
    name: service.name,
    ...baseFields,

    disabled: module.spec.skipDeploy,
    build: dummyBuild?.name,
    dependencies: prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),
    timeout: module.spec.timeout,

    spec: {
      atomic: module.spec.atomicInstall,
      portForwards: module.spec.portForwards,
      namespace: module.spec.namespace,
      releaseName: module.spec.releaseName || module.name,
      values: module.spec.values,
      valueFiles: module.spec.valueFiles,

      chart: {
        name: module.spec.chart,
        path: module.spec.chart ? undefined : module.spec.chartPath,
        repo: module.spec.repo,
        version: module.spec.version,
      },

      sync: convertKubernetesModuleDevModeSpec(module, service, serviceResource),
    },
  }

  if (baseModule) {
    deployAction.spec.values = <DeepPrimitiveMap>jsonMerge(cloneDeep(baseModule.spec.values), deployAction.spec.values)
    deployAction.spec.chart!.path = baseModule.spec.chartPath
  }

  const containerModules = module.build.dependencies.map(convertBuildDependency) || []
  if (serviceResource?.containerModule) {
    const containerModuleSpecDep = convertBuildDependency(serviceResource.containerModule)
    if (!containerModules.find((m) => m.name === containerModuleSpecDep.name)) {
      containerModules.push(containerModuleSpecDep)
    }
  }

  deployAction.dependencies?.push(...containerModules)
  deployAction.spec.defaultTarget = convertServiceResource(module, serviceResource) || undefined

  return deployAction
}
