import { TestGarden, makeTestGarden, dataDir, expectError } from "../../../../../helpers"
import { resolve } from "path"
import { expect } from "chai"
import { first } from "lodash"

import {
  containsSource,
  getChartResources,
  getChartPath,
  getReleaseName,
  getValuesPath,
  findServiceResource,
  getResourceContainer,
  getBaseModule,
} from "../../../../../../src/plugins/kubernetes/helm/common"
import { PluginContext } from "../../../../../../src/plugin-context"
import { LogEntry } from "../../../../../../src/logger/log-entry"
import { BuildTask } from "../../../../../../src/tasks/build"
import { find } from "lodash"
import { deline } from "../../../../../../src/util/string"
import { HotReloadableResource } from "../../../../../../src/plugins/kubernetes/hot-reload"
import { getServiceResourceSpec } from "../../../../../../src/plugins/kubernetes/helm/common"
import { ConfigGraph } from "../../../../../../src/config-graph"

describe("Helm common functions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let ctx: PluginContext
  let log: LogEntry

  before(async () => {
    const projectRoot = resolve(dataDir, "test-projects", "helm")
    garden = await makeTestGarden(projectRoot)
    graph = await garden.getConfigGraph()
    ctx = garden.getPluginContext("local-kubernetes")
    log = garden.log
    await buildModules()
  })

  after(async () => {
    await garden.close()
  })

  async function buildModules() {
    const modules = await graph.getModules()
    const tasks = modules.map(module => new BuildTask({ garden, log, module, force: false }))
    const results = await garden.processTasks(tasks)

    const err = first(Object.values(results).map(r => r.error))

    if (err) {
      throw err
    }
  }

  describe("containsSource", () => {
    it("should return true if the specified module contains chart sources", async () => {
      const module = await graph.getModule("api")
      expect(await containsSource(module)).to.be.true
    })

    it("should return false if the specified module does not contain chart sources", async () => {
      const module = await graph.getModule("postgres")
      expect(await containsSource(module)).to.be.false
    })
  })

  describe("getChartResources", () => {
    it("should render and return resources for a local template", async () => {
      const module = await graph.getModule("api")
      const imageModule = await graph.getModule("api-image")
      const resources = await getChartResources(ctx, module, log)

      expect(resources).to.eql([
        {
          apiVersion: "v1",
          kind: "Service",
          metadata: {
            name: "api-release",
            labels: {
              "app.kubernetes.io/name": "api",
              "helm.sh/chart": "api-0.1.0",
              "app.kubernetes.io/instance": "api-release",
              "app.kubernetes.io/managed-by": "Tiller",
            },
            annotations: {},
          },
          spec: {
            type: "ClusterIP",
            ports: [
              {
                port: 80,
                targetPort: "http",
                protocol: "TCP",
                name: "http",
              },
            ],
            selector: {
              "app.kubernetes.io/name": "api",
              "app.kubernetes.io/instance": "api-release",
            },
          },
        },
        {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            name: "api-release",
            labels: {
              "app.kubernetes.io/name": "api",
              "helm.sh/chart": "api-0.1.0",
              "app.kubernetes.io/instance": "api-release",
              "app.kubernetes.io/managed-by": "Tiller",
            },
            annotations: {},
          },
          spec: {
            replicas: 1,
            selector: {
              matchLabels: {
                "app.kubernetes.io/name": "api",
                "app.kubernetes.io/instance": "api-release",
              },
            },
            template: {
              metadata: {
                labels: {
                  "app.kubernetes.io/name": "api",
                  "app.kubernetes.io/instance": "api-release",
                },
              },
              spec: {
                containers: [
                  {
                    name: "api",
                    image: "api-image:" + imageModule.version.versionString,
                    imagePullPolicy: "IfNotPresent",
                    args: [
                      "python",
                      "app.py",
                    ],
                    ports: [
                      {
                        name: "http",
                        containerPort: 80,
                        protocol: "TCP",
                      },
                    ],
                    resources: {},
                  },
                ],
              },
            },
          },
        },
        {
          apiVersion: "extensions/v1beta1",
          kind: "Ingress",
          metadata: {
            name: "api-release",
            labels: {
              "app.kubernetes.io/name": "api",
              "helm.sh/chart": "api-0.1.0",
              "app.kubernetes.io/instance": "api-release",
              "app.kubernetes.io/managed-by": "Tiller",
            },
            annotations: {},
          },
          spec: {
            rules: [
              {
                host: "api.local.app.garden",
                http: {
                  paths: [
                    {
                      path: "/",
                      backend: {
                        serviceName: "api-release",
                        servicePort: "http",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ])
    })

    it("should render and return resources for a remote template", async () => {
      const module = await graph.getModule("postgres")
      const resources = await getChartResources(ctx, module, log)

      expect(resources).to.eql([
        {
          apiVersion: "v1",
          kind: "Secret",
          metadata: {
            name: "postgres",
            labels: {
              app: "postgresql",
              chart: "postgresql-3.9.2",
              release: "postgres",
              heritage: "Tiller",
            },
            annotations: {},
          },
          type: "Opaque",
          data: {
            "postgresql-password": "cG9zdGdyZXM=",
          },
        },
        {
          apiVersion: "v1",
          kind: "Service",
          metadata: {
            name: "postgres-headless",
            labels: {
              app: "postgresql",
              chart: "postgresql-3.9.2",
              release: "postgres",
              heritage: "Tiller",
            },
            annotations: {},
          },
          spec: {
            type: "ClusterIP",
            clusterIP: "None",
            ports: [
              {
                name: "postgresql",
                port: 5432,
                targetPort: "postgresql",
              },
            ],
            selector: {
              app: "postgresql",
              release: "postgres",
            },
          },
        },
        {
          apiVersion: "v1",
          kind: "Service",
          metadata: {
            name: "postgres",
            labels: {
              app: "postgresql",
              chart: "postgresql-3.9.2",
              release: "postgres",
              heritage: "Tiller",
            },
            annotations: {},
          },
          spec: {
            type: "ClusterIP",
            ports: [
              {
                name: "postgresql",
                port: 5432,
                targetPort: "postgresql",
              },
            ],
            selector: {
              app: "postgresql",
              release: "postgres",
              role: "master",
            },
          },
        },
        {
          apiVersion: "apps/v1beta2",
          kind: "StatefulSet",
          metadata: {
            name: "postgres",
            labels: {
              app: "postgresql",
              chart: "postgresql-3.9.2",
              release: "postgres",
              heritage: "Tiller",
            },
            annotations: {},
          },
          spec: {
            serviceName: "postgres-headless",
            replicas: 1,
            updateStrategy: {
              type: "RollingUpdate",
            },
            selector: {
              matchLabels: {
                app: "postgresql",
                release: "postgres",
                role: "master",
              },
            },
            template: {
              metadata: {
                name: "postgres",
                labels: {
                  app: "postgresql",
                  chart: "postgresql-3.9.2",
                  release: "postgres",
                  heritage: "Tiller",
                  role: "master",
                },
              },
              spec: {
                securityContext: {
                  fsGroup: 1001,
                  runAsUser: 1001,
                },
                initContainers: [
                  {
                    name: "init-chmod-data",
                    image: "docker.io/bitnami/minideb:latest",
                    imagePullPolicy: "Always",
                    resources: {
                      requests: {
                        cpu: "250m",
                        memory: "256Mi",
                      },
                    },
                    command: [
                      "sh",
                      "-c",
                      "chown -R 1001:1001 /bitnami\nif [ -d /bitnami/postgresql/data ]; then\n  " +
                      "chmod  0700 /bitnami/postgresql/data;\nfi\n",
                    ],
                    securityContext: {
                      runAsUser: 0,
                    },
                    volumeMounts: [
                      {
                        name: "data",
                        mountPath: "/bitnami/postgresql",
                      },
                    ],
                  },
                ],
                containers: [
                  {
                    name: "postgres",
                    image: "docker.io/bitnami/postgresql:10.6.0",
                    imagePullPolicy: "Always",
                    resources: {
                      requests: {
                        cpu: "250m",
                        memory: "256Mi",
                      },
                    },
                    env: [
                      {
                        name: "POSTGRESQL_USERNAME",
                        value: "postgres",
                      },
                      {
                        name: "POSTGRESQL_PASSWORD",
                        valueFrom: {
                          secretKeyRef: {
                            name: "postgres",
                            key: "postgresql-password",
                          },
                        },
                      },
                    ],
                    ports: [
                      {
                        name: "postgresql",
                        containerPort: 5432,
                      },
                    ],
                    livenessProbe: {
                      exec: {
                        command: [
                          "sh",
                          "-c",
                          "exec pg_isready -U \"postgres\" -h localhost",
                        ],
                      },
                      initialDelaySeconds: 30,
                      periodSeconds: 10,
                      timeoutSeconds: 5,
                      successThreshold: 1,
                      failureThreshold: 6,
                    },
                    readinessProbe: {
                      exec: {
                        command: [
                          "sh",
                          "-c",
                          "exec pg_isready -U \"postgres\" -h localhost",
                        ],
                      },
                      initialDelaySeconds: 5,
                      periodSeconds: 10,
                      timeoutSeconds: 5,
                      successThreshold: 1,
                      failureThreshold: 6,
                    },
                    volumeMounts: [
                      {
                        name: "data",
                        mountPath: "/bitnami/postgresql",
                      },
                    ],
                  },
                ],
                volumes: null,
              },
            },
            volumeClaimTemplates: [
              {
                metadata: {
                  name: "data",
                },
                spec: {
                  accessModes: [
                    "ReadWriteOnce",
                  ],
                  resources: {
                    requests: {
                      storage: "8Gi",
                    },
                  },
                },
              },
            ],
          },
        },
      ])
    })

    it("should handle duplicate keys in template", async () => {
      const module = await graph.getModule("duplicate-keys-in-template")
      expect(await getChartResources(ctx, module, log)).to.not.throw
    })

    it("should filter out test pods", async () => {
      const module = await graph.getModule("chart-with-test-pod")
      const resources = await getChartResources(ctx, module, log)

      expect(resources).to.eql([
        {
          apiVersion: "v1",
          kind: "Service",
          metadata: {
            annotations: {},
            name: "chart-with-test-pod",
          },
          spec: {
            ports: [
              {
                name: "http",
                port: 80,
              },
            ],
            selector: {
              app: "chart-with-test-pod",
            },
            type: "ClusterIP",
          },
        },
      ])
    })
  })

  describe("getBaseModule", () => {
    it("should return undefined if no base module is specified", async () => {
      const module = await graph.getModule("api")

      expect(await getBaseModule(module)).to.be.undefined
    })

    it("should return the resolved base module if specified", async () => {
      const module = await graph.getModule("api")
      const baseModule = await graph.getModule("postgres")

      module.spec.base = baseModule.name
      module.buildDependencies = { postgres: baseModule }

      expect(await getBaseModule(module)).to.equal(baseModule)
    })

    it("should throw if the base module isn't in the build dependency map", async () => {
      const module = await graph.getModule("api")

      module.spec.base = "postgres"

      await expectError(
        () => getBaseModule(module),
        err => expect(err.message).to.equal(
          deline`Helm module 'api' references base module 'postgres'
          but it is missing from the module's build dependencies.`,
        ),
      )
    })

    it("should throw if the base module isn't a Helm module", async () => {
      const module = await graph.getModule("api")
      const baseModule = await graph.getModule("postgres")

      baseModule.type = "foo"

      module.spec.base = baseModule.name
      module.buildDependencies = { postgres: baseModule }

      await expectError(
        () => getBaseModule(module),
        err => expect(err.message).to.equal(
          deline`Helm module 'api' references base module 'postgres' which is a 'foo' module,
          but should be a helm module.`,
        ),
      )
    })
  })

  describe("getChartPath", () => {
    context("module has chart sources", () => {
      it("should return the chart path in the build directory", async () => {
        const module = await graph.getModule("api")
        expect(await getChartPath(module)).to.equal(
          resolve(ctx.projectRoot, ".garden", "build", "api"),
        )
      })
    })

    context("module references remote chart", () => {
      it("should construct the chart path based on the chart name", async () => {
        const module = await graph.getModule("postgres")
        expect(await getChartPath(module)).to.equal(
          resolve(ctx.projectRoot, ".garden", "build", "postgres", "postgresql"),
        )
      })
    })
  })

  describe("getValuesPath", () => {
    it("should add garden-values.yml to the specified path", () => {
      expect(getValuesPath(ctx.projectRoot)).to.equal(resolve(ctx.projectRoot, "garden-values.yml"))
    })
  })

  describe("getReleaseName", () => {
    it("should return the module name if not overridden in config", async () => {
      const module = await graph.getModule("api")
      delete module.spec.releaseName
      expect(getReleaseName(module)).to.equal("api")
    })

    it("should return the configured release name if any", async () => {
      const module = await graph.getModule("api")
      expect(getReleaseName(module)).to.equal("api-release")
    })
  })

  describe("getServiceResourceSpec", () => {
    it("should return the spec on the given module if it has no base module", async () => {
      const module = await graph.getModule("api")
      expect(await getServiceResourceSpec(module)).to.eql(module.spec.serviceResource)
    })

    it("should return the spec on the base module if there is none on the module", async () => {
      const module = await graph.getModule("api")
      const baseModule = await graph.getModule("postgres")
      module.spec.base = "postgres"
      delete module.spec.serviceResource
      module.buildDependencies = { postgres: baseModule }
      expect(await getServiceResourceSpec(module)).to.eql(baseModule.spec.serviceResource)
    })

    it("should merge the specs if both module and base have specs", async () => {
      const module = await graph.getModule("api")
      const baseModule = await graph.getModule("postgres")
      module.spec.base = "postgres"
      module.buildDependencies = { postgres: baseModule }
      expect(await getServiceResourceSpec(module)).to.eql({
        containerModule: "api-image",
        kind: "Deployment",
        name: "postgres",
      })
    })

    it("should throw if there is no base module and the module has no serviceResource spec", async () => {
      const module = await graph.getModule("api")
      delete module.spec.serviceResource
      await expectError(
        () => getServiceResourceSpec(module),
        err => expect(err.message).to.equal(
          deline`Helm module 'api' doesn't specify a \`serviceResource\` in its configuration.
          You must specify a resource in the module config in order to use certain Garden features,
          such as hot reloading.`,
        ),
      )
    })

    it("should throw if there is a base module but neither module has a spec", async () => {
      const module = await graph.getModule("api")
      const baseModule = await graph.getModule("postgres")
      module.spec.base = "postgres"
      module.buildDependencies = { postgres: baseModule }
      delete module.spec.serviceResource
      delete baseModule.spec.serviceResource
      await expectError(
        () => getServiceResourceSpec(module),
        err => expect(err.message).to.equal(
          deline`Helm module 'api' doesn't specify a \`serviceResource\` in its configuration.
          You must specify a resource in the module config in order to use certain Garden features,
          such as hot reloading.`,
        ),
      )
    })
  })

  describe("findServiceResource", () => {
    it("should return the resource specified by serviceResource", async () => {
      const module = await graph.getModule("api")
      const chartResources = await getChartResources(ctx, module, log)
      const result = await findServiceResource({ ctx, log, module, chartResources })
      const expected = find(chartResources, r => r.kind === "Deployment")
      expect(result).to.eql(expected)
    })

    it("should throw if no resourceSpec or serviceResource is specified", async () => {
      const module = await graph.getModule("api")
      const chartResources = await getChartResources(ctx, module, log)
      delete module.spec.serviceResource
      await expectError(
        () => findServiceResource({ ctx, log, module, chartResources }),
        err => expect(err.message).to.equal(
          deline`Helm module 'api' doesn't specify a \`serviceResource\` in its configuration.
          You must specify a resource in the module config in order to use certain Garden features,
          such as hot reloading.`,
        ),
      )
    })

    it("should throw if no resource of the specified kind is in the chart", async () => {
      const module = await graph.getModule("api")
      const chartResources = await getChartResources(ctx, module, log)
      const resourceSpec = {
        ...module.spec.serviceResource,
        kind: "DaemonSet",
      }
      await expectError(
        () => findServiceResource({ ctx, log, module, chartResources, resourceSpec }),
        err => expect(err.message).to.equal("Helm module 'api' contains no DaemonSets."),
      )
    })

    it("should throw if matching resource is not found by name", async () => {
      const module = await graph.getModule("api")
      const chartResources = await getChartResources(ctx, module, log)
      const resourceSpec = {
        ...module.spec.serviceResource,
        name: "foo",
      }
      await expectError(
        () => findServiceResource({ ctx, log, module, chartResources, resourceSpec }),
        err => expect(err.message).to.equal("Helm module 'api' does not contain specified Deployment 'foo'"),
      )
    })

    it("should throw if no name is specified and multiple resources are matched", async () => {
      const module = await graph.getModule("api")
      const chartResources = await getChartResources(ctx, module, log)
      const deployment = find(chartResources, r => r.kind === "Deployment")
      chartResources.push(deployment!)
      await expectError(
        () => findServiceResource({ ctx, log, module, chartResources }),
        err => expect(err.message).to.equal(deline`
          Helm module 'api' contains multiple Deployments.
          You must specify \`serviceResource.name\` in the module config in order to
          identify the correct Deployment to use.`,
        ),
      )
    })

    it("should resolve template string for resource name", async () => {
      const module = await graph.getModule("postgres")
      const chartResources = await getChartResources(ctx, module, log)
      module.spec.serviceResource.name = `{{ template "postgresql.master.fullname" . }}`
      const result = await findServiceResource({ ctx, log, module, chartResources })
      const expected = find(chartResources, r => r.kind === "StatefulSet")
      expect(result).to.eql(expected)
    })
  })

  describe("getResourceContainer", () => {
    async function getDeployment() {
      const module = await graph.getModule("api")
      const chartResources = await getChartResources(ctx, module, log)
      return <HotReloadableResource>find(chartResources, r => r.kind === "Deployment")!
    }

    it("should get the first container on the resource if no name is specified", async () => {
      const deployment = await getDeployment()
      const expected = deployment.spec.template.spec.containers[0]
      expect(getResourceContainer(deployment)).to.equal(expected)
    })

    it("should pick the container by name if specified", async () => {
      const deployment = await getDeployment()
      const expected = deployment.spec.template.spec.containers[0]
      expect(getResourceContainer(deployment, "api")).to.equal(expected)
    })

    it("should throw if no containers are in resource", async () => {
      const deployment = await getDeployment()
      deployment.spec.template.spec.containers = []
      await expectError(
        () => getResourceContainer(deployment),
        err => expect(err.message).to.equal("Deployment api-release has no containers configured."),
      )
    })

    it("should throw if name is specified and no containers match", async () => {
      const deployment = await getDeployment()
      await expectError(
        () => getResourceContainer(deployment, "foo"),
        err => expect(err.message).to.equal("Could not find container 'foo' in Deployment 'api-release'"),
      )
    })
  })
})
