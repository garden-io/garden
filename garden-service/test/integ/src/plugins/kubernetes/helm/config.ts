import { resolve } from "path"
import { expect } from "chai"
import { cloneDeep } from "lodash"

import { TestGarden, expectError } from "../../../../../helpers"
import { PluginContext } from "../../../../../../src/plugin-context"
import { deline } from "../../../../../../src/util/string"
import { ModuleConfig } from "../../../../../../src/config/module"
import { apply } from "json-merge-patch"
import { getHelmTestGarden } from "./common"
import { defaultHelmTimeout } from "../../../../../../src/plugins/kubernetes/helm/config"

describe("validateHelmModule", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let moduleConfigs: { [key: string]: ModuleConfig }

  before(async () => {
    garden = await getHelmTestGarden()
    const provider = await garden.resolveProvider("local-kubernetes")
    ctx = garden.getPluginContext(provider)
    await garden["resolveModuleConfigs"](garden.log)
    moduleConfigs = cloneDeep((<any>garden).moduleConfigs)
  })

  afterEach(() => {
    garden["moduleConfigs"] = cloneDeep(moduleConfigs)
  })

  function patchModuleConfig(name: string, patch: any) {
    apply((<any>garden).moduleConfigs[name], patch)
  }

  it("should validate a Helm module", async () => {
    const config = await garden.resolveModuleConfig(garden.log, "api")
    const graph = await garden.getConfigGraph(garden.log)
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
      disabled: false,
      include: ["*", "charts/**/*", "templates/**/*"],
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
          disabled: false,
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
            timeout: defaultHelmTimeout,
            values: {
              image: {
                tag: versionString,
              },
              ingress: {
                enabled: true,
                paths: ["/"],
                hosts: ["api.local.app.garden"],
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
        timeout: defaultHelmTimeout,
        values: {
          image: {
            tag: versionString,
          },
          ingress: {
            enabled: true,
            paths: ["/"],
            hosts: ["api.local.app.garden"],
          },
        },
        valueFiles: [],
      },
      testConfigs: [],
      type: "helm",
      taskConfigs: [],
    })
  })

  it("should not set default includes if include has already been explicitly set", async () => {
    patchModuleConfig("api", { include: ["foo"] })
    const configInclude = await garden.resolveModuleConfig(garden.log, "api")
    expect(configInclude.include).to.eql(["foo"])
  })

  it("should not set default includes if exclude has already been explicitly set", async () => {
    patchModuleConfig("api", { exclude: ["bar"] })
    const configExclude = await garden.resolveModuleConfig(garden.log, "api")
    expect(configExclude.include).to.be.undefined
  })

  it("should set include to empty if module does not have local chart sources", async () => {
    // So that Chart.yaml isn't found
    patchModuleConfig("api", { spec: { chartPath: "invalid-path" } })
    const config = await garden.resolveModuleConfig(garden.log, "api")
    expect(config.include).to.eql([])
  })

  it("should not return a serviceConfig if skipDeploy=true", async () => {
    patchModuleConfig("api", { spec: { skipDeploy: true } })
    const config = await garden.resolveModuleConfig(garden.log, "api")

    expect(config.serviceConfigs).to.eql([])
  })

  it("should add the module specified under 'base' as a build dependency", async () => {
    patchModuleConfig("postgres", { spec: { base: "foo" } })
    const config = await garden.resolveModuleConfig(garden.log, "postgres")

    expect(config.build.dependencies).to.eql([{ name: "foo", copy: [{ source: "*", target: "." }] }])
  })

  it("should add copy spec to build dependency if it's already a dependency", async () => {
    patchModuleConfig("postgres", {
      build: { dependencies: [{ name: "foo", copy: [] }] },
      spec: { base: "foo" },
    })
    const config = await garden.resolveModuleConfig(garden.log, "postgres")

    expect(config.build.dependencies).to.eql([{ name: "foo", copy: [{ source: "*", target: "." }] }])
  })

  it("should add module specified under tasks[].resource.containerModule as a build dependency", async () => {
    patchModuleConfig("api", {
      spec: {
        tasks: [
          {
            name: "my-task",
            resource: { kind: "Deployment", containerModule: "foo" },
          },
        ],
      },
    })
    const config = await garden.resolveModuleConfig(garden.log, "api")

    expect(config.build.dependencies).to.eql([{ name: "foo", copy: [] }])
  })

  it("should add module specified under tests[].resource.containerModule as a build dependency", async () => {
    patchModuleConfig("api", {
      spec: {
        tests: [
          {
            name: "my-task",
            resource: { kind: "Deployment", containerModule: "foo" },
          },
        ],
      },
    })
    const config = await garden.resolveModuleConfig(garden.log, "api")

    expect(config.build.dependencies).to.eql([{ name: "foo", copy: [] }])
  })

  it("should throw if chart both contains sources and specifies base", async () => {
    patchModuleConfig("api", { spec: { base: "foo" } })

    await expectError(
      () => garden.resolveModuleConfig(garden.log, "api"),
      (err) =>
        expect(err.message).to.equal(deline`
        Helm module 'api' both contains sources and specifies a base module.
        Since Helm charts cannot currently be merged, please either remove the sources or
        the \`base\` reference in your module config.
      `)
    )
  })
})
