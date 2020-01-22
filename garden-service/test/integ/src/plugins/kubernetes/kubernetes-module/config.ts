import { resolve } from "path"
import { expect } from "chai"
import { cloneDeep } from "lodash"

import { TestGarden, dataDir, makeTestGarden } from "../../../../../helpers"
import { PluginContext } from "../../../../../../src/plugin-context"
import { ModuleConfig } from "../../../../../../src/config/module"
import { apply } from "json-merge-patch"

describe("validateKubernetesModule", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let moduleConfigs: { [key: string]: ModuleConfig }

  before(async () => {
    const projectRoot = resolve(dataDir, "test-projects", "kubernetes-module")
    garden = await makeTestGarden(projectRoot)
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

  it("should validate a Kubernetes module", async () => {
    const config = await garden.resolveModuleConfig(garden.log, "module-simple")

    expect(config).to.eql({
      allowPublish: true,
      apiVersion: "garden.io/v0",
      build: {
        dependencies: [],
      },
      configPath: resolve(ctx.projectRoot, "module-simple", "garden.yml"),
      description: "Simple Kubernetes module with minimum config",
      disabled: false,
      exclude: undefined,
      include: [],
      kind: "Module",
      name: "module-simple",
      outputs: {},
      path: resolve(ctx.projectRoot, "module-simple"),
      repositoryUrl: undefined,
      serviceConfigs: [
        {
          dependencies: [],
          disabled: false,
          hotReloadable: false,
          name: "module-simple",
          spec: {
            build: {
              dependencies: [],
            },
            dependencies: [],
            files: [],
            manifests: [
              {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                  labels: {
                    app: "busybox",
                  },
                  name: "busybox-deployment",
                },
                spec: {
                  replicas: 1,
                  selector: {
                    matchLabels: {
                      app: "busybox",
                    },
                  },
                  template: {
                    metadata: {
                      labels: {
                        app: "busybox",
                      },
                    },
                    spec: {
                      containers: [
                        {
                          image: "busybox:1.31.1",
                          name: "busybox",
                          ports: [
                            {
                              containerPort: 80,
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ],
      spec: {
        build: {
          dependencies: [],
        },
        dependencies: [],
        files: [],
        manifests: [
          {
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: {
              labels: {
                app: "busybox",
              },
              name: "busybox-deployment",
            },
            spec: {
              replicas: 1,
              selector: {
                matchLabels: {
                  app: "busybox",
                },
              },
              template: {
                metadata: {
                  labels: {
                    app: "busybox",
                  },
                },
                spec: {
                  containers: [
                    {
                      image: "busybox:1.31.1",
                      name: "busybox",
                      ports: [
                        {
                          containerPort: 80,
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      taskConfigs: [],
      testConfigs: [],
      type: "kubernetes",
    })
  })

  it("should set include to equal files if neither include nor exclude has been set", async () => {
    patchModuleConfig("module-simple", { spec: { files: ["manifest.yaml"] } })
    const configInclude = await garden.resolveModuleConfig(garden.log, "module-simple")
    expect(configInclude.include).to.eql(["manifest.yaml"])
  })

  it("should not set default includes if include has already been explicitly set", async () => {
    patchModuleConfig("module-simple", { include: ["foo"] })
    const configInclude = await garden.resolveModuleConfig(garden.log, "module-simple")
    expect(configInclude.include).to.eql(["foo"])
  })

  it("should not set default includes if exclude has already been explicitly set", async () => {
    patchModuleConfig("module-simple", { exclude: ["bar"] })
    const configExclude = await garden.resolveModuleConfig(garden.log, "module-simple")
    expect(configExclude.include).to.be.undefined
  })
})
