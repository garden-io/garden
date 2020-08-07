/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { DeployCommand } from "../../../../src/commands/deploy"
import { expect } from "chai"
import { buildExecModule } from "../../../../src/plugins/exec"
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
        "hot-reload": undefined,
        "watch": false,
        "force": false,
        "force-build": true,
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

    expect(getRuntimeStatusEvents(garden.events.eventLog)).to.eql([
      { name: "taskStatus", payload: { taskName: "task-a", status: { state: "not-implemented" } } },
      { name: "taskStatus", payload: { taskName: "task-c", status: { state: "not-implemented" } } },
      { name: "serviceStatus", payload: { serviceName: "service-c", status: { state: "ready" } } },
      { name: "serviceStatus", payload: { serviceName: "service-d", status: { state: "unknown" } } },
      { name: "serviceStatus", payload: { serviceName: "service-a", status: { state: "ready" } } },
      { name: "serviceStatus", payload: { serviceName: "service-b", status: { state: "unknown" } } },
      { name: "serviceStatus", payload: { serviceName: "service-c", status: { state: "ready" } } },
      { name: "serviceStatus", payload: { serviceName: "service-d", status: { state: "ready" } } },
      { name: "taskStatus", payload: { taskName: "task-c", status: { state: "succeeded" } } },
      { name: "taskStatus", payload: { taskName: "task-a", status: { state: "succeeded" } } },
      { name: "serviceStatus", payload: { serviceName: "service-a", status: { state: "ready" } } },
      { name: "serviceStatus", payload: { serviceName: "service-b", status: { state: "ready" } } },
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
        "hot-reload": undefined,
        "watch": false,
        "force": false,
        "force-build": true,
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
        "hot-reload": undefined,
        "watch": false,
        "force": false,
        "force-build": true,
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
        "hot-reload": undefined,
        "watch": false,
        "force": false,
        "force-build": true,
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
})
