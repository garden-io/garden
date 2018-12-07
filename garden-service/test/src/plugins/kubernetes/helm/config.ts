import { resolve } from "path"
import { expect } from "chai"

import { TestGarden, dataDir, makeTestGarden, expectError } from "../../../../helpers"
import { PluginContext } from "../../../../../src/plugin-context"
import { validateHelmModule } from "../../../../../src/plugins/kubernetes/helm/config"
import { cloneDeep } from "lodash"
import { deline } from "../../../../../src/util/string"

describe("validateHelmModule", () => {
  let garden: TestGarden
  let ctx: PluginContext

  before(async () => {
    const projectRoot = resolve(dataDir, "test-projects", "helm")
    garden = await makeTestGarden(projectRoot)
    ctx = garden.getPluginContext("local-kubernetes")
    await garden.getModules()
  })

  after(async () => {
    await garden.close()
  })

  it("should validate a Helm module", async () => {
    const moduleConfig = (<any>garden).moduleConfigs["api"]
    const config = await validateHelmModule({ ctx, moduleConfig })
    const imageModule = await garden.getModule("api-image")
    const { versionString } = imageModule.version

    expect(config).to.eql({
      allowPublish: true,
      build: {
        dependencies: [
          {
            name: "api-image",
            copy: [],
          },
        ],
        command: [],
      },
      description: "The API backend for the voting UI",
      name: "api",
      path: resolve(ctx.projectRoot, "api"),
      repositoryUrl: undefined,
      serviceConfigs: [
        {
          name: "api",
          dependencies: [],
          outputs: {},
          sourceModuleName: "api-image",
          spec: {
            chart: undefined,
            chartPath: ".",
            values: {
              image: {
                tag: versionString,
              },
              ingress: {
                enabled: true,
                paths: [
                  "/",
                ],
                hosts: [
                  "api.local.app.garden",
                ],
              },
            },
            dependencies: [],
            tasks: [],
            tests: [],
            version: undefined,
          },
        },
      ],
      spec: {
        serviceResource: {
          kind: "Deployment",
          containerModule: "api-image",
        },
        values: {
          image: {
            tag: versionString,
          },
          ingress: {
            enabled: true,
            paths: [
              "/",
            ],
            hosts: [
              "api.local.app.garden",
            ],
          },
        },
        chartPath: ".",
        dependencies: [],
        tasks: [],
        tests: [],
      },
      testConfigs: [],
      type: "helm",
      variables: {},
      taskConfigs: [],
    })
  })

  it("should throw if chart contains no sources and doesn't specify chart name", async () => {
    const moduleConfig = cloneDeep((<any>garden).moduleConfigs["postgres"])
    delete moduleConfig.spec.chart
    await expectError(
      () => validateHelmModule({ ctx, moduleConfig }),
      err => expect(err.message).to.equal(deline`
        Chart neither specifies a chart name, nor contains chart sources at \`chartPath\`.
      `),
    )
  })

  it("should throw if a task doesn't specify resource and no serviceResource is specified", async () => {
    const moduleConfig = cloneDeep((<any>garden).moduleConfigs["api"])
    delete moduleConfig.spec.serviceResource
    moduleConfig.spec.tasks = [{
      name: "foo",
      args: ["foo"],
    }]
    await expectError(
      () => validateHelmModule({ ctx, moduleConfig }),
      err => expect(err.message).to.equal(deline`
        Task 'foo' in Helm module 'api' does not specify a target resource, and the module does not specify a
        \`serviceResource\` (which would be used by default).
        Please configure either of those for the configuration to be valid.
      `),
    )
  })

  it("should throw if a test doesn't specify resource and no serviceResource is specified", async () => {
    const moduleConfig = cloneDeep((<any>garden).moduleConfigs["api"])
    delete moduleConfig.spec.serviceResource
    moduleConfig.spec.tests = [{
      name: "foo",
      args: ["foo"],
    }]
    await expectError(
      () => validateHelmModule({ ctx, moduleConfig }),
      err => expect(err.message).to.equal(deline`
        Test suite 'foo' in Helm module 'api' does not specify a target resource, and the module does not specify a
        \`serviceResource\` (which would be used by default).
        Please configure either of those for the configuration to be valid.
      `),
    )
  })
})
