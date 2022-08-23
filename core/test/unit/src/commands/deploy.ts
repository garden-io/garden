/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { DeployCommand } from "../../../../src/commands/deploy"
import { expect } from "chai"
import {
  taskResultOutputs,
  withDefaultGlobalOpts,
  dataDir,
  makeTestGarden,
  getRuntimeStatusEvents,
  customizedTestPlugin,
} from "../../../helpers"
import { sortBy } from "lodash"
import { getLogger } from "../../../../src/logger/logger"
import { ActionStatus } from "../../../../src/actions/base"
import { execDeployActionSchema } from "../../../../src/plugins/exec/config"

// TODO-G2: rename test cases to match the new graph model semantics

const placeholderTimestamp = new Date()

const placeholderTaskResult = (moduleName: string, taskName: string, command: string[]) => ({
  moduleName,
  taskName,
  command,
  version: "v-1",
  success: true,
  startedAt: placeholderTimestamp,
  completedAt: placeholderTimestamp,
  log: "out",
  outputs: {
    log: "out",
  },
})

const testProvider = () => {
  const testStatuses: { [key: string]: ActionStatus } = {
    "service-a": {
      state: "ready",
      detail: {
        state: "ready",
        detail: {},
        ingresses: [
          {
            hostname: "service-a.test-project-b.local.app.garden",
            path: "/path-a",
            port: 80,
            protocol: "http",
          },
        ],
      },
      outputs: {},
    },
    "service-c": {
      state: "ready",
      detail: { state: "ready", detail: {} },
      outputs: {},
    },
  }

  return customizedTestPlugin({
    name: "test-plugin",
    createActionTypes: {
      Deploy: [
        {
          name: "test",
          docs: "Test Deploy action",
          schema: execDeployActionSchema(),
          handlers: {
            deploy: async (params) => {
              const newStatus: ActionStatus = { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
              testStatuses[params.action.name] = newStatus
              return newStatus
            },
            getStatus: async (params) => {
              return (
                testStatuses[params.action.name] || {
                  state: "unknown",
                  detail: { state: "unknown", detail: {} },
                  outputs: {},
                }
              )
            },
            run: async (params) => {
              // TODO-G2: check the result object structure and fix it if necessary
              return placeholderTaskResult(params.action.moduleName(), params.action.name, params.action.getSpec().command)
            },
            exec: async ({ action }) => {
              const { command } = action.getSpec()
              return { code: 0, output: "Ran command: " + command.join(" ") }
            },
          },
        },
      ],
    },
  })
}

describe("DeployCommand", () => {
  const plugins = [testProvider()]
  const projectRootB = join(dataDir, "test-project-b")
  const projectRootA = join(dataDir, "test-project-a")

  // TODO: Verify that services don't get redeployed when same version is already deployed.
  // TODO: Test with --watch flag

  it("should build and deploy all modules in a project", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins })
    const log = garden.log
    const command = new DeployCommand()

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        names: undefined,
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,

        "local-mode": undefined,
        "watch": false,
        "force": false,
        "force-build": true,
        "skip": undefined,
        "skip-dependencies": false,
        "forward": false,
      }),
    })

    if (errors?.length) {
      throw errors[0]
    }

    expect(command.outputsSchema().validate(result).error).to.be.undefined

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "build.module-c",
      "deploy.service-a",
      "deploy.service-b",
      "deploy.service-c",
      "deploy.service-d",
      "get-service-status.service-a",
      "get-service-status.service-b",
      "get-service-status.service-c",
      "get-service-status.service-d",
      "get-task-result.task-a",
      "get-task-result.task-c",

      "task.task-a",
      "task.task-c",
    ])

    const deployResults = result!.graphResults

    // for (const res of Object.values(deployResults)) {
    //   expect(res.durationMsec).to.gte(0)
    //   res.durationMsec = 0
    // }

    expect(deployResults).to.eql({
      "service-c": {
        version: "1",
        state: "ready",
        detail: {},
        forwardablePorts: [],
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        outputs: {},
      },
      "service-d": {
        version: "1",
        state: "ready",
        detail: {},
        forwardablePorts: [],
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        outputs: {},
      },
      "service-a": {
        version: "1",
        state: "ready",
        detail: {},
        forwardablePorts: [],
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        outputs: {},
      },
      "service-b": {
        version: "1",
        state: "ready",
        detail: {},
        forwardablePorts: [],
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        outputs: {},
      },
    })

    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

    const sortedEvents = sortBy(
      getRuntimeStatusEvents(garden.events.eventLog),
      (e) => `${e.name}.${e.payload.taskName || e.payload.serviceName}.${e.payload.status.state}`
    )

    const getDeployUid = (serviceName: string): string => {
      const event = sortedEvents.find((e) => e.payload.serviceName === serviceName && !!e.payload.actionUid)
      if (!event) {
        throw new Error(`No serviceStatus event with an actionUid found for service name ${serviceName}`)
      }
      return event.payload.actionUid
    }

    const getRunTaskUid = (taskName: string) => {
      const event = sortedEvents.find((e) => e.payload.taskName === taskName && !!e.payload.actionUid)
      if (!event) {
        throw new Error(`No taskStatus event with an actionUid found for task name ${taskName}`)
      }
      return event.payload.actionUid
    }

    const getModuleVersion = (moduleName: string) => graph.getModule(moduleName).version.versionString
    const getDeployVersion = (serviceName: string) => graph.getDeploy(serviceName).versionString()
    const getRunVersion = (taskName: string) => graph.getRun(taskName).versionString()

    const deployServiceAUid = getDeployUid("service-a")
    const deployServiceBUid = getDeployUid("service-b")
    const deployServiceCUid = getDeployUid("service-c")
    const deployServiceDUid = getDeployUid("service-d")

    const runTaskAUid = getRunTaskUid("task-a")
    const runTaskCUid = getRunTaskUid("task-c")

    const moduleVersionA = getModuleVersion("module-a")
    const moduleVersionB = getModuleVersion("module-b")
    const moduleVersionC = getModuleVersion("module-c")

    const serviceVersionA = getDeployVersion("service-a")
    const serviceVersionB = getDeployVersion("service-b")
    const serviceVersionC = getDeployVersion("service-c")
    const serviceVersionD = getDeployVersion("service-d") // `service-d` is defined in `module-c`

    const taskVersionA = getRunVersion("task-a")
    const taskVersionC = getRunVersion("task-c")

    expect(sortedEvents).to.eql([
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-a",
          moduleName: "module-a",
          moduleVersion: moduleVersionA,
          serviceVersion: serviceVersionA,
          actionUid: deployServiceAUid,
          status: { state: "deploying" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-a",
          moduleName: "module-a",
          moduleVersion: moduleVersionA,
          serviceVersion: serviceVersionA,
          status: { state: "ready" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-a",
          moduleName: "module-a",
          moduleVersion: moduleVersionA,
          serviceVersion: serviceVersionA,
          actionUid: deployServiceAUid,
          status: { state: "ready" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-b",
          moduleName: "module-b",
          actionUid: deployServiceBUid,
          moduleVersion: moduleVersionB,
          serviceVersion: serviceVersionB,
          status: { state: "deploying" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-b",
          moduleName: "module-b",
          actionUid: deployServiceBUid,
          moduleVersion: moduleVersionB,
          serviceVersion: serviceVersionB,
          status: { state: "ready" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-b",
          moduleName: "module-b",
          moduleVersion: moduleVersionB,
          serviceVersion: serviceVersionB,
          status: { state: "unknown" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-c",
          moduleName: "module-c",
          actionUid: deployServiceCUid,
          moduleVersion: moduleVersionC,
          serviceVersion: serviceVersionC,
          status: { state: "deploying" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-c",
          moduleName: "module-c",
          moduleVersion: moduleVersionC,
          serviceVersion: serviceVersionC,
          status: { state: "ready" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-c",
          moduleName: "module-c",
          actionUid: deployServiceCUid,
          moduleVersion: moduleVersionC,
          serviceVersion: serviceVersionC,
          status: { state: "ready" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-d",
          moduleName: "module-c",
          actionUid: deployServiceDUid,
          moduleVersion: moduleVersionC,
          serviceVersion: serviceVersionD,
          status: { state: "deploying" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-d",
          moduleName: "module-c",
          actionUid: deployServiceDUid,
          moduleVersion: moduleVersionC,
          serviceVersion: serviceVersionD,
          status: { state: "ready" },
        },
      },
      {
        name: "serviceStatus",
        payload: {
          serviceName: "service-d",
          moduleName: "module-c",
          moduleVersion: moduleVersionC,
          serviceVersion: serviceVersionD,
          status: { state: "unknown" },
        },
      },
      {
        name: "taskStatus",
        payload: {
          taskName: "task-a",
          moduleName: "module-a",
          moduleVersion: moduleVersionA,
          taskVersion: taskVersionA,
          status: { state: "not-implemented" },
        },
      },
      {
        name: "taskStatus",
        payload: {
          taskName: "task-a",
          moduleName: "module-a",
          moduleVersion: moduleVersionA,
          taskVersion: taskVersionA,
          actionUid: runTaskAUid,
          status: { state: "running" },
        },
      },
      {
        name: "taskStatus",
        payload: {
          taskName: "task-a",
          moduleName: "module-a",
          moduleVersion: moduleVersionA,
          taskVersion: taskVersionA,
          actionUid: runTaskAUid,
          status: { state: "succeeded" },
        },
      },
      {
        name: "taskStatus",
        payload: {
          taskName: "task-c",
          moduleName: "module-c",
          moduleVersion: moduleVersionC,
          taskVersion: taskVersionC,
          status: { state: "not-implemented" },
        },
      },
      {
        name: "taskStatus",
        payload: {
          taskName: "task-c",
          moduleName: "module-c",
          moduleVersion: moduleVersionC,
          taskVersion: taskVersionC,
          actionUid: runTaskCUid,
          status: { state: "running" },
        },
      },
      {
        name: "taskStatus",
        payload: {
          taskName: "task-c",
          moduleName: "module-c",
          moduleVersion: moduleVersionC,
          taskVersion: taskVersionC,
          actionUid: runTaskCUid,
          status: { state: "succeeded" },
        },
      },
    ])
  })

  it("should optionally build and deploy single service and its dependencies", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins })
    const log = garden.log
    const command = new DeployCommand()

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        names: ["service-b"],
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,

        "local-mode": undefined,
        "watch": false,
        "force": false,
        "force-build": true,
        "skip": undefined,
        "skip-dependencies": false,
        "forward": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "build.module-c",
      "deploy.service-a",
      "deploy.service-b",
      "get-service-status.service-a",
      "get-service-status.service-b",
      "get-task-result.task-a",
      "get-task-result.task-c",

      "task.task-a",
      "task.task-c",
    ])
  })

  context("when --skip-dependencies is passed", () => {
    it("should not process runtime dependencies for the requested services", async () => {
      const garden = await makeTestGarden(projectRootA, { plugins })
      const log = garden.log
      const command = new DeployCommand()

      const { result, errors } = await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          names: ["service-b", "service-c"],
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": undefined,

          "local-mode": undefined,
          "watch": false,
          "force": false,
          "force-build": true,
          "skip": undefined,
          "skip-dependencies": true, // <-----
          "forward": false,
        }),
      })

      if (errors) {
        throw errors[0]
      }

      expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
        "build.module-a",
        "build.module-b",
        "build.module-c",
        // service-b has a dependency on service-a, it should be skipped here
        // "deploy.service-a",
        "deploy.service-b",
        "deploy.service-c",
        "get-service-status.service-a",
        "get-service-status.service-b",
        "get-service-status.service-c",
        "get-task-result.task-c",

        // service-c has a dependency on task-c, it should be skipped here
        // "task.task-c",
      ])
    })
  })

  it("should be protected", async () => {
    const command = new DeployCommand()
    expect(command.protected).to.be.true
  })

  it("should skip disabled services", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins })
    const log = garden.log
    const command = new DeployCommand()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].spec.services[0].disabled = true

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        names: undefined,
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,

        "local-mode": undefined,
        "watch": false,
        "force": false,
        "force-build": true,
        "skip": undefined,
        "skip-dependencies": false,
        "forward": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "build.module-c",
      "deploy.service-a",
      "deploy.service-b",
      "deploy.service-d",
      "get-service-status.service-a",
      "get-service-status.service-b",
      "get-service-status.service-d",
      "get-task-result.task-a",
      "get-task-result.task-c",

      "task.task-a",
      "task.task-c",
    ])
  })

  it("should skip services from disabled modules", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins })
    const log = garden.log
    const command = new DeployCommand()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].disabled = true

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        names: undefined,
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,

        "local-mode": undefined,
        "watch": false,
        "force": false,
        "force-build": true,
        "skip": undefined,
        "skip-dependencies": false,
        "forward": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "deploy.service-a",
      "deploy.service-b",
      "get-service-status.service-a",
      "get-service-status.service-b",
      "get-task-result.task-a",

      "task.task-a",
    ])
  })

  it("should skip services set in the --skip option", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins })
    const log = garden.log
    const command = new DeployCommand()

    await garden.scanAndAddConfigs()

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {
        names: undefined,
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,

        "local-mode": undefined,
        "watch": false,
        "force": false,
        "force-build": true,
        "skip": ["service-b"],
        "skip-dependencies": false,
        "forward": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).includes("deploy.service-b")).to.be.false
  })

  describe("isPersistent", () => {
    it("should return persistent=true if --watch is set", async () => {
      const cmd = new DeployCommand()
      const log = getLogger().placeholder()
      const persistent = cmd.isPersistent({
        log,
        headerLog: log,
        footerLog: log,
        args: {
          names: undefined,
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": undefined,

          "local-mode": undefined,
          "watch": true,
          "force": false,
          "force-build": true,
          "skip": ["service-b"],
          "skip-dependencies": false,
          "forward": false,
        }),
      })
      expect(persistent).to.be.true
    })

    it("should return persistent=true if --dev is set", async () => {
      const cmd = new DeployCommand()
      const log = getLogger().placeholder()
      const persistent = cmd.isPersistent({
        log,
        headerLog: log,
        footerLog: log,
        args: {
          names: undefined,
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": [],

          "local-mode": undefined,
          "watch": false,
          "force": false,
          "force-build": true,
          "skip": ["service-b"],
          "skip-dependencies": false,
          "forward": false,
        }),
      })
      expect(persistent).to.be.true
    })

    it("should return persistent=true if --local-mode is set", async () => {
      const cmd = new DeployCommand()
      const log = getLogger().placeholder()
      const persistent = cmd.isPersistent({
        log,
        headerLog: log,
        footerLog: log,
        args: {
          names: undefined,
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": undefined,

          "local-mode": [],
          "watch": false,
          "force": false,
          "force-build": true,
          "skip": ["service-b"],
          "skip-dependencies": false,
          "forward": false,
        }),
      })
      expect(persistent).to.be.true
    })

    it("should return persistent=true if --follow is set", async () => {
      const cmd = new DeployCommand()
      const log = getLogger().placeholder()
      const persistent = cmd.isPersistent({
        log,
        headerLog: log,
        footerLog: log,
        args: {
          names: undefined,
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": undefined,

          "local-mode": undefined,
          "watch": false,
          "force": false,
          "force-build": true,
          "skip": ["service-b"],
          "skip-dependencies": false,
          "forward": true,
        }),
      })
      expect(persistent).to.be.true
    })
  })
})
