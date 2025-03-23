/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cloneDeep from "fast-copy"
import { get, isString, merge } from "lodash-es"

import { convertExecModule } from "../../src/plugins/exec/convert.js"
import { createSchema, joi, joiArray } from "../../src/config/common.js"
import type { GardenPluginReference, PartialGardenPluginSpec } from "../../src/plugin/plugin.js"
import { createGardenPlugin } from "../../src/plugin/plugin.js"
import type { ConfigureModuleParams } from "../../src/plugin/handlers/Module/configure.js"
import type { ExecModule } from "../../src/plugins/exec/moduleConfig.js"
import { execModuleBuildSpecSchema, execTaskSpecSchema, execTestSchema } from "../../src/plugins/exec/moduleConfig.js"
import type { RunActionHandler, TestActionHandler } from "../../src/plugin/action-types.js"
import type { GetRunResult } from "../../src/plugin/handlers/Run/get-result.js"
import type { ConvertModuleParams } from "../../src/plugin/handlers/Module/convert.js"
import { baseServiceSpecSchema } from "../../src/config/service.js"
import type { ExecTest } from "../../src/plugins/exec/test.js"
import { execTestSpecSchema } from "../../src/plugins/exec/test.js"
import type { ExecRun } from "../../src/plugins/exec/run.js"
import { execDeployCommandSchema, execDeploySpecSchema } from "../../src/plugins/exec/deploy.js"
import { execRunSpecSchema, execRuntimeOutputsSchema } from "../../src/plugins/exec/config.js"
import { sdk } from "../../src/plugin/sdk.js"
import { testNow } from "./constants.js"
import { execBuildHandler, execBuildSpecSchema } from "../../src/plugins/exec/build.js"
import { ActionModes } from "../../src/actions/types.js"

const s = sdk.schema

export const testModuleSpecSchema = createSchema({
  name: "test:Module:spec",
  keys: () => ({
    build: execModuleBuildSpecSchema(),
    services: joiArray(baseServiceSpecSchema()),
    tests: joiArray(execTestSchema()),
    tasks: joiArray(execTaskSpecSchema()),
  }),
})

export const testDeploySchema = execDeploySpecSchema.extend({
  deployCommand: execDeployCommandSchema.optional(),
})
export const testRunSchema = execRunSpecSchema.extend({})
export const testTestSchema = execTestSpecSchema.extend({})

export async function configureTestModule({ moduleConfig }: ConfigureModuleParams) {
  // validate services
  moduleConfig.serviceConfigs = moduleConfig.spec.services.map((spec) => ({
    name: spec.name,
    dependencies: spec.dependencies,
    disabled: spec.disabled,
    sourceModuleName: spec.sourceModuleName,
    timeout: spec.timeout,
    spec,
  }))

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((spec) => ({
    name: spec.name,
    dependencies: spec.dependencies,
    disabled: spec.disabled,
    timeout: spec.timeout,
    spec,
  }))

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((spec) => ({
    name: spec.name,
    dependencies: spec.dependencies,
    disabled: spec.disabled,
    timeout: spec.timeout,
    spec,
  }))

  return { moduleConfig }
}

const runTest: RunActionHandler<"run", ExecRun> = async ({ action, log }): Promise<GetRunResult> => {
  const { command } = action.getSpec()

  const commandStr = isString(command) ? command : command.join(" ")

  log.info("Run command: " + commandStr)

  const outputs = {
    log: commandStr,
  }

  return {
    state: "ready",
    detail: {
      ...outputs,
      completedAt: testNow,
      startedAt: testNow,
      success: true,
    },
    outputs,
  }
}

const testBuildStaticOutputsSchema = s.object({
  foo: s.string(),
})

const testPluginSecrets: { [key: string]: string } = {}

const _testPlugin = sdk.createGardenPlugin({
  name: "test-plugin",

  createModuleTypes: [
    {
      name: "test",
      docs: "Test module type",
      schema: testModuleSpecSchema(),
      needsBuild: true,
      handlers: {
        // We want all the actions from the exec conversion.
        convert: async (params: ConvertModuleParams) => {
          const module: ExecModule = params.module
          const result = await convertExecModule({ ...params, module })
          // Override action type
          for (const action of result.group.actions) {
            action.type = <any>"test"
          }
          return result
        },
        configure: configureTestModule,

        async getModuleOutputs() {
          return { outputs: { foo: "bar" } }
        },
      },
    },
  ],
})

_testPlugin.addDashboardPage({
  name: "test",
  description: "Test dashboard page",
  title: "Test",
  newWindow: false,
})

/**
 * PROVIDER
 */
const testPluginProvider = _testPlugin.createProvider({ configSchema: s.object({}), outputsSchema: s.object({}) })

testPluginProvider.addHandler("configureProvider", async ({ config }) => {
  for (const member in testPluginSecrets) {
    delete testPluginSecrets[member]
  }
  return { config }
})
testPluginProvider.addHandler("getDashboardPage", async ({ page }) => {
  return { url: `http://localhost:12345/${page.name}` }
})
testPluginProvider.addHandler("getEnvironmentStatus", async ({}) => {
  return { ready: true, outputs: { testKey: "testValue" } }
})
testPluginProvider.addHandler("prepareEnvironment", async ({}) => {
  return { status: { ready: true, outputs: { testKey: "testValue" } } }
})
testPluginProvider.addHandler("getDebugInfo", async ({}) => {
  return {
    info: {
      exampleData: "data",
      exampleData2: "data2",
    },
  }
})

