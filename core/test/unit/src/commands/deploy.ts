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
import { buildExecModule } from "../../../../src/plugins/exec/exec"
import { ServiceState, ServiceStatus } from "../../../../src/types/service"
import {
  taskResultOutputs,
  configureTestModule,
  withDefaultGlobalOpts,
  dataDir,
  testModuleSpecSchema,
  makeTestGarden,
  getRuntimeStatusEvents,
} from "../../../helpers"
import { GetServiceStatusParams } from "../../../../src/types/plugin/service/getServiceStatus"
import { DeployServiceParams } from "../../../../src/types/plugin/service/deployService"
import { RunTaskParams, RunTaskResult } from "../../../../src/types/plugin/task/runTask"
import { createGardenPlugin } from "../../../../src/types/plugin/plugin"
import { sortBy } from "lodash"
import { getLogger } from "../../../../src/logger/logger"

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
  const testStatuses: { [key: string]: ServiceStatus } = {
    "service-a": {
      state: "ready",
      ingresses: [
        {
          hostname: "service-a.test-project-b.local.app.garden",
          path: "/path-a",
          port: 80,
          protocol: "http",
        },
      ],
      detail: {},
    },
    "service-c": {
      state: "ready",
      detail: {},
    },
  }

  return createGardenPlugin({
    name: "test-plugin",
    createModuleTypes: [
      {
        name: "test",
        docs: "Test plugin",
        schema: testModuleSpecSchema(),
        handlers: {
          configure: configureTestModule,
          build: buildExecModule,
          deployService: async ({ service }: DeployServiceParams) => {
            const newStatus = {
              version: "1",
              state: <ServiceState>"ready",
              detail: {},
            }

            testStatuses[service.name] = newStatus

            return newStatus
          },
          getServiceStatus: async ({ service }: GetServiceStatusParams): Promise<ServiceStatus> => {
            return testStatuses[service.name] || { state: "unknown", detail: {} }
          },
          runTask: async ({ task }: RunTaskParams): Promise<RunTaskResult> => {
            return placeholderTaskResult(task.module.name, task.name, task.spec.command)
          },
        },
      },
    ],
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
        services: undefined,
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,
        "hot-reload": undefined,
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
      "stage-build.module-a",
      "stage-build.module-b",
      "stage-build.module-c",
      "task.task-a",
      "task.task-c",
    ])

    const { deployments } = result!

    for (const res of Object.values(deployments)) {
      expect(res.durationMsec).to.gte(0)
      res.durationMsec = 0
    }

    expect(deployments).to.eql({
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
    const getServiceVersion = (serviceName: string) => graph.getService(serviceName).version
    const getTaskVersion = (taskName: string) => graph.getTask(taskName).version

    const deployServiceAUid = getDeployUid("service-a")
    const deployServiceBUid = getDeployUid("service-b")
    const deployServiceCUid = getDeployUid("service-c")
    const deployServiceDUid = getDeployUid("service-d")

    const runTaskAUid = getRunTaskUid("task-a")
    const runTaskCUid = getRunTaskUid("task-c")

    const moduleVersionA = getModuleVersion("module-a")
    const moduleVersionB = getModuleVersion("module-b")
    const moduleVersionC = getModuleVersion("module-c")

    const serviceVersionA = getServiceVersion("service-a")
    const serviceVersionB = getServiceVersion("service-b")
    const serviceVersionC = getServiceVersion("service-c")
    const serviceVersionD = getServiceVersion("service-d") // `service-d` is defined in `module-c`

    const taskVersionA = getTaskVersion("task-a")
    const taskVersionC = getTaskVersion("task-c")

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
        services: ["service-b"],
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,
        "hot-reload": undefined,
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
      "stage-build.module-a",
      "stage-build.module-b",
      "stage-build.module-c",
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
          services: ["service-b", "service-c"],
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": undefined,
          "hot-reload": undefined,
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
        "stage-build.module-a",
        "stage-build.module-b",
        "stage-build.module-c",
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
        services: undefined,
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,
        "hot-reload": undefined,
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
      "stage-build.module-a",
      "stage-build.module-b",
      "stage-build.module-c",
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
        services: undefined,
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,
        "hot-reload": undefined,
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
      "stage-build.module-a",
      "stage-build.module-b",
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
        services: undefined,
      },
      opts: withDefaultGlobalOpts({
        "dev-mode": undefined,
        "hot-reload": undefined,
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
          services: undefined,
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": undefined,
          "hot-reload": undefined,
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
          services: undefined,
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": [],
          "hot-reload": undefined,
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

    it("should return persistent=true if --hot-reload is set", async () => {
      const cmd = new DeployCommand()
      const log = getLogger().placeholder()
      const persistent = cmd.isPersistent({
        log,
        headerLog: log,
        footerLog: log,
        args: {
          services: undefined,
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": undefined,
          "hot-reload": ["*"],
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
          services: undefined,
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": undefined,
          "hot-reload": undefined,
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
          services: undefined,
        },
        opts: withDefaultGlobalOpts({
          "dev-mode": undefined,
          "hot-reload": undefined,
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
