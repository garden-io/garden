import { join } from "path"
import { Garden } from "../../../src/garden"
import { DeployCommand } from "../../../src/commands/deploy"
import { expect } from "chai"
import { validateContainerModule } from "../../../src/plugins/container"
import { buildGenericModule } from "../../../src/plugins/generic"
import {
  PluginFactory,
} from "../../../src/types/plugin/plugin"
import {
  DeployServiceParams,
  GetServiceStatusParams,
  RunWorkflowParams,
} from "../../../src/types/plugin/params"
import { ServiceState, ServiceStatus } from "../../../src/types/service"
import { taskResultOutputs } from "../../helpers"
import { RunWorkflowResult } from "../../../src/types/plugin/outputs"

const placeholderTimestamp = new Date()

const placeholderWorkflowResult = (moduleName, workflowName, command) => ({
  moduleName,
  workflowName,
  command,
  version: {
    versionString: "1",
    dirtyTimestamp: null,
    dependencyVersions: {},
  },
  success: true,
  startedAt: placeholderTimestamp,
  completedAt: placeholderTimestamp,
  output: "out",
})

const workflowResultA = placeholderWorkflowResult("module-a", "workflow-a", ["echo", "A"])
const workflowResultC = placeholderWorkflowResult("module-c", "workflow-c", ["echo", "C"])

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
    },
    "service-c": {
      state: "ready",
    },
  }

  const getServiceStatus = async ({ service }: GetServiceStatusParams): Promise<ServiceStatus> => {
    return testStatuses[service.name] || {}
  }

  const deployService = async ({ service }: DeployServiceParams) => {
    const newStatus = {
      version: "1",
      state: <ServiceState>"ready",
    }

    testStatuses[service.name] = newStatus

    return newStatus
  }

  const runWorkflow = async ({ workflow }: RunWorkflowParams): Promise<RunWorkflowResult> => {
    return placeholderWorkflowResult(workflow.module.name, workflow.name, workflow.spec.command)
  }

  return {
    moduleActions: {
      container: {
        validate: validateContainerModule,
        build: buildGenericModule,
        deployService,
        getServiceStatus,
        runWorkflow,
      },
    },
  }
}

describe("DeployCommand", () => {
  const projectRootB = join(__dirname, "..", "..", "data", "test-project-b")
  const plugins = { "test-plugin": testProvider }

  // TODO: Verify that services don't get redeployed when same version is already deployed.
  // TODO: Test with --watch flag

  it("should build and deploy all modules in a project", async () => {
    const garden = await Garden.factory(projectRootB, { plugins })
    const command = new DeployCommand()

    const { result } = await command.action({
      garden,
      args: {
        service: undefined,
      },
      opts: {
        "hot-reload": undefined,
        watch: false,
        force: false,
        "force-build": true,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
      "workflow.workflow-a": workflowResultA,
      "workflow.workflow-c": workflowResultC,
      "deploy.service-a": { version: "1", state: "ready" },
      "deploy.service-b": { version: "1", state: "ready" },
      "deploy.service-c": { version: "1", state: "ready" },
      "deploy.service-d": { version: "1", state: "ready" },
      "push.module-a": { pushed: false },
      "push.module-b": { pushed: false },
      "push.module-c": { pushed: false },
    })
  })

  it("should optionally build and deploy single service and its dependencies", async () => {
    const garden = await Garden.factory(projectRootB, { plugins })
    const command = new DeployCommand()

    const { result } = await command.action({
      garden,
      args: {
        service: ["service-b"],
      },
      opts: {
        "hot-reload": undefined,
        watch: false,
        force: false,
        "force-build": true,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
      "workflow.workflow-a": workflowResultA,
      "workflow.workflow-c": workflowResultC,
      "deploy.service-a": { version: "1", state: "ready" },
      "deploy.service-b": { version: "1", state: "ready" },
      "push.module-a": { pushed: false },
      "push.module-b": { pushed: false },
    })
  })
})
