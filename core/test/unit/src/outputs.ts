/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { TestGarden } from "../../helpers"
import { resolveProjectOutputs } from "../../../src/outputs"
import { expect } from "chai"
import { realpath } from "fs-extra"
import { createGardenPlugin } from "../../../src/types/plugin/plugin"
import { ProjectConfig, defaultNamespace } from "../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../src/constants"
import { exec } from "../../../src/util/util"
import { ServiceState } from "../../../src/types/service"
import { RunTaskResult } from "../../../src/types/plugin/task/runTask"

describe("resolveProjectOutputs", () => {
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string
  let projectConfig: ProjectConfig

  beforeEach(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    tmpPath = await realpath(tmpDir.path)
    await exec("git", ["init"], { cwd: tmpPath })
    projectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "test",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: [],
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [{ name: "test" }],
      variables: {},
    }
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  it("should return immediately if there are no outputs specified", async () => {
    const garden = await TestGarden.factory(tmpPath, {
      config: projectConfig,
    })
    const outputs = await resolveProjectOutputs(garden, garden.log)
    expect(outputs).to.eql([])
  })

  it("should resolve provider output template references", async () => {
    const plugin = createGardenPlugin({
      name: "test",
      handlers: {
        async getEnvironmentStatus() {
          return { ready: true, outputs: { test: "test-value" } }
        },
      },
    })

    projectConfig.outputs = [{ name: "test", value: "${providers.test.outputs.test}" }]

    const garden = await TestGarden.factory(tmpPath, {
      plugins: [plugin],
      config: projectConfig,
    })

    const outputs = await resolveProjectOutputs(garden, garden.log)
    expect(outputs).to.eql([{ name: "test", value: "test-value" }])
  })

  it("should resolve module output template references", async () => {
    const plugin = createGardenPlugin({
      name: "test",
      handlers: {
        async getEnvironmentStatus() {
          return { ready: true, outputs: { test: "test-value" } }
        },
      },
      createModuleTypes: [
        {
          name: "test",
          docs: "test",
          handlers: {
            async getModuleOutputs({ moduleConfig }) {
              return { outputs: moduleConfig.spec.outputs }
            },
          },
        },
      ],
    })

    projectConfig.outputs = [{ name: "test", value: "${modules.test.outputs.test}" }]

    const garden = await TestGarden.factory(tmpPath, {
      plugins: [plugin],
      config: projectConfig,
    })

    garden.setModuleConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        name: "test",
        path: tmpPath,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          outputs: {
            test: "test-value",
          },
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const outputs = await resolveProjectOutputs(garden, garden.log)
    expect(outputs).to.eql([{ name: "test", value: "test-value" }])
  })

  it("should resolve service runtime output references", async () => {
    const status = { state: <ServiceState>"ready", outputs: { test: "test-value" }, detail: {} }
    const plugin = createGardenPlugin({
      name: "test",
      handlers: {},
      createModuleTypes: [
        {
          name: "test",
          docs: "test",
          handlers: {
            async getModuleOutputs({ moduleConfig }) {
              return { outputs: moduleConfig.spec.outputs }
            },
            async getServiceStatus() {
              return status
            },
            async deployService() {
              return status
            },
          },
        },
      ],
    })

    projectConfig.outputs = [{ name: "test", value: "${runtime.services.test.outputs.test}" }]

    const garden = await TestGarden.factory(tmpPath, {
      plugins: [plugin],
      config: projectConfig,
    })

    garden.setModuleConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        name: "test",
        path: tmpPath,
        serviceConfigs: [
          {
            name: "test",
            dependencies: [],
            disabled: false,
            hotReloadable: false,
            spec: {},
          },
        ],
        taskConfigs: [],
        spec: {
          outputs: {
            test: "test-value",
          },
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const outputs = await resolveProjectOutputs(garden, garden.log)
    expect(outputs).to.eql([{ name: "test", value: "test-value" }])
  })

  it("should resolve task runtime output references", async () => {
    const result: RunTaskResult = {
      command: ["whatever"],
      completedAt: new Date(),
      log: "hello",
      moduleName: "test",
      outputs: { log: "hello" },
      startedAt: new Date(),
      success: true,
      taskName: "test",
      version: "abcdef",
    }

    const plugin = createGardenPlugin({
      name: "test",
      handlers: {},
      createModuleTypes: [
        {
          name: "test",
          docs: "test",
          handlers: {
            async getModuleOutputs({ moduleConfig }) {
              return { outputs: moduleConfig.spec.outputs }
            },
            async getTaskResult() {
              return result
            },
            async runTask() {
              return result
            },
          },
        },
      ],
    })

    projectConfig.outputs = [{ name: "test", value: "${runtime.tasks.test.outputs.log}" }]

    const garden = await TestGarden.factory(tmpPath, {
      plugins: [plugin],
      config: projectConfig,
    })

    garden.setModuleConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        name: "test",
        path: tmpPath,
        serviceConfigs: [],
        taskConfigs: [
          {
            name: "test",
            cacheResult: true,
            dependencies: [],
            disabled: false,
            spec: {},
            timeout: null,
          },
        ],
        spec: {
          outputs: {
            test: "test-value",
          },
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const outputs = await resolveProjectOutputs(garden, garden.log)
    expect(outputs).to.eql([{ name: "test", value: "hello" }])
  })
})
