/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployCommand } from "../../../../src/commands/deploy"
import { expect } from "chai"
import {
  taskResultOutputs,
  withDefaultGlobalOpts,
  makeTestGarden,
  getRuntimeStatusEvents,
  customizedTestPlugin,
  testDeploySchema,
  testTestSchema,
  getAllProcessedTaskNames,
  getDataDir,
} from "../../../helpers"
import { sortBy } from "lodash"
import { getLogger } from "../../../../src/logger/logger"
import { ActionStatus } from "../../../../src/actions/types"

// TODO-G2: rename test cases to match the new graph model semantics
const placeholderTimestamp = new Date()

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
          schema: testDeploySchema(),
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
            exec: async ({ action }) => {
              const { command } = action.getSpec()
              return { code: 0, output: "Ran command: " + command.join(" ") }
            },
          },
        },
      ],
      Run: [
        {
          name: "test",
          docs: "Test Run action",
          schema: testTestSchema(),
          handlers: {
            run: async ({}) => {
              return {
                state: "ready",
                outputs: {},
                detail: {
                  success: true,
                  startedAt: placeholderTimestamp,
                  completedAt: placeholderTimestamp,
                  log: "OK",
                },
              }
            },
          },
        },
      ],
    },
  })
}

describe("DeployCommand", () => {
  const projectRootB = getDataDir("test-project-b")
  const projectRootA = getDataDir("test-project-a")

  // TODO: Verify that services don't get redeployed when same version is already deployed.
  // TODO: Test with --watch flag

  it("should build and deploy everything in a project, and execute Run dependencies", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
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
        "skip-watch": false,
        "forward": false,
      }),
    })

    if (errors?.length) {
      throw errors[0]
    }

    expect(command.outputsSchema().validate(result).error).to.be.undefined

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "deploy.service-a",
      "deploy.service-b",
      "deploy.service-c",
      "deploy.service-d",
    ])

    const deployResults = result!.graphResults

    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

    const sortedEvents = sortBy(
      getRuntimeStatusEvents(garden.events.eventLog),
      (e) => `${e.name}.${e.payload.actionName}.${e.payload.status.state}`
    )

    const getActionUid = (actionName: string): string => {
      const event = sortedEvents.find((e) => e.payload.actionName === actionName && !!e.payload.actionUid)
      if (!event) {
        throw new Error(`No event with an actionUid found for action name ${actionName}`)
      }
      return event.payload.actionUid
    }

    const getModuleVersion = (moduleName: string) => graph.getModule(moduleName).version.versionString
    const getDeployVersion = (serviceName: string) => graph.getDeploy(serviceName).versionString()
    const getRunVersion = (taskName: string) => graph.getRun(taskName).versionString()

    const deployServiceAUid = getActionUid("service-a")
    const deployServiceBUid = getActionUid("service-b")
    const deployServiceDUid = getActionUid("service-d")

    // Note: Runs A and C should not run or be queried for status because service-a is ready beforehand
    const runTaskBUid = getActionUid("task-b")
    const taskVersionB = getRunVersion("task-b")

    const moduleVersionA = getModuleVersion("module-a")
    const moduleVersionB = getModuleVersion("module-b")
    const moduleVersionC = getModuleVersion("module-c")

    const serviceVersionA = getDeployVersion("service-a")
    const serviceVersionB = getDeployVersion("service-b")
    const serviceVersionC = getDeployVersion("service-c")
    const serviceVersionD = getDeployVersion("service-d") // `service-d` is defined in `module-c`

    for (const graphResult of Object.values(deployResults)) {
      expect(graphResult).to.exist

      // Won't happen, but chai expect doesn't serve as a typeguard :(
      if (graphResult === null) {
        continue
      }

      expect(graphResult.name).to.exist
      expect(graphResult.version).to.equal(getDeployVersion(graphResult.name))
      expect(graphResult.aborted).to.be.false
      expect(graphResult.error).to.be.null
      expect(graphResult.result).to.exist
      expect(graphResult.startedAt).to.be.instanceOf(Date)
      expect(graphResult.completedAt).to.be.instanceOf(Date)

      const { result: res } = graphResult

      expect(res.state).to.equal("ready")
      expect(res.outputs).to.eql({})

      expect(res.detail.state).to.equal("ready")
      expect(res.detail.forwardablePorts).to.eql([])
      expect(res.detail.outputs).to.eql({})
    }

    expect(sortedEvents[0]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-a",
        serviceName: "service-a",
        moduleName: "module-a",
        moduleVersion: moduleVersionA,
        actionVersion: serviceVersionA,
        actionUid: deployServiceAUid,
        serviceVersion: serviceVersionA,
        status: { state: "deploying" },
      },
    })
    expect(sortedEvents[1]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-a",
        serviceName: "service-a",
        moduleName: "module-a",
        moduleVersion: moduleVersionA,
        actionVersion: serviceVersionA,
        serviceVersion: serviceVersionA,
        status: { state: "ready" },
      },
    })
    expect(sortedEvents[2]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-a",
        serviceName: "service-a",
        moduleName: "module-a",
        moduleVersion: moduleVersionA,
        actionVersion: serviceVersionA,
        serviceVersion: serviceVersionA,
        actionUid: deployServiceAUid,
        status: { state: "ready" },
      },
    })
    expect(sortedEvents[3]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-b",
        serviceName: "service-b",
        moduleName: "module-b",
        actionUid: deployServiceBUid,
        moduleVersion: moduleVersionB,
        actionVersion: serviceVersionB,
        serviceVersion: serviceVersionB,
        status: { state: "deploying" },
      },
    })
    expect(sortedEvents[4]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-b",
        serviceName: "service-b",
        moduleName: "module-b",
        actionUid: deployServiceBUid,
        moduleVersion: moduleVersionB,
        actionVersion: serviceVersionB,
        serviceVersion: serviceVersionB,
        status: { state: "ready" },
      },
    })
    expect(sortedEvents[5]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-b",
        serviceName: "service-b",
        moduleName: "module-b",
        moduleVersion: moduleVersionB,
        actionVersion: serviceVersionB,
        serviceVersion: serviceVersionB,
        status: { state: "unknown" },
      },
    })
    expect(sortedEvents[6]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-c",
        serviceName: "service-c",
        moduleName: "module-c",
        moduleVersion: moduleVersionC,
        actionVersion: serviceVersionC,
        serviceVersion: serviceVersionC,
        status: { state: "ready" },
      },
    })
    expect(sortedEvents[7]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-d",
        serviceName: "service-d",
        moduleName: "module-c",
        actionUid: deployServiceDUid,
        moduleVersion: moduleVersionC,
        actionVersion: serviceVersionD,
        serviceVersion: serviceVersionD,
        status: { state: "deploying" },
      },
    })
    expect(sortedEvents[8]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-d",
        serviceName: "service-d",
        moduleName: "module-c",
        actionUid: deployServiceDUid,
        moduleVersion: moduleVersionC,
        actionVersion: serviceVersionD,
        serviceVersion: serviceVersionD,
        status: { state: "ready" },
      },
    })
    expect(sortedEvents[9]).to.eql({
      name: "serviceStatus",
      payload: {
        actionName: "service-d",
        serviceName: "service-d",
        moduleName: "module-c",
        moduleVersion: moduleVersionC,
        actionVersion: serviceVersionD,
        serviceVersion: serviceVersionD,
        status: { state: "unknown" },
      },
    })
    expect(sortedEvents[10]).to.eql({
      name: "taskStatus",
      payload: {
        actionName: "task-b",
        taskName: "task-b",
        moduleName: "module-b",
        moduleVersion: moduleVersionB,
        actionVersion: taskVersionB,
        taskVersion: taskVersionB,
        status: { state: "outdated" },
      },
    })
    expect(sortedEvents[11]).to.eql({
      name: "taskStatus",
      payload: {
        actionName: "task-b",
        taskName: "task-b",
        moduleName: "module-b",
        moduleVersion: moduleVersionB,
        actionVersion: taskVersionB,
        taskVersion: taskVersionB,
        actionUid: runTaskBUid,
        status: { state: "running" },
      },
    })
    expect(sortedEvents[12]).to.eql({
      name: "taskStatus",
      payload: {
        actionName: "task-b",
        taskName: "task-b",
        moduleName: "module-b",
        moduleVersion: moduleVersionB,
        actionVersion: taskVersionB,
        taskVersion: taskVersionB,
        actionUid: runTaskBUid,
        status: { state: "succeeded" },
      },
    })
  })

  it("should optionally build and deploy single service and its dependencies", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
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
        "skip-watch": false,
        "forward": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    const keys = getAllProcessedTaskNames(result!.graphResults)

    expect(keys).to.eql([
      "build.module-a",
      "build.module-b",
      "deploy.service-a",
      "deploy.service-b",
      "resolve-action.build.module-a",
      "resolve-action.build.module-b",
      "resolve-action.build.module-c",
      "resolve-action.deploy.service-a",
      "resolve-action.deploy.service-b",
      "resolve-action.run.task-a",
      "resolve-action.run.task-b",
      "resolve-action.run.task-c",
      "run.task-b",
    ])
  })

  context("when --skip-dependencies is passed", () => {
    it("should not process runtime dependencies for the requested services", async () => {
      const garden = await makeTestGarden(projectRootA, { plugins: [testProvider()] })
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
          "skip-watch": false,
          "forward": false,
        }),
      })

      if (errors) {
        throw errors[0]
      }

      const keys = getAllProcessedTaskNames(result!.graphResults)

      // service-b has a dependency on service-a, it should be skipped here
      expect(keys).to.not.include("deploy.service-a")

      // service-c has a dependency on task-c, it should be skipped here
      expect(keys).to.not.include("run.task-c")

      // Specified services should be deployed
      expect(keys).to.include("deploy.service-b")
      expect(keys).to.include("deploy.service-c")
    })
  })

  it("should be protected", async () => {
    const command = new DeployCommand()
    expect(command.protected).to.be.true
  })

  it("should skip disabled services", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
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
        "skip-watch": false,
        "forward": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(result!.graphResults).sort()).to.eql([
      "deploy.service-a",
      "deploy.service-b",
      "deploy.service-d",
    ])
  })

  it("should skip services from disabled modules", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
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
        "skip-watch": false,
        "forward": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(result!.graphResults).sort()).to.eql(["deploy.service-a", "deploy.service-b"])
  })

  it("should skip services set in the --skip option", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
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
        "skip-watch": false,
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
          "skip-watch": false,
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
          "skip-watch": false,
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
          "skip-watch": false,
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
          "skip-watch": false,
          "forward": true,
        }),
      })
      expect(persistent).to.be.true
    })
  })
})
