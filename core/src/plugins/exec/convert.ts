/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ActionReference, StringMap } from "../../config/common.js"
import type { ConvertModuleParams } from "../../plugin/handlers/Module/convert.js"
import type { ExecBuildConfig } from "./build.js"
import type { ExecActionConfig } from "./config.js"
import { defaultStatusTimeout } from "./config.js"
import type { ExecModule } from "./moduleConfig.js"

export function prepareExecBuildAction(params: ConvertModuleParams<ExecModule>): ExecBuildConfig | undefined {
  const { module, convertBuildDependency, dummyBuild } = params

  const needsBuild =
    !!dummyBuild ||
    !!module.spec.build?.command ||
    // We create a single Build action if there are no other entities
    // (otherwise nothing is created, which would be unexpected for users).
    module.serviceConfigs.length + module.taskConfigs.length + module.testConfigs.length === 0

  if (needsBuild) {
    return {
      kind: "Build",
      type: "exec",
      name: module.name,

      ...params.baseFields,
      ...dummyBuild,

      dependencies: module.build.dependencies.map(convertBuildDependency),

      timeout: module.build.timeout,
      spec: {
        shell: true, // This keeps the old pre-0.13 behavior
        command: module.spec.build?.command,
        env: module.spec.env,
      },
    }
  }

  return
}

export async function convertExecModule(params: ConvertModuleParams<ExecModule>) {
  const { module, services, tasks, tests, convertBuildDependency, convertRuntimeDependencies } = params

  const actions: ExecActionConfig[] = []

  const buildAction = prepareExecBuildAction(params)
  buildAction && actions.push(buildAction)

  function prepRuntimeDeps(deps: string[]): ActionReference[] {
    if (buildAction) {
      return convertRuntimeDependencies(deps)
    } else {
      // If we don't return a Build action, we must still include any declared build dependencies
      return [...module.build.dependencies.map(convertBuildDependency), ...convertRuntimeDependencies(deps)]
    }
  }

  // Instead of doing this at runtime, we fold together env vars from the module top-level and the individual
  // runtime actions at conversion time.
  function prepareEnv(env: StringMap) {
    return { ...module.spec.env, ...env }
  }

  for (const service of services) {
    let persistent: any = false
    let deployCommand = service.spec.deployCommand
    let statusCommand = service.spec.statusCommand

    if (service.spec.syncMode) {
      // Maintain compatibility with devMode on exec modules
      persistent = "${this.mode == 'sync'}"

      if (service.spec.syncMode.command) {
        deployCommand = <any>{
          $if: persistent,
          $then: service.spec.syncMode.command,
          $else: service.spec.deployCommand,
        }
      }
      if (service.spec.syncMode.statusCommand) {
        statusCommand = <any>{
          $if: persistent,
          $then: service.spec.syncMode.statusCommand,
          $else: service.spec.statusCommand,
        }
      }
    }

    actions.push({
      kind: "Deploy",
      type: "exec",
      name: service.name,
      ...params.baseFields,

      disabled: service.disabled,
      build: buildAction ? buildAction.name : undefined,
      dependencies: prepRuntimeDeps(service.spec.dependencies),
      timeout: service.spec.timeout,

      spec: {
        shell: true, // This keeps the old pre-0.13 behavior
        persistent,
        cleanupCommand: service.spec.cleanupCommand,
        deployCommand,
        statusCommand,
        statusTimeout: service.spec.syncMode?.timeout || defaultStatusTimeout,
        env: prepareEnv(service.spec.env),
      },
    })
  }

  for (const task of tasks) {
    actions.push({
      kind: "Run",
      type: "exec",
      name: task.name,
      description: task.spec.description,
      ...params.baseFields,

      disabled: task.disabled,
      build: buildAction ? buildAction.name : undefined,
      dependencies: prepRuntimeDeps(task.spec.dependencies),
      timeout: task.spec.timeout,

      spec: {
        shell: true, // This keeps the old pre-0.13 behavior
        command: task.spec.command,
        artifacts: task.spec.artifacts,
        env: prepareEnv(task.spec.env),
      },
    })
  }

  for (const test of tests) {
    actions.push({
      kind: "Test",
      type: "exec",
      name: module.name + "-" + test.name,
      ...params.baseFields,

      disabled: test.disabled,
      build: buildAction ? buildAction.name : undefined,
      dependencies: prepRuntimeDeps(test.spec.dependencies),
      timeout: test.spec.timeout,

      spec: {
        shell: true, // This keeps the old pre-0.13 behavior
        command: test.spec.command,
        artifacts: test.spec.artifacts,
        env: prepareEnv(test.spec.env),
      },
    })
  }

  return {
    group: {
      // This is an annoying TypeScript limitation :P
      kind: <const>"Group",
      name: module.name,
      path: module.path,
      actions,
      variables: module.variables,
      varfiles: module.varfile ? [module.varfile] : undefined,
    },
  }
}
