/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import fsExtra from "fs-extra"
const { ensureFile } = fsExtra
import { omit } from "lodash-es"
import { join } from "path"
import type { BaseRuntimeActionConfig } from "../../../../src/actions/base.js"
import type { BuildActionConfig } from "../../../../src/actions/build.js"
import { joi } from "../../../../src/config/common.js"
import { validateSchema } from "../../../../src/config/validation.js"
import { createActionLog } from "../../../../src/logger/log-entry.js"
import { getModuleHandlerDescriptions } from "../../../../src/plugin/module-types.js"
import type { PartialGardenPluginSpec } from "../../../../src/plugin/plugin.js"
import { ACTION_RUNTIME_LOCAL, createGardenPlugin } from "../../../../src/plugin/plugin.js"
import type { ProviderHandlers } from "../../../../src/plugin/providers.js"
import { getProviderActionDescriptions } from "../../../../src/plugin/providers.js"
import { createProjectConfig, makeTestGarden, projectRootA } from "../../../helpers.js"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_DEPLOY_TIMEOUT_SEC,
  DEFAULT_RUN_TIMEOUT_SEC,
  DEFAULT_TEST_TIMEOUT_SEC,
} from "../../../../src/constants.js"

export async function getRouterTestData() {
  const { basePlugin, dateUsedForCompleted, returnWrongOutputsCfgKey, testPluginA, testPluginB } =
    getRouterUnitTestPlugins()
  const garden = await makeTestGarden(projectRootA, {
    plugins: [basePlugin, testPluginA, testPluginB],
    config: createProjectConfig({
      path: projectRootA,
      providers: [{ name: "base" }, { name: "test-plugin-a" }, { name: "test-plugin-b" }],
    }),
    onlySpecifiedPlugins: true,
  })
  const log = createActionLog({ log: garden.log, actionName: "", actionKind: "" })
  const actionRouter = await garden.getActionRouter()
  const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  const module = graph.getModule("module-a")
  const buildAction = graph.getBuild("module-a")
  const resolvedBuildAction = await garden.resolveAction({
    action: buildAction,
    log: garden.log,
    graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
  })
  const deployAction = graph.getDeploy("service-a")
  const resolvedDeployAction = await garden.resolveAction({
    action: deployAction,
    log: garden.log,
    graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
  })
  const runAction = graph.getRun("task-a")
  const resolvedRunAction = await garden.resolveAction({
    action: runAction,
    log: garden.log,
    graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
  })
  return {
    resolvedBuildAction,
    resolvedDeployAction,
    resolvedRunAction,
    garden,
    log,
    graph,
    actionRouter,
    module,
    dateUsedForCompleted,
    returnWrongOutputsCfgKey,
    plugins: {
      basePlugin,
      testPluginA,
      testPluginB,
    },
  }
}

