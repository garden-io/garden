import { join } from "path"
import { Garden } from "../../../../src/garden"
import { DeployCommand } from "../../../../src/commands/deploy"
import { expect } from "chai"
import { buildExecModule } from "../../../../src/plugins/exec"
import { PluginFactory } from "../../../../src/types/plugin/plugin"
import { ServiceState, ServiceStatus } from "../../../../src/types/service"
import { taskResultOutputs, configureTestModule, withDefaultGlobalOpts, dataDir } from "../../../helpers"
import { GetServiceStatusParams } from "../../../../src/types/plugin/service/getServiceStatus"
import { DeployServiceParams } from "../../../../src/types/plugin/service/deployService"
import { RunTaskParams, RunTaskResult } from "../../../../src/types/plugin/task/runTask"

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

const taskResultA = placeholderTaskResult("module-a", "task-a", ["echo", "A"])
const taskResultC = placeholderTaskResult("module-c", "task-c", ["echo", "C"])

const testProvider: PluginFactory = () => {
  const testStatuses: { [key: string]: ServiceStatus } = {
    "service-a": {
      state: "ready",
      ingresses: [{
        hostname: "service-a.test-project-b.local.app.garden",
        path: "/path-a",
        port: 80,
        protocol: "http",
      }],
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
    moduleActions: {
      test: {
        configure: configureTestModule,
        build: buildExecModule,
        deployService,
        getServiceStatus,
        runTask,
      },
    },
  }
}

describe("DeployCommand", () => {
  const projectRootB = join(dataDir, "test-project-b")
  const plugins = { "test-plugin": testProvider }

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

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
      "get-task-result.task-a": null,
      "get-task-result.task-c": null,
      "task.task-a": taskResultA,
      "task.task-c": taskResultC,
      "get-service-status.service-a": {
        forwardablePorts: [],
        ingresses: [
          {
            hostname: "service-a.test-project-b.local.app.garden",
            path: "/path-a",
            port: 80,
            protocol: "http",
          },
        ],
        state: "ready",
        detail: {},
      },
      "get-service-status.service-b": {
        forwardablePorts: [],
        state: "unknown",
        detail: {},
      },
      "get-service-status.service-c": {
        forwardablePorts: [],
        state: "ready",
        detail: {},
      },
      "get-service-status.service-d": {
        forwardablePorts: [],
        state: "unknown",
        detail: {},
      },
      "deploy.service-a": { forwardablePorts: [], version: "1", state: "ready", detail: {} },
      "deploy.service-b": { forwardablePorts: [], version: "1", state: "ready", detail: {} },
      "deploy.service-c": { forwardablePorts: [], version: "1", state: "ready", detail: {} },
      "deploy.service-d": { forwardablePorts: [], version: "1", state: "ready", detail: {} },
    })
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

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
      "get-task-result.task-a": null,
      "get-task-result.task-c": null,
      "task.task-a": taskResultA,
      "task.task-c": taskResultC,
      "get-service-status.service-a": {
        forwardablePorts: [],
        ingresses: [
          {
            hostname: "service-a.test-project-b.local.app.garden",
            path: "/path-a",
            port: 80,
            protocol: "http",
          },
        ],
        state: "ready",
        detail: {},
      },
      "get-service-status.service-b": {
        forwardablePorts: [],
        state: "unknown",
        detail: {},
      },
      "deploy.service-a": { forwardablePorts: [], version: "1", state: "ready", detail: {} },
      "deploy.service-b": { forwardablePorts: [], version: "1", state: "ready", detail: {} },
    })
  })
})
