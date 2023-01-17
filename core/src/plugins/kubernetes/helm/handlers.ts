/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ModuleActionHandlers } from "../../../plugin/plugin"
import { HelmModule, configureHelmModule, HelmService } from "./module-config"
import { ServiceResourceSpec } from "../config"
import { join } from "path"
import { pathExists } from "fs-extra"
import chalk = require("chalk")
import { getBaseModule, helmChartYamlFilename } from "./common"
import { ExecBuildConfig } from "../../exec/config"
import { KubernetesActionConfig } from "../kubernetes-type/config"
import { HelmActionConfig, HelmDeployConfig } from "./config"
import { KubernetesDeployDevModeSpec } from "../dev-mode"
import { getServiceResourceSpec } from "../util"
import { jsonMerge } from "../../../util/util"
import { cloneDeep, omit } from "lodash"
import { DeepPrimitiveMap } from "../../../config/common"
import { convertServiceResource } from "../kubernetes-type/common"
import { ConvertModuleParams } from "../../../plugin/handlers/module/convert"
import { KubernetesModule, KubernetesService } from "../kubernetes-type/module-config"
import { joinWithPosix } from "../../../util/fs"
import { SuggestModulesParams, SuggestModulesResult } from "../../../plugin/handlers/module/suggest"
import { makeDummyBuild } from "../../../resolve-module"

export const helmModuleHandlers: Partial<ModuleActionHandlers<HelmModule>> = {
  configure: configureHelmModule,

  convert: async (params: ConvertModuleParams<HelmModule>) => {
    const { module, services, tasks, tests, dummyBuild, convertBuildDependency, prepareRuntimeDependencies } = params
    const actions: (ExecBuildConfig | KubernetesActionConfig | HelmActionConfig)[] = []

    if (dummyBuild) {
      actions.push(dummyBuild)
    } else {
      // We make a dummy build without a `copyFrom` or any build dependencies. This is to ensure there's a build action
      // for this module if it's used as a base by another Helm module.
      actions.push(makeDummyBuild({ module, copyFrom: undefined, dependencies: undefined }))
    }

    const service = services[0] // There's always exactly one service on helm modules

    // The helm Deploy type does not support the `base` field. We handle the field here during conversion,
    // for compatibility.
    // Note: A dummyBuild will be set if `base` is set on the Module, because the module configure handler then
    //       sets a `build.dependencies[].copy` directive.
    const baseModule = getBaseModule(module)
    const serviceResource = getServiceResourceSpec(module, baseModule)

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
        timeout: module.spec.timeout,
        values: module.spec.values,
        valueFiles: module.spec.valueFiles,

        chart: {
          name: module.spec.chart,
          path: module.spec.chart ? undefined : module.spec.chartPath,
          repo: module.spec.repo,
          version: module.spec.version,
        },

        devMode: convertKubernetesDevModeSpec(module, service, serviceResource),
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

    // Runs and Tests generated from helm modules all have the kubernetes-pod type, and don't use the podSpec field.
    // Therefore, they include a runtime dependency on their parent module's Deploy. This means that the helm Deploy
    // is executed first, and the pod spec for the Test/Run pod runner is read from the cluster.
    //
    // This behavior is different from 0.12, where the pod spec was read from the output of a dry-run deploy using the
    // Helm CLI (and did thus not require the deployment to take place first).
    const deployDep = `deploy.${deployAction.name}`

    for (const task of tasks) {
      const resource = convertServiceResource(module, task.spec.resource)

      if (!resource) {
        continue
      }

      // We create a kubernetes Run action here, no need for a specific helm Run type. We add a dependency on this
      // module's Deploy, since we'll read the pod spec for the Run from the deployed resources.
      actions.push({
        kind: "Run",
        type: "kubernetes-pod",
        name: task.name,
        ...params.baseFields,
        disabled: task.disabled,
        build: dummyBuild?.name,
        dependencies: [deployDep, ...prepareRuntimeDependencies(task.config.dependencies, dummyBuild)],
        timeout: task.spec.timeout || undefined,
        spec: {
          ...omit(task.spec, ["name", "dependencies", "disabled", "timeout"]),
          resource,
        },
      })
    }

    for (const test of tests) {
      const resource = convertServiceResource(module, test.spec.resource)

      if (!resource) {
        continue
      }

      // We create a kubernetes Test action here, no need for a specific helm Test type. We add a dependency on this
      // module's Deploy, since we'll read the pod spec for the Test from the deployed resources.
      const testAction: KubernetesActionConfig = {
        kind: "Test",
        type: "kubernetes-pod",
        name: module.name + "-" + test.name,
        ...params.baseFields,
        disabled: test.disabled,

        build: dummyBuild?.name,
        dependencies: [deployDep, ...prepareRuntimeDependencies(test.config.dependencies, dummyBuild)],
        timeout: test.spec.timeout || undefined,

        spec: {
          ...omit(test.spec, ["name", "dependencies", "disabled", "timeout"]),
          resource,
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

  suggestModules: async ({ name, path }: SuggestModulesParams): Promise<SuggestModulesResult> => {
    const chartPath = join(path, helmChartYamlFilename)
    if (await pathExists(chartPath)) {
      return {
        suggestions: [
          {
            description: `based on found ${chalk.white(helmChartYamlFilename)}`,
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
}

export function convertKubernetesDevModeSpec(
  module: HelmModule | KubernetesModule,
  service: HelmService | KubernetesService,
  serviceResource: ServiceResourceSpec | undefined
) {
  const devMode: KubernetesDeployDevModeSpec = {
    syncs: [],
  }

  // Convert to the new dev mode spec
  if (module.spec.devMode) {
    const target = convertServiceResource(module, serviceResource)

    if (target) {
      for (const sync of module.spec.devMode.sync) {
        devMode.syncs!.push({
          ...omit(sync, ["source"]),
          sourcePath: joinWithPosix(service.sourceModule.path, sync.source),
          containerPath: sync.target,
          target,
        })
      }

      if (module.spec.devMode.command || module.spec.devMode.args) {
        if (target.kind && target.name) {
          devMode.overrides = [
            {
              target: {
                kind: target.kind,
                name: target.name,
                containerName: target.containerName,
              },
              command: module.spec.devMode.command,
              args: module.spec.devMode.args,
            },
          ]
        }
      }
    }
  }

  return devMode
}