function getRouterUnitTestPlugins() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getTestPluginOutputs(params: any) {
    return { base: "ok", foo: params.action._config[returnWrongOutputsCfgKey] ? 123 : "ok" }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function validateParams(params: any, schema: Joi.ObjectSchema) {
    validateSchema(
      params,
      schema.keys({
        graph: joi.object(),
      })
    )
  }

  const now = new Date()
  const returnWrongOutputsCfgKey = "returnWrong"

  const baseOutputsSchema = () => joi.object().keys({ base: joi.string() })
  const testOutputSchema = () => baseOutputsSchema().keys({ foo: joi.string() })

  const staticOutputsSchema = joi.object().keys({
    staticKey: joi.string(),
  })

  const runtimeOutputsSchema = joi.object().keys({
    runtimeKey: joi.string(),
    base: joi.string(),
    foo: joi.string(),
    plugin: joi.any().optional(),
    resolvedEnvName: joi.any().optional(),
    resolvedActionVersion: joi.any().optional(),
    isTestPluginABuildActionBuildHandlerReturn: joi.any().optional(),
  })

  const basePlugin = createGardenPlugin({
    name: "base",
    createModuleTypes: [
      {
        name: "base",
        docs: "bla bla bla",
        moduleOutputsSchema: baseOutputsSchema(),
        needsBuild: true,
        handlers: {},
      },
    ],
    createActionTypes: {
      Build: [
        {
          name: "base-action-type",
          docs: "asd",
          handlers: {
            getStatus: async (_) => ({
              state: "ready",
              detail: { runtime: ACTION_RUNTIME_LOCAL },
              outputs: { foo: "bar", plugin: "base" },
            }),
          },
          schema: joi.object(),
        },
      ],
    },
  })

  const pluginActionDescriptions = getProviderActionDescriptions()
  const moduleActionDescriptions = getModuleHandlerDescriptions()

  const testPluginASpec: PartialGardenPluginSpec = {
    name: "test-plugin-a",
    dependencies: [{ name: "base" }],

    handlers: <ProviderHandlers>{
      configureProvider: async (params) => {
        validateParams(params, pluginActionDescriptions.configureProvider.paramsSchema)
        return { config: params.config }
      },

      getEnvironmentStatus: async (params) => {
        validateParams(params, pluginActionDescriptions.getEnvironmentStatus.paramsSchema)
        return {
          ready: false,
          outputs: {},
        }
      },

      augmentGraph: async (params) => {
        validateParams(params, pluginActionDescriptions.augmentGraph.paramsSchema)

        const actionName = "added-by-" + params.ctx.provider.name

        return {
          addDependencies: [
            {
              by: {
                kind: "Deploy",
                name: actionName,
              },
              on: {
                kind: "Build",
                name: actionName,
              },
            },
          ],
          addActions: [
            {
              kind: "Build",
              name: actionName,
              type: "test",
              timeout: DEFAULT_BUILD_TIMEOUT_SEC,
              internal: {
                basePath: params.ctx.projectRoot,
              },
              spec: {},
            },
            {
              kind: "Deploy",
              name: actionName,
              type: "test",
              timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
              internal: {
                basePath: params.ctx.projectRoot,
              },
              spec: {},
            },
          ],
        }
      },

      getDashboardPage: async (params) => {
        validateParams(params, pluginActionDescriptions.getDashboardPage.paramsSchema)
        return { url: "http://" + params.page.name }
      },

      getDebugInfo: async (params) => {
        validateParams(params, pluginActionDescriptions.getDebugInfo.paramsSchema)
        return { info: {} }
      },

      prepareEnvironment: async (params) => {
        validateParams(params, pluginActionDescriptions.prepareEnvironment.paramsSchema)
        return { status: { ready: true, outputs: {} } }
      },

      cleanupEnvironment: async (params) => {
        validateParams(params, pluginActionDescriptions.cleanupEnvironment.paramsSchema)
        return {}
      },
    },

    createModuleTypes: [
      {
        name: "test",
        base: "base",
        docs: "bla bla bla",
        moduleOutputsSchema: testOutputSchema(),
        schema: joi.object(),
        needsBuild: true,
        title: "Bla",

        handlers: {
          configure: async (params) => {
            validateParams(params, moduleActionDescriptions.configure.paramsSchema)

            const serviceConfigs = params.moduleConfig.spec.services.map((spec) => ({
              name: spec.name,
              dependencies: spec.dependencies || [],
              disabled: false,
              timeout: spec.timeout || DEFAULT_DEPLOY_TIMEOUT_SEC,
              spec,
            }))

            const taskConfigs = (params.moduleConfig.spec.tasks || []).map((spec) => ({
              name: spec.name,
              dependencies: spec.dependencies || [],
              disabled: false,
              timeout: spec.timeout || DEFAULT_RUN_TIMEOUT_SEC,
              spec,
            }))

            const testConfigs = (params.moduleConfig.spec.tests || []).map((spec) => ({
              name: spec.name,
              dependencies: spec.dependencies || [],
              disabled: false,
              timeout: spec.timeout || DEFAULT_TEST_TIMEOUT_SEC,
              spec,
            }))

            return {
              moduleConfig: {
                ...params.moduleConfig,
                serviceConfigs,
                taskConfigs,
                testConfigs,
              },
            }
          },

          convert: async (params) => {
            validateParams(params, moduleActionDescriptions.convert.paramsSchema)

            const { module, services, tasks, tests, dummyBuild, convertBuildDependency, convertRuntimeDependencies } =
              params

            const actions: (BuildActionConfig | BaseRuntimeActionConfig)[] = []

            const buildAction: BuildActionConfig = {
              kind: "Build",
              type: "test",
              name: module.name,

              ...params.baseFields,
              ...dummyBuild,

              dependencies: module.build.dependencies.map(convertBuildDependency),

              timeout: module.build.timeout,
              spec: {
                command: module.spec.build?.command,
                env: module.spec.env,
              },
            }

            actions.push(buildAction)

            for (const service of services) {
              actions.push({
                kind: "Deploy",
                type: "test",
                name: service.name,
                ...params.baseFields,

                disabled: service.disabled,
                build: buildAction ? buildAction.name : undefined,
                dependencies: convertRuntimeDependencies(service.spec.dependencies),

                timeout: service.spec.timeout,
                spec: {
                  ...omit(service.spec, ["name", "dependencies", "disabled"]),
                },
              })
            }

            for (const task of tasks) {
              actions.push({
                kind: "Run",
                type: "test",
                name: task.name,
                ...params.baseFields,

                disabled: task.disabled,
                build: buildAction ? buildAction.name : undefined,
                dependencies: convertRuntimeDependencies(task.spec.dependencies),

                timeout: task.spec.timeout,
                spec: {
                  ...omit(task.spec, ["name", "dependencies", "disabled"]),
                },
              })
            }

            for (const test of tests) {
              actions.push({
                kind: "Test",
                type: "test",
                name: module.name + "-" + test.name,
                ...params.baseFields,

                disabled: test.disabled,
                build: buildAction ? buildAction.name : undefined,
                dependencies: convertRuntimeDependencies(test.spec.dependencies),

                timeout: test.spec.timeout,
                spec: {
                  ...omit(test.spec, ["name", "dependencies", "disabled"]),
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
          },

          getModuleOutputs: async (params) => {
            validateParams(params, moduleActionDescriptions.getModuleOutputs.paramsSchema)
            return { outputs: { foo: "bar" } }
          },
        },
      },
    ],
    createActionTypes: {
      Build: [
        {
          name: "test",
          docs: "Test Build action",
          schema: joi.object(),
          staticOutputsSchema,
          runtimeOutputsSchema,
          base: "base-action-type",
          handlers: {
            getStatus: async (_params) => {
              // This is hacked for the base router tests
              return {
                state: "ready",
                detail: {
                  runtime: ACTION_RUNTIME_LOCAL,
                },
                outputs: {
                  foo: "bar",
                  plugin: "test-plugin-a",
                  resolvedEnvName: _params.ctx.legacyResolveTemplateString("${environment.name}"),
                  resolvedActionVersion: "TODO-G2 (see one line below)",
                  // resolvedActionVersion: _params.ctx.legacyResolveTemplateString("${runtime.build.module-a.version}"),
                },
              }
            },

            build: async (_params) => {
              return {
                state: "ready",
                detail: {
                  runtime: ACTION_RUNTIME_LOCAL,
                },
                // This is hacked for the base router tests
                outputs: { foo: "bar", isTestPluginABuildActionBuildHandlerReturn: true },
              }
            },

            publish: async (_params) => {
              return { state: "ready", detail: null, outputs: {} }
            },
          },
        },
      ],
      Deploy: [
        {
          name: "test",
          docs: "Test Deploy action",
          schema: joi.object(),
          staticOutputsSchema,
          runtimeOutputsSchema,
          handlers: {
            getStatus: async (params) => {
              return {
                state: "ready",
                detail: { state: "ready", detail: {} },
                outputs: getTestPluginOutputs(params),
              }
            },

            deploy: async (params) => {
              // validateParams(params, moduleActionDescriptions.deployService.paramsSchema)
              return {
                state: "ready",
                detail: { state: "ready", detail: {} },
                outputs: getTestPluginOutputs(params),
              }
            },

            delete: async (_params) => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },

            exec: async (_params) => {
              return {
                code: 0,
                output: "bla bla",
              }
            },

            getLogs: async (_params) => {
              return {}
            },

            getPortForward: async (params) => {
              validateParams(params, moduleActionDescriptions.getPortForward.paramsSchema)
              return {
                hostname: "bla",
                port: 123,
              }
            },

            stopPortForward: async (params) => {
              validateParams(params, moduleActionDescriptions.stopPortForward.paramsSchema)
              return {}
            },
          },
        },
      ],
      Run: [
        {
          name: "test",
          docs: "Test Run action",
          schema: joi.object(),
          staticOutputsSchema,
          runtimeOutputsSchema,
          handlers: {
            getResult: async (params) => {
              return {
                state: "ready",
                detail: {
                  moduleName: params.action.name,
                  taskName: params.action.name,
                  command: ["foo"],
                  completedAt: now,
                  log: "bla bla",
                  success: true,
                  startedAt: now,
                  version: params.action.versionString(),
                },
                outputs: getTestPluginOutputs(params),
              }
            },

            run: async (params) => {
              // Create artifacts, to test artifact copying
              for (const artifact of params.action.getSpec().artifacts || []) {
                await ensureFile(join(params.artifactsPath, artifact.source))
              }

              return {
                state: "ready",
                detail: {
                  moduleName: params.action.name,
                  taskName: params.action.name,
                  command: ["foo"],
                  completedAt: now,
                  log: "bla bla",
                  success: true,
                  startedAt: now,
                  version: params.action.versionString(),
                },
                outputs: getTestPluginOutputs(params),
              }
            },
          },
        },
      ],
      Test: [
        {
          name: "test",
          docs: "Test Test action",
          schema: joi.object(),
          handlers: {
            run: async (params) => {
              // Create artifacts, to test artifact copying
              for (const artifact of params.action.getSpec().artifacts || []) {
                await ensureFile(join(params.artifactsPath, artifact.source))
              }

              return {
                state: "ready",
                detail: {
                  moduleName: params.action.name,
                  command: [],
                  completedAt: now,
                  log: "bla bla",
                  outputs: {
                    log: "bla bla",
                  },
                  success: true,
                  startedAt: now,
                  testName: params.action.name,
                  version: params.action.versionString(),
                },
                outputs: getTestPluginOutputs(params),
              }
            },

            getResult: async (params) => {
              return {
                state: "ready",
                detail: {
                  moduleName: params.action.name,
                  command: [],
                  completedAt: now,
                  log: "bla bla",
                  outputs: {
                    log: "bla bla",
                  },
                  success: true,
                  startedAt: now,
                  testName: params.action.name,
                  version: params.action.versionString(),
                },
                outputs: getTestPluginOutputs(params),
              }
            },
          },
        },
      ],
    },
  }

  const testPluginA = createGardenPlugin(testPluginASpec)

  const testPluginB = createGardenPlugin({
    ...omit(testPluginASpec, ["createModuleTypes", "createActionTypes"]),
    name: "test-plugin-b",
  })

  return {
    basePlugin,
    testPluginA,
    testPluginB,
    returnWrongOutputsCfgKey,
    dateUsedForCompleted: now,
  }
}
