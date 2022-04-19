/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ModuleAndRuntimeActionHandlers } from "../../../plugin/plugin"
import { configureHelmModule, HelmModule } from "./moduleConfig"
import { buildHelmModule } from "./build"
import { getServiceStatus } from "./status"
import { deleteService, deployHelmService } from "./deployment"
import { getTestResult } from "../test-results"
import { runHelmModule, runHelmTask } from "./run"
import { getServiceLogs } from "./logs"
import { testHelmModule } from "./test"
import { getPortForwardHandler } from "../port-forward"
import { getTaskResult } from "../task-results"
import { GetPortForwardParams } from "../../../types/plugin/service/getPortForward"
import { KubernetesPluginContext } from "../config"
import { getActionNamespace } from "../namespace"
import { join } from "path"
import { pathExists } from "fs-extra"
import { SuggestModulesParams, SuggestModulesResult } from "../../../types/plugin/module/suggestModules"
import { getBaseModule, getReleaseName } from "./common"
import { execInHelmService } from "./exec"
import chalk = require("chalk")
import { ExecBuildConfig } from "../../exec/config"
import { KubernetesActionConfig } from "../kubernetes-type/config"
import { HelmActionConfig, HelmDeployConfig } from "./config"
import { KubernetesDeployDevModeSyncSpec } from "../dev-mode"
import { getServiceResourceSpec } from "../util"
import { jsonMerge } from "../../../util/util"
import { cloneDeep } from "lodash"
import { DeepPrimitiveMap } from "../../../config/common"
import { convertServiceResource } from "../kubernetes-type/common"

export const helmModuleHandlers: Partial<ModuleAndRuntimeActionHandlers<HelmModule>> = {
  configure: configureHelmModule,

  convert: async (params) => {
    const { module, services, dummyBuild, convertBuildDependency, prepareRuntimeDependencies } = params
    const actions: (ExecBuildConfig | KubernetesActionConfig | HelmActionConfig)[] = []

    if (dummyBuild) {
      actions.push(dummyBuild)
    }

    const syncs: KubernetesDeployDevModeSyncSpec[] = []
    const service = services[0] // There's always exactly one service on helm modules

    // The helm Deploy type does not support the `base` field. We handle the field here during conversion,
    // for compatibility.
    // Note: A dummyBuild will be set if `base` is set on the Module, because the module configure handler then
    //       sets a `build.dependencies[].copy` directive.
    const baseModule = getBaseModule(module)
    const serviceResource = getServiceResourceSpec(module, baseModule)

    if (module.spec.devMode) {
      const target = convertServiceResource(module, serviceResource)

      if (target) {
        syncs.push({
          sourcePath: service.sourceModule.path,
          target,
        })
      }
    }

    const deployAction: HelmDeployConfig = {
      kind: "Deploy",
      type: "helm",
      name: module.name,
      ...params.baseFields,

      disabled: module.spec.skipDeploy,
      build: dummyBuild?.name,
      dependencies: prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),

      spec: {
        atomicInstall: module.spec.atomicInstall,
        portForwards: module.spec.portForwards,
        namespace: module.spec.namespace,
        releaseName: module.spec.releaseName,
        values: module.spec.values,
        valueFiles: module.spec.valueFiles,

        chart: {
          name: module.spec.chart,
          path: module.spec.chartPath,
          repo: module.spec.repo,
          version: module.spec.version,
        },

        devMode: {
          syncs,
        },
      },
    }

    if (baseModule) {
      deployAction.spec.values = <DeepPrimitiveMap>(
        jsonMerge(cloneDeep(baseModule.spec.values), deployAction.spec.values)
      )
      deployAction.spec.chart!.path = baseModule.spec.chartPath
    }

    if (serviceResource?.containerModule) {
      const build = convertBuildDependency(serviceResource.containerModule)
      // TODO-G2: make this implicit
      deployAction.dependencies?.push(build)
    }

    actions.push(deployAction)

    for (const task of module.testConfigs) {
      const target = convertServiceResource(module, task.spec.resource)

      if (!target) {
        continue
      }

      // We create a kubernetes Run action here, no need for a specific helm Run type.
      actions.push({
        kind: "Run",
        type: "kubernetes",
        name: module.name,
        ...params.baseFields,
        disabled: task.disabled,

        build: dummyBuild?.name,
        dependencies: prepareRuntimeDependencies(task.dependencies, dummyBuild),

        spec: {
          ...task.spec,
          target,
        },
      })
    }

    for (const test of module.testConfigs) {
      const target = convertServiceResource(module, test.spec.resource)

      if (!target) {
        continue
      }

      // We create a kubernetes Test action here, no need for a specific helm Test type.
      actions.push({
        kind: "Test",
        type: "kubernetes",
        name: module.name + "-" + test.name,
        ...params.baseFields,
        disabled: test.disabled,

        build: dummyBuild?.name,
        dependencies: prepareRuntimeDependencies(test.dependencies, dummyBuild),

        spec: {
          ...test.spec,
          target,
        },
      })
    }

    return {
      group: {
        kind: "Group",
        name: module.name,
        actions,
      },
    }
  },

  build: buildHelmModule,
  getModuleOutputs: async ({ moduleConfig }) => {
    return {
      outputs: {
        "release-name": getReleaseName(moduleConfig),
      },
    }
  },
  execInService: execInHelmService,
  deleteService,
  deployService: deployHelmService,
  // Use the same getPortForward handler as container and kubernetes-module, except set the namespace
  getPortForward: async (params: GetPortForwardParams) => {
    const { ctx, log, module } = params
    const k8sCtx = <KubernetesPluginContext>ctx
    const namespace = await getActionNamespace({
      ctx: k8sCtx,
      log,
      module,
      provider: k8sCtx.provider,
      skipCreate: true,
    })
    return getPortForwardHandler({ ...params, namespace })
  },
  getServiceLogs,
  getServiceStatus,
  getTaskResult,
  getTestResult,
  // TODO: add publishModule handler
  runModule: runHelmModule,
  runTask: runHelmTask,
  suggestModules: async ({ name, path }: SuggestModulesParams): Promise<SuggestModulesResult> => {
    const chartPath = join(path, "Chart.yaml")
    if (await pathExists(chartPath)) {
      return {
        suggestions: [
          {
            description: `based on found ${chalk.white("Chart.yaml")}`,
            module: {
              type: "helm",
              name,
              chartPath: ".",
            },
          },
        ],
      }
    } else {
      return { suggestions: [] }
    }
  },
  testModule: testHelmModule,
}
