import { resolve } from "path"
import { expect } from "chai"
import { cloneDeep } from "lodash"

import { TestGarden, expectError } from "../../../../../helpers"
import { PluginContext } from "../../../../../../src/plugin-context"
import { deline } from "../../../../../../src/util/string"
import { ModuleConfig } from "../../../../../../src/config/module"
import { apply } from "json-merge-patch"
import { getHelmTestGarden } from "./common"

describe("validateHelmModule", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let moduleConfigs: { [key: string]: ModuleConfig }

  before(async () => {
    garden = await getHelmTestGarden()
    const provider = await garden.resolveProvider("local-kubernetes")
    ctx = await garden.getPluginContext(provider)
    await garden.resolveModuleConfigs()
    moduleConfigs = cloneDeep((<any>garden).moduleConfigs)
  })

  beforeEach(() => {
    (<any>garden).moduleConfigs = cloneDeep(moduleConfigs)
  })

  after(async () => {
    await garden.close()
  })

  function patchModuleConfig(name: string, patch: any) {
    apply((<any>garden).moduleConfigs[name], patch)
  }

  it("should validate a Helm module", async () => {
    const config = await garden.resolveModuleConfig("api")
    const graph = await garden.getConfigGraph()
    const imageModule = await graph.getModule("api-image")
    const { versionString } = imageModule.version

    expect(config).to.eql({
      apiVersion: "garden.io/v0",
      kind: "Module",
      allowPublish: true,
      build: {
        dependencies: [],
      },
      configPath: resolve(ctx.projectRoot, "api", "garden.yml"),
      description: "The API backend for the voting UI",
      include: undefined,
      exclude: undefined,
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
          hotReloadable: true,
          sourceModuleName: "api-image",
          spec: {
            build: {
              dependencies: [],
            },
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
            valueFiles: [],
          },
        },
      ],
      spec: {
        build: {
          dependencies: [],
        },
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
        valueFiles: [],
      },
      testConfigs: [],
      type: "helm",
      taskConfigs: [],
    })
  })

  it("should not return a serviceConfig if skipDeploy=true", async () => {
    patchModuleConfig("api", { spec: { skipDeploy: true } })
    const config = await garden.resolveModuleConfig("api")

    expect(config.serviceConfigs).to.eql([])
  })

  it("should add the module specified under 'base' as a build dependency", async () => {
    patchModuleConfig("postgres", { spec: { base: "foo" } })
    const config = await garden.resolveModuleConfig("postgres")

    expect(config.build.dependencies).to.eql([
      { name: "foo", copy: [{ source: "*", target: "." }] },
    ])
  })

  it("should add copy spec to build dependency if it's already a dependency", async () => {
    patchModuleConfig("postgres", {
      build: { dependencies: [{ name: "foo", copy: [] }] },
      spec: { base: "foo" },
    })
    const config = await garden.resolveModuleConfig("postgres")

    expect(config.build.dependencies).to.eql([
      { name: "foo", copy: [{ source: "*", target: "." }] },
    ])
  })

  it("should add module specified under tasks[].resource.containerModule as a build dependency", async () => {
    patchModuleConfig("api", {
      spec: {
        tasks: [
          { name: "my-task", resource: { kind: "Deployment", containerModule: "foo" } },
        ],
      },
    })
    const config = await garden.resolveModuleConfig("api")

    expect(config.build.dependencies).to.eql([
      { name: "foo", copy: [] },
    ])
  })

  it("should add module specified under tests[].resource.containerModule as a build dependency", async () => {
    patchModuleConfig("api", {
      spec: {
        tests: [
          { name: "my-task", resource: { kind: "Deployment", containerModule: "foo" } },
        ],
      },
    })
    const config = await garden.resolveModuleConfig("api")

    expect(config.build.dependencies).to.eql([
      { name: "foo", copy: [] },
    ])
  })

  it("should throw if chart both contains sources and specifies base", async () => {
    patchModuleConfig("api", { spec: { base: "foo" } })

    await expectError(
      () => garden.resolveModuleConfig("api"),
      err => expect(err.message).to.equal(deline`
        Helm module 'api' both contains sources and specifies a base module.
        Since Helm charts cannot currently be merged, please either remove the sources or
        the \`base\` reference in your module config.
      `),
    )
  })

  it("should throw if chart contains no sources and doesn't specify chart name nor base", async () => {
    patchModuleConfig("postgres", { spec: { chart: null } })

    await expectError(
      () => garden.resolveModuleConfig("postgres"),
      err => expect(err.message).to.equal(deline`
        Chart neither specifies a chart name, base module, nor contains chart sources at \`chartPath\`.
      `),
    )
  })
})
