import { join } from "path"
import { Garden } from "../../../../src/garden"
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

const testProvider = () =>
  createGardenPlugin(() => {
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

    const getServiceStatus = async ({ service }: GetServiceStatusParams): Promise<ServiceStatus> => {
      return testStatuses[service.name] || { state: "unknown", detail: {} }
    }

    const deployService = async ({ service }: DeployServiceParams) => {
      const newStatus = {
        version: "1",
        state: <ServiceState>"ready",
        detail: {},
      }

      testStatuses[service.name] = newStatus

      return newStatus
    }

    const runTask = async ({ task }: RunTaskParams): Promise<RunTaskResult> => {
      return placeholderTaskResult(task.module.name, task.name, task.spec.command)
    }

    return {
      name: "test-plugin",
      createModuleTypes: [
        {
          name: "test",
          docs: "Test plugin",
          schema: testModuleSpecSchema,
          handlers: {
            configure: configureTestModule,
            build: buildExecModule,
            deployService,
            getServiceStatus,
            runTask,
          },
        },
      ],
    }
  })

describe("DeployCommand", () => {
  const plugins = [testProvider()]
  const projectRootB = join(dataDir, "test-project-b")

  // TODO: Verify that services don't get redeployed when same version is already deployed.
  // TODO: Test with --watch flag

  it("should build and deploy all modules in a project", async () => {
    const garden = await Garden.factory(projectRootB, { plugins })
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

    if (errors) {
      throw errors[0]
    }

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
  })

  it("should optionally build and deploy single service and its dependencies", async () => {
    const garden = await Garden.factory(projectRootB, { plugins })
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
    const garden = await Garden.factory(projectRootB, { plugins })
    const log = garden.log
    const command = new DeployCommand()

    await garden.scanModules()
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
    const garden = await Garden.factory(projectRootB, { plugins })
    const log = garden.log
    const command = new DeployCommand()

    await garden.scanModules()
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
