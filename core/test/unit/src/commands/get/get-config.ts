/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { omit, pick } from "lodash-es"
import { getDataDir, makeTestGarden, makeTestGardenA, withDefaultGlobalOpts } from "../../../../helpers.js"
import { GetConfigCommand } from "../../../../../src/commands/get/get-config.js"
import { sortBy } from "lodash-es"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_RUN_TIMEOUT_SEC,
  DEFAULT_TEST_TIMEOUT_SEC,
  GardenApiVersion,
} from "../../../../../src/constants.js"
import type { WorkflowConfig, WorkflowLimitSpec } from "../../../../../src/config/workflow.js"
import { defaultWorkflowResources } from "../../../../../src/config/workflow.js"
import { defaultContainerLimits } from "../../../../../src/plugins/container/moduleConfig.js"
import type { ModuleConfig } from "../../../../../src/config/module.js"
import { serialiseUnresolvedTemplates } from "../../../../../src/template/types.js"

describe("GetConfigCommand", () => {
  const command = new GetConfigCommand()

  it("returns all action configs", async () => {
    const garden = await makeTestGardenA()

    const { result } = await garden.runCommand({
      command,
      args: {},
      opts: { "exclude-disabled": false, "resolve": "full" },
    })

    const graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })
    const actions = graph.getActions()

    for (const action of actions) {
      const config = omit(action.getConfig(), "internal")
      expect(result!.actionConfigs[action.kind][action.name]).to.eql(config)
    }
  })

  it("should get the project configuration", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const res = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "full" }),
    })

    expect(command.outputsSchema().validate(res.result).error).to.be.undefined

    const expectedModuleConfigs = sortBy(await garden.resolveModules({ log }), "name").map((m) => m._config)

    expect(res.result?.moduleConfigs).to.deep.equal(expectedModuleConfigs)
  })

  it("should include the project name, id, domain and all environment names", async () => {
    const root = getDataDir("test-projects", "login", "has-domain-and-id")
    const garden = await makeTestGarden(root)
    const log = garden.log

    const result = (
      await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "full" }),
      })
    ).result

    expect(pick(result, ["domain", "projectName", "projectId", "allEnvironmentNames"])).to.eql({
      projectName: "has-domain-and-id",
      projectId: "dummy-id",
      domain: "https://example.invalid",
      allEnvironmentNames: ["local", "other"],
    })
  })

  it("should include workflow configs", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const workflowConfigs: WorkflowConfig[] = [
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        keepAliveHours: 48,
        limits: defaultContainerLimits as WorkflowLimitSpec,
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [{ command: ["run", "foo"] }],
      },
    ]
    garden.setRawWorkflowConfigs(workflowConfigs)

    const res = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "full" }),
    })

    const expectedModuleConfigs = sortBy(await garden.resolveModules({ log }), "name").map((m) => m._config)

    expect(res.result?.moduleConfigs).to.deep.equal(expectedModuleConfigs)
  })

  it("should include disabled module configs", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    garden.setPartialModuleConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: true,
        name: "a-disabled",
        include: [],
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service-a",
              dependencies: [],
              disabled: false,
              spec: {},
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
      {
        apiVersion: GardenApiVersion.v0,
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        include: [],
        name: "b-enabled",
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service-b",
              dependencies: [],
              disabled: false,
              spec: {},
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const res = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "full" }),
    })

    const expectedModuleConfigs = sortBy(await garden.resolveModules({ log, includeDisabled: true }), "name").map(
      (m) => m._config
    )

    expect(res.result?.moduleConfigs).to.deep.equal(expectedModuleConfigs)
  })

  it("should include disabled service configs", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    garden.setPartialModuleConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        name: "enabled",
        include: [],
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service-disabled",
              dependencies: [],
              disabled: true,

              spec: {},
            },
            {
              name: "service-enabled",
              dependencies: [],
              disabled: false,

              spec: {},
            },
          ],
          tasks: [
            {
              name: "task-enabled",
              dependencies: [],
              disabled: false,
              command: ["echo", "ok"],
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const res = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "full" }),
    })

    const expectedModuleConfigs = (await garden.resolveModules({ log, includeDisabled: true })).map((m) => m._config)

    expect(res.result?.moduleConfigs).to.deep.equal(expectedModuleConfigs)
  })

  it("should include disabled task configs", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    garden.setPartialModuleConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        name: "enabled",
        include: [],
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service",
              dependencies: [],
              disabled: false,
              spec: {},
            },
          ],
          tasks: [
            {
              name: "task-disabled",
              dependencies: [],
              disabled: true,
              command: ["echo", "ok"],
            },
            {
              name: "task-enabled",
              dependencies: [],
              disabled: false,
              command: ["echo", "ok"],
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const res = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "full" }),
    })

    const expectedModuleConfigs = (await garden.resolveModules({ log, includeDisabled: true })).map((m) => m._config)

    expect(res.result?.moduleConfigs).to.deep.equal(expectedModuleConfigs)
  })

  it("should include disabled test configs", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    garden.setPartialModuleConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        name: "enabled",
        include: [],
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service",
              dependencies: [],
              disabled: false,
              spec: {},
            },
          ],
          tasks: [
            {
              name: "task-enabled",
              dependencies: [],
              disabled: false,
              command: ["echo", "ok"],
            },
          ],
          tests: [
            {
              name: "test-enabled",
              dependencies: [],
              disabled: false,
              command: ["echo", "ok"],
            },
            {
              name: "test-disabled",
              dependencies: [],
              disabled: true,
              command: ["echo", "ok"],
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const res = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "full" }),
    })

    const expectedModuleConfigs = (await garden.resolveModules({ log, includeDisabled: true })).map((m) => m._config)

    expect(res.result?.moduleConfigs).to.deep.equal(expectedModuleConfigs)
  })

  context("--exclude-disabled", () => {
    it("should exclude disabled module configs", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: true,
          name: "a-disabled",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-a",
                dependencies: [],
                disabled: false,
                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: GardenApiVersion.v0,
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          include: [],
          name: "b-enabled",
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-b",
                dependencies: [],
                disabled: false,
                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const res = await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": true, "resolve": "full" }),
      })

      const expectedModuleConfigs = sortBy(await garden.resolveModules({ log }), "name").map((m) => m._config)

      expect(res.result?.moduleConfigs).to.deep.equal(expectedModuleConfigs)
    })

    it("should exclude disabled service configs", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          name: "enabled",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-disabled",
                dependencies: [],
                disabled: true,

                spec: {},
              },
              {
                name: "service-enabled",
                dependencies: [],
                disabled: false,

                spec: {},
              },
            ],
            tasks: [
              {
                name: "task-enabled",
                dependencies: [],
                disabled: false,
                command: ["echo", "ok"],
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const res = await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": true, "resolve": "full" }),
      })

      const expectedModuleConfigs = (await garden.resolveModules({ log })).map((m) => m._config)
      const actualEnabledServiceConfig = res.result?.moduleConfigs[0].serviceConfigs[0]
      const expectedEnabledServiceConfig = expectedModuleConfigs[0].serviceConfigs.filter((s) => !s.disabled)[0]

      expect(actualEnabledServiceConfig).to.deep.equal(expectedEnabledServiceConfig)
    })

    it("should exclude disabled task configs", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          name: "enabled",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service",
                dependencies: [],
                disabled: false,
                spec: {},
              },
            ],
            tasks: [
              {
                name: "task-disabled",
                dependencies: [],
                disabled: true,
                command: ["echo", "ok"],
              },
              {
                name: "task-enabled",
                dependencies: [],
                disabled: false,
                command: ["echo", "ok"],
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const res = await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": true, "resolve": "full" }),
      })

      const expectedModuleConfigs = (await garden.resolveModules({ log })).map((m) => m._config)
      // Remove the disabled task
      expectedModuleConfigs[0].taskConfigs = [
        {
          name: "task-enabled",
          cacheResult: true,
          dependencies: [],
          disabled: false,
          spec: {
            name: "task-enabled",
            dependencies: [],
            disabled: false,
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
            env: {},
            artifacts: [],
            command: ["echo", "ok"],
          },
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
        },
      ]

      expect(res.result?.moduleConfigs).to.deep.equal(expectedModuleConfigs)
    })

    it("should exclude disabled test configs", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          name: "enabled",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service",
                dependencies: [],
                disabled: false,
                spec: {},
              },
            ],
            tasks: [
              {
                name: "task-enabled",
                dependencies: [],
                disabled: false,
                command: ["echo", "ok"],
              },
            ],
            tests: [
              {
                name: "test-enabled",
                dependencies: [],
                disabled: false,
                command: ["echo", "ok"],
              },
              {
                name: "test-disabled",
                dependencies: [],
                disabled: true,
                command: ["echo", "ok"],
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const res = await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": true, "resolve": "full" }),
      })

      const expectedModuleConfigs = (await garden.resolveModules({ log })).map((m) => m._config)
      // Remove the disabled test
      expectedModuleConfigs[0].testConfigs = [
        {
          name: "test-enabled",
          dependencies: [],
          disabled: false,
          spec: {
            name: "test-enabled",
            dependencies: [],
            disabled: false,
            timeout: DEFAULT_TEST_TIMEOUT_SEC,
            artifacts: [],
            command: ["echo", "ok"],
            env: {},
          },
          timeout: DEFAULT_TEST_TIMEOUT_SEC,
        },
      ]

      expect(res.result?.moduleConfigs).to.deep.equal(expectedModuleConfigs)
    })
  })

  context("resolve=partial", () => {
    it("should return raw module configs instead of fully resolved module configs", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log

      const rawConfigs: ModuleConfig[] = [
        {
          apiVersion: GardenApiVersion.v0,
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          name: "enabled",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [],
            tasks: [],
            tests: [
              {
                name: "test-enabled",
                dependencies: [],
                disabled: false,
                command: ["${project.name}"],
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ]

      garden.setPartialModuleConfigs(rawConfigs)

      const res = await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "partial" }),
      })

      expect(serialiseUnresolvedTemplates(res.result?.moduleConfigs)).to.deep.equal(rawConfigs)
    })

    it("should return raw provider configs instead of fully resolved providers", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log

      const res = await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "partial" }),
      })

      const unresolvedProviderConfigs = garden
        .getUnresolvedProviderConfigs()
        .map((c) => serialiseUnresolvedTemplates(c.unresolvedConfig))
      expect(res.result!.providers).to.eql(unresolvedProviderConfigs)
    })

    it("should not resolve providers", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log

      await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": false, "resolve": "partial" }),
      })

      expect(garden["resolvedProviders"]).to.eql({})
    })
  })
})
