/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployCommand } from "../../../../src/commands/deploy.js"
import { expect } from "chai"
import {
  taskResultOutputs,
  withDefaultGlobalOpts,
  makeTestGarden,
  customizedTestPlugin,
  testDeploySchema,
  testTestSchema,
  getAllProcessedTaskNames,
  getDataDir,
} from "../../../helpers.js"
import { getRootLogger } from "../../../../src/logger/logger.js"
import type { ActionStatus } from "../../../../src/actions/types.js"
import type { DeployStatus } from "../../../../src/plugin/handlers/Deploy/get-status.js"
import { defaultServerPort } from "../../../../src/commands/serve.js"
import { zodObjectToJoi } from "../../../../src/config/common.js"
import { gardenEnv } from "../../../../src/constants.js"

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
            hostname: "service-a.test-project-b.local.demo.garden",
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
          schema: zodObjectToJoi(testDeploySchema),
          handlers: {
            deploy: async (params) => {
              const newStatus: DeployStatus = { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
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
          schema: zodObjectToJoi(testTestSchema),
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

export const defaultDeployOpts = withDefaultGlobalOpts({
  "sync": undefined,
  "watch": false,
  "force": false,
  "force-build": true, // <----
  "skip": undefined,
  "skip-dependencies": false,
  "skip-watch": false,
  "forward": false,
  "logs": false,
  "timestamps": false,
  "port": defaultServerPort,
  "cmd": undefined,
  "disable-port-forwards": false,
  "with-dependants": false,
})

describe("DeployCommand", () => {
  const projectRootB = getDataDir("test-project-b")
  const projectRootA = getDataDir("test-project-a")

  // TODO: Verify that services don't get redeployed when same version is already deployed.

  const command = new DeployCommand()

  it("should build and deploy everything in a project, and execute Run dependencies", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        names: undefined,
      },
      opts: defaultDeployOpts,
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

    const graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })

    const getDeployVersion = (serviceName: string) => graph.getDeploy(serviceName).versionString(log)

    for (const graphResult of Object.values(deployResults)) {
      expect(graphResult).to.exist

      // Won't happen, but chai expect doesn't serve as a typeguard :(
      if (graphResult === null) {
        continue
      }

      expect(graphResult.name).to.exist
      expect(graphResult.inputVersion).to.equal(getDeployVersion(graphResult.name))
      expect(graphResult.aborted).to.be.false
      expect(graphResult.error).to.be.null
      expect(graphResult.result).to.exist
      expect(graphResult.startedAt).to.be.instanceOf(Date)
      expect(graphResult.completedAt).to.be.instanceOf(Date)

      const { result: res } = graphResult

      expect(res.state).to.equal("ready")
      expect(res.outputs).to.eql({})
    }
  })

  it("should optionally build and deploy single service and its dependencies", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        names: ["service-b"],
      },
      opts: defaultDeployOpts,
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

  context("GARDEN_ENABLE_PARTIAL_RESOLUTION=true", () => {
    const originalValue = gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION

    before(() => {
      gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION = true
    })

    after(() => {
      gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION = originalValue
    })

    it("should optionally build and deploy single service and its dependencies", async () => {
      const garden = await makeTestGarden(projectRootA, { plugins: [testProvider()], noCache: true })
      const log = garden.log

      const { result, errors } = await command.action({
        garden,
        log,
        args: {
          names: ["service-b"],
        },
        opts: { ...defaultDeployOpts, force: true },
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
        "resolve-action.deploy.service-a",
        "resolve-action.deploy.service-b",
      ])
    })

    it("works with wildcard name", async () => {
      const garden = await makeTestGarden(projectRootA, { plugins: [testProvider()], noCache: true })
      const log = garden.log

      const { result, errors } = await command.action({
        garden,
        log,
        args: {
          names: ["*-b"],
        },
        opts: { ...defaultDeployOpts, force: true },
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
        "resolve-action.deploy.service-a",
        "resolve-action.deploy.service-b",
      ])
    })
  })

  context("when --skip-dependencies is passed", () => {
    it("should not process runtime dependencies for the requested services", async () => {
      const garden = await makeTestGarden(projectRootA, { plugins: [testProvider()] })
      const log = garden.log

      const { result, errors } = await command.action({
        garden,
        log,
        args: {
          names: ["service-b", "service-c"],
        },
        opts: {
          ...defaultDeployOpts,
          "skip-dependencies": true,
        },
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

  context("when --with-dependants is passed", () => {
    it("should deploy dependant deploys", async () => {
      const garden = await makeTestGarden(projectRootA, { plugins: [testProvider()] })
      const log = garden.log

      const { result, errors } = await command.action({
        garden,
        log,
        args: {
          names: ["service-a"],
        },
        opts: {
          ...defaultDeployOpts,
          "with-dependants": true,
        },
      })

      if (errors) {
        throw errors[0]
      }

      const keys = getAllProcessedTaskNames(result!.graphResults)

      // c has nothing to do with service-a
      expect(keys).to.not.include("deploy.service-c")
      // b is a dependant
      expect(keys).to.include("deploy.service-b")
    })

    it("should have no effect if no names are passed", async () => {
      const garden = await makeTestGarden(projectRootA, { plugins: [testProvider()] })
      const log = garden.log

      const { result: resultWith, errors: errors1 } = await command.action({
        garden,
        log,
        args: {
          names: [],
        },
        opts: {
          ...defaultDeployOpts,
          "with-dependants": true,
        },
      })
      if (errors1) {
        throw errors1[0]
      }

      const { result: resultWithout, errors: errors2 } = await command.action({
        garden,
        log,
        args: {
          names: [],
        },
        opts: {
          ...defaultDeployOpts,
          "with-dependants": true,
        },
      })
      if (errors2) {
        throw errors2[0]
      }

      const keysWith = getAllProcessedTaskNames(resultWith!.graphResults)
      const keysWithout = getAllProcessedTaskNames(resultWithout!.graphResults)

      expect(keysWith).to.eql(keysWithout)
    })
  })

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })

  it("should skip disabled services", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].spec.services[0].disabled = true

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        names: undefined,
      },
      opts: defaultDeployOpts,
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

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].disabled = true

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        names: undefined,
      },
      opts: defaultDeployOpts,
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(result!.graphResults).sort()).to.eql(["deploy.service-a", "deploy.service-b"])
  })

  it("should skip services set in the --skip option", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    await garden.scanAndAddConfigs()

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        names: undefined,
      },
      opts: {
        ...defaultDeployOpts,
        skip: ["service-b"],
      },
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).includes("deploy.service-b")).to.be.false
  })

  describe("isPersistent", () => {
    it("should return persistent=true if --sync is set", async () => {
      const cmd = new DeployCommand()
      const log = getRootLogger().createLog()
      const persistent = cmd.maybePersistent({
        log,
        args: {
          names: undefined,
        },
        opts: {
          ...defaultDeployOpts,
          sync: [],
        },
      })
      expect(persistent).to.be.true
    })

    it("should return persistent=true if --forward is set", async () => {
      const cmd = new DeployCommand()
      const log = getRootLogger().createLog()
      const persistent = cmd.maybePersistent({
        log,
        args: {
          names: undefined,
        },
        opts: {
          ...defaultDeployOpts,
          forward: true,
        },
      })
      expect(persistent).to.be.true
    })
  })
})