/**
 * BUILD
 */
const testPluginBuild = testPluginProvider.createActionType({
  kind: "Build",
  name: "test",
  docs: "Test Build action",
  specSchema: execBuildSpecSchema,
  staticOutputsSchema: testBuildStaticOutputsSchema,
  runtimeOutputsSchema: execRuntimeOutputsSchema,
})

// TODO: remove typecast. Required due to `testBuildStaticOutputsSchema` being defined and `execBuildHandler` not having the outputs.
// Property 'foo' is missing in type '{}' but required in type '{ foo: string; }
testPluginBuild.addHandler("build", execBuildHandler as any)
testPluginBuild.addHandler("getStatus", async ({ ctx, action }) => {
  const result = get(ctx.provider, ["_actionStatuses", action.kind, action.name])
  return result || { state: "not-ready", detail: null, outputs: {} }
})
testPluginBuild.addHandler("getOutputs", async (_) => {
  return { outputs: { foo: "bar" } }
})

/**
 * DEPLOY
 */
const testPluginDeploy = testPluginProvider.createActionType({
  kind: "Deploy",
  name: "test",
  docs: "Test Deploy action",
  specSchema: testDeploySchema,
  staticOutputsSchema: s.object({}),
  runtimeOutputsSchema: execRuntimeOutputsSchema,
})

testPluginDeploy.addHandler("configure", async ({ config }) => {
  return { config, supportedModes: { sync: !!config.spec["sync"] } satisfies ActionModes }
})
testPluginDeploy.addHandler("deploy", async ({}) => {
  return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
})
testPluginDeploy.addHandler("getStatus", async ({ ctx, action }) => {
  const result = get(ctx.provider, ["_actionStatuses", action.kind, action.name])
  return result || { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
})
testPluginDeploy.addHandler("exec", async ({ command }) => {
  return { code: 0, output: "Ran command: " + command.join(" ") }
})

/**
 * RUN
 */
const testPluginRun = testPluginProvider.createActionType({
  kind: "Run",
  name: "test",
  docs: "Test Run action",
  specSchema: testRunSchema,
  staticOutputsSchema: s.object({}),
  runtimeOutputsSchema: execRuntimeOutputsSchema,
})

testPluginRun.addHandler("run", runTest)
testPluginRun.addHandler("getResult", async ({ ctx, action }) => {
  const result = get(ctx.provider, ["_actionStatuses", action.kind, action.name])
  return result || { state: "not-ready", detail: null, outputs: {} }
})

/**
 * TEST
 */
const testPluginTest = testPluginProvider.createActionType({
  kind: "Test",
  name: "test",
  docs: "Test Test action",
  specSchema: testTestSchema,
  staticOutputsSchema: s.object({}),
  runtimeOutputsSchema: execRuntimeOutputsSchema,
})

testPluginTest.addHandler("run", <TestActionHandler<"run", ExecTest>>(<unknown>runTest))
testPluginTest.addHandler("getResult", async ({ ctx, action }) => {
  const result = get(ctx.provider, ["_actionStatuses", action.kind, action.name])
  return result || { state: "not-ready", detail: null, outputs: {} }
})

/**
 * EXPORTS / REFERENCES
 */
export const testPlugin = () => _testPlugin.getSpec()

export const customizedTestPlugin = (partialCustomSpec: Partial<PartialGardenPluginSpec>) => {
  const base = cloneDeep(testPlugin())
  merge(base, partialCustomSpec)
  return base
}

export const testPluginB = () => {
  const base = testPlugin()

  return createGardenPlugin({
    ...base,
    name: "test-plugin-b",
    dependencies: [{ name: "test-plugin" }],
    createModuleTypes: [],
    createActionTypes: {},
  })
}

export const testPluginC = () => {
  const base = testPlugin()

  return createGardenPlugin({
    ...base,
    name: "test-plugin-c",
    // TODO-G2: change to create action types
    createModuleTypes: [
      {
        name: "test-c",
        docs: "Test module type C",
        schema: testModuleSpecSchema(),
        handlers: base.createModuleTypes![0].handlers,
        needsBuild: true,
      },
    ],
    createActionTypes: {},
  })
}

export const testPluginReferences: () => GardenPluginReference[] = () =>
  [testPlugin, testPluginB, testPluginC].map((p) => {
    return { name: p().name, callback: p }
  })
export const testPlugins = async () => {
  const plugins = testPluginReferences().map((p) => p.callback())
  return await Promise.all(plugins)
}

export const noOpTestPlugin = () =>
  customizedTestPlugin({
    name: "test",
    createActionTypes: {
      Build: [
        {
          name: "test",
          docs: "Test Build action",
          schema: joi.object(),
          handlers: {},
        },
      ],
      Deploy: [
        {
          name: "test",
          docs: "Test Deploy action",
          schema: joi.object(),
          handlers: {},
        },
      ],
      Run: [
        {
          name: "test",
          docs: "Test Run action",
          schema: joi.object(),
          handlers: {},
        },
      ],
      Test: [
        {
          name: "test",
          docs: "Test Test action",
          schema: joi.object(),
          handlers: {},
        },
      ],
    },
  })
