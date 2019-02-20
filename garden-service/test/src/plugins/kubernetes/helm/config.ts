import { resolve } from "path"
import { expect } from "chai"
import { cloneDeep } from "lodash"

import { TestGarden, dataDir, makeTestGarden, expectError } from "../../../../helpers"
import { PluginContext } from "../../../../../src/plugin-context"
import { validateHelmModule } from "../../../../../src/plugins/kubernetes/helm/config"
import { deline } from "../../../../../src/util/string"
import { LogEntry } from "../../../../../src/logger/log-entry"

describe("validateHelmModule", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let log: LogEntry

  before(async () => {
    const projectRoot = resolve(dataDir, "test-projects", "helm")
    garden = await makeTestGarden(projectRoot)
    log = garden.log
    ctx = garden.getPluginContext("local-kubernetes")
    await garden.resolveModuleConfigs()
  })

  after(async () => {
    await garden.close()
  })

  function getModuleConfig(name: string) {
    const config = cloneDeep((<any>garden).moduleConfigs[name])
    config.serviceConfigs = []
    config.taskConfigs = []
    config.testConfigs = []
    return config
  }

  it("should validate a Helm module", async () => {
    const config = await garden.resolveModuleConfig("api")
    const graph = await garden.getConfigGraph()
    const imageModule = await graph.getModule("api-image")
    const { versionString } = imageModule.version

    expect(config).to.eql({
      allowPublish: true,
      build: {
        dependencies: [],
        command: [],
      },
      description: "The API backend for the voting UI",
      apiVersion: "garden.io/v0",
      name: "api",
      outputs: {
        "release-name": "api-release",
      },
      path: resolve(ctx.projectRoot, "api"),
      repositoryUrl: undefined,
      serviceConfigs: [
        {
          name: "api",
          dependencies: [],
          outputs: {},
          sourceModuleName: "api-image",
          spec: {
            chartPath: ".",
            dependencies: [],
            releaseName: "api-release",
            serviceResource: {
              kind: "Deployment",
              containerModule: "api-image",
            },
            skipDeploy: false,
            tasks: [],
            tests: [],
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
          },
        },
      ],
      spec: {
        chartPath: ".",
        dependencies: [],
        releaseName: "api-release",
        serviceResource: {
          kind: "Deployment",
          containerModule: "api-image",
        },
        skipDeploy: false,
        tasks: [],
        tests: [],
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
      },
      testConfigs: [],
      type: "helm",
      taskConfigs: [],
    })
  })

  it("should not return a serviceConfig if skipDeploy=true", async () => {
    const moduleConfig = getModuleConfig("api")
    moduleConfig.spec.skipDeploy = true
    const config = await validateHelmModule({ ctx, moduleConfig, log })

    expect(config.serviceConfigs).to.eql([])
  })

  it("should add the module specified under 'base' as a build dependency", async () => {
    const moduleConfig = getModuleConfig("postgres")
    moduleConfig.spec.base = "foo"
    const config = await validateHelmModule({ ctx, moduleConfig, log })

    expect(config.build.dependencies).to.eql([
      { name: "foo", copy: [{ source: "*", target: "." }] },
    ])
  })

  it("should add copy spec to build dependency if it's already a dependency", async () => {
    const moduleConfig = getModuleConfig("postgres")
    moduleConfig.build.dependencies = [{ name: "foo", copy: [] }]
    moduleConfig.spec.base = "foo"
    const config = await validateHelmModule({ ctx, moduleConfig, log })

    expect(config.build.dependencies).to.eql([
      { name: "foo", copy: [{ source: "*", target: "." }] },
    ])
  })

  it("should add module specified under tasks[].resource.containerModule as a build dependency", async () => {
    const moduleConfig = getModuleConfig("api")
    moduleConfig.spec.tasks = [
      { name: "my-task", resource: { kind: "Deployment", containerModule: "foo" } },
    ]
    const config = await validateHelmModule({ ctx, moduleConfig, log })

    expect(config.build.dependencies).to.eql([
      { name: "foo", copy: [] },
    ])
  })

  it("should add module specified under tests[].resource.containerModule as a build dependency", async () => {
    const moduleConfig = getModuleConfig("api")
    moduleConfig.spec.tests = [
      { name: "my-task", resource: { kind: "Deployment", containerModule: "foo" } },
    ]
    const config = await validateHelmModule({ ctx, moduleConfig, log })

    expect(config.build.dependencies).to.eql([
      { name: "foo", copy: [] },
    ])
  })

  it("should throw if chart both contains sources and specifies base", async () => {
    const moduleConfig = getModuleConfig("api")
    moduleConfig.spec.base = "foo"
    await expectError(
      () => validateHelmModule({ ctx, moduleConfig, log }),
      err => expect(err.message).to.equal(deline`
        Helm module 'api' both contains sources and specifies a base module.
        Since Helm charts cannot currently be merged, please either remove the sources or
        the \`base\` reference in your module config.
      `),
    )
  })

  it("should throw if chart contains no sources and doesn't specify chart name nor base", async () => {
    const moduleConfig = getModuleConfig("postgres")
    delete moduleConfig.spec.chart
    await expectError(
      () => validateHelmModule({ ctx, moduleConfig, log }),
      err => expect(err.message).to.equal(deline`
        Chart neither specifies a chart name, base module, nor contains chart sources at \`chartPath\`.
      `),
    )
  })
})
