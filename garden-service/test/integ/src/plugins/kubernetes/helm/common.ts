/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TestGarden, makeTestGarden, dataDir, expectError } from "../../../../../helpers"
import { resolve } from "path"
import { expect } from "chai"
import { first } from "lodash"

import {
  containsSource,
  getChartResources,
  getChartPath,
  getReleaseName,
  getGardenValuesPath,
  getBaseModule,
  getValueArgs,
  renderTemplates,
} from "../../../../../../src/plugins/kubernetes/helm/common"
import { PluginContext } from "../../../../../../src/plugin-context"
import { LogEntry } from "../../../../../../src/logger/log-entry"
import { BuildTask } from "../../../../../../src/tasks/build"
import { deline, dedent } from "../../../../../../src/util/string"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { KubernetesPluginContext } from "../../../../../../src/plugins/kubernetes/config"

let helmTestGarden: TestGarden

export async function getHelmTestGarden() {
  if (helmTestGarden) {
    return helmTestGarden
  }

  const projectRoot = resolve(dataDir, "test-projects", "helm")
  const garden = await makeTestGarden(projectRoot)

  helmTestGarden = garden

  return garden
}

export async function buildHelmModules(garden: TestGarden, graph: ConfigGraph) {
  const modules = graph.getModules()
  const tasks = modules.map(
    (module) =>
      new BuildTask({
        garden,
        graph,
        log: garden.log,
        module,
        force: false,
        _guard: true,
      })
  )
  const results = await garden.processTasks(tasks)

  const err = first(Object.values(results).map((r) => r && r.error))

  if (err) {
    throw err
  }
}

describe("Helm common functions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let ctx: PluginContext
  let log: LogEntry

  before(async () => {
    garden = await getHelmTestGarden()
    const provider = await garden.resolveProvider("local-kubernetes")
    ctx = garden.getPluginContext(provider)
    log = garden.log
    graph = await garden.getConfigGraph(garden.log)
    await buildHelmModules(garden, graph)
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph(garden.log)
  })

  describe("containsSource", () => {
    it("should return true if the specified module contains chart sources", async () => {
      const module = graph.getModule("api")
      expect(await containsSource(module)).to.be.true
    })

    it("should return false if the specified module does not contain chart sources", async () => {
      const module = graph.getModule("postgres")
      expect(await containsSource(module)).to.be.false
    })
  })

  describe("renderTemplates", () => {
    it("should render and return the manifests for a local template", async () => {
      const module = graph.getModule("api")
      const templates = await renderTemplates(<KubernetesPluginContext>ctx, module, false, log)
      expect(templates).to.eql(dedent`
      ---
      # Source: api/templates/service.yaml
      apiVersion: v1
      kind: Service
      metadata:
        name: api-release
        labels:
          app.kubernetes.io/name: api
          helm.sh/chart: api-0.1.0
          app.kubernetes.io/instance: api-release
          app.kubernetes.io/managed-by: Helm
      spec:
        type: ClusterIP
        ports:
          - port: 80
            targetPort: http
            protocol: TCP
            name: http
        selector:
          app.kubernetes.io/name: api
          app.kubernetes.io/instance: api-release
      ---
      # Source: api/templates/deployment.yaml
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: api-release
        labels:
          app.kubernetes.io/name: api
          helm.sh/chart: api-0.1.0
          app.kubernetes.io/instance: api-release
          app.kubernetes.io/managed-by: Helm
      spec:
        replicas: 1
        selector:
          matchLabels:
            app.kubernetes.io/name: api
            app.kubernetes.io/instance: api-release
        template:
          metadata:
            labels:
              app.kubernetes.io/name: api
              app.kubernetes.io/instance: api-release
          spec:
            containers:
              - name: api
                image: "api-image:v-74e9653167"
                imagePullPolicy: IfNotPresent
                args: [python, app.py]
                ports:
                  - name: http
                    containerPort: 80
                    protocol: TCP
                resources:
                  {}
      ---
      # Source: api/templates/ingress.yaml
      apiVersion: extensions/v1beta1
      kind: Ingress
      metadata:
        name: api-release
        labels:
          app.kubernetes.io/name: api
          helm.sh/chart: api-0.1.0
          app.kubernetes.io/instance: api-release
          app.kubernetes.io/managed-by: Helm
      spec:
        rules:
          - host: "api.local.app.garden"
            http:
              paths:
                - path: /
                  backend:
                    serviceName: api-release
                    servicePort: http\n
      `)
    })

    it("should render and return the manifests for a remote template", async () => {
      const module = graph.getModule("postgres")
      const templates = await renderTemplates(<KubernetesPluginContext>ctx, module, false, log)
      expect(templates).to.eql(dedent`
      ---
      # Source: postgresql/templates/secrets.yaml
      apiVersion: v1
      kind: Secret
      metadata:
        name: postgres
        labels:
          app: postgresql
          chart: postgresql-3.9.2
          release: "postgres"
          heritage: "Helm"
      type: Opaque
      data:
        postgresql-password: "cG9zdGdyZXM="
      ---
      # Source: postgresql/templates/svc-headless.yaml
      apiVersion: v1
      kind: Service
      metadata:
        name: postgres-headless
        labels:
          app: postgresql
          chart: postgresql-3.9.2
          release: "postgres"
          heritage: "Helm"
      spec:
        type: ClusterIP
        clusterIP: None
        ports:
        - name: postgresql
          port: 5432
          targetPort: postgresql
        selector:
          app: postgresql
          release: "postgres"
      ---
      # Source: postgresql/templates/svc.yaml
      apiVersion: v1
      kind: Service
      metadata:
        name: postgres
        labels:
          app: postgresql
          chart: postgresql-3.9.2
          release: "postgres"
          heritage: "Helm"
      spec:
        type: ClusterIP
        ports:
        - name: postgresql
          port: 5432
          targetPort: postgresql
        selector:
          app: postgresql
          release: "postgres"
          role: master
      ---
      # Source: postgresql/templates/statefulset.yaml
      apiVersion: apps/v1beta2
      kind: StatefulSet
      metadata:
        name: postgres
        labels:
          app: postgresql
          chart: postgresql-3.9.2
          release: "postgres"
          heritage: "Helm"
      spec:
        serviceName: postgres-headless
        replicas: 1
        updateStrategy:
          type: RollingUpdate
        selector:
          matchLabels:
            app: postgresql
            release: "postgres"
            role: master
        template:
          metadata:
            name: postgres
            labels:
              app: postgresql
              chart: postgresql-3.9.2
              release: "postgres"
              heritage: "Helm"
              role: master
          spec:
            securityContext:
              fsGroup: 1001
              runAsUser: 1001
            initContainers:
            - name: init-chmod-data
              image: docker.io/bitnami/minideb:latest
              imagePullPolicy: "Always"
              resources:
                requests:
                  cpu: 250m
                  memory: 256Mi
              command:
                - sh
                - -c
                - |
                  chown -R 1001:1001 /bitnami
                  if [ -d /bitnami/postgresql/data ]; then
                    chmod  0700 /bitnami/postgresql/data;
                  fi
              securityContext:
                runAsUser: 0
              volumeMounts:
              - name: data
                mountPath: /bitnami/postgresql
            containers:
            - name: postgres
              image: docker.io/bitnami/postgresql:10.6.0
              imagePullPolicy: "Always"
              resources:
                requests:
                  cpu: 250m
                  memory: 256Mi
              env:
              - name: POSTGRESQL_USERNAME
                value: "postgres"
              - name: POSTGRESQL_PASSWORD
                valueFrom:
                  secretKeyRef:
                    name: postgres
                    key: postgresql-password
              ports:
              - name: postgresql
                containerPort: 5432
              livenessProbe:
                exec:
                  command:
                  - sh
                  - -c
                  - exec pg_isready -U "postgres" -h localhost
                initialDelaySeconds: 30
                periodSeconds: 10
                timeoutSeconds: 5
                successThreshold: 1
                failureThreshold: 6
              readinessProbe:
                exec:
                  command:
                  - sh
                  - -c
                  - exec pg_isready -U "postgres" -h localhost
                initialDelaySeconds: 5
                periodSeconds: 10
                timeoutSeconds: 5
                successThreshold: 1
                failureThreshold: 6
              volumeMounts:
              - name: data
                mountPath: /bitnami/postgresql
            volumes:
        volumeClaimTemplates:
          - metadata:
              name: data
            spec:
              accessModes:
                - "ReadWriteOnce"
              resources:
                requests:
                  storage: "8Gi"\n
      `)
    })
  })

  describe("getChartResources", () => {
    it("should render and return resources for a local template", async () => {
      const module = graph.getModule("api")
      const resources = await getChartResources(ctx, module, false, log)

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
              "app.kubernetes.io/managed-by": "Helm",
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
              "app.kubernetes.io/managed-by": "Helm",
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
                    image: resources[1].spec.template.spec.containers[0].image,
                    imagePullPolicy: "IfNotPresent",
                    args: ["python", "app.py"],
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
              "app.kubernetes.io/managed-by": "Helm",
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
      const module = graph.getModule("postgres")
      const resources = await getChartResources(ctx, module, false, log)

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
              heritage: "Helm",
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
              heritage: "Helm",
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
              heritage: "Helm",
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
              heritage: "Helm",
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
                  heritage: "Helm",
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
                        command: ["sh", "-c", 'exec pg_isready -U "postgres" -h localhost'],
                      },
                      initialDelaySeconds: 30,
                      periodSeconds: 10,
                      timeoutSeconds: 5,
                      successThreshold: 1,
                      failureThreshold: 6,
                    },
                    readinessProbe: {
                      exec: {
                        command: ["sh", "-c", 'exec pg_isready -U "postgres" -h localhost'],
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
                  accessModes: ["ReadWriteOnce"],
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
      const module = graph.getModule("duplicate-keys-in-template")
      expect(await getChartResources(ctx, module, false, log)).to.not.throw
    })

    it("should filter out resources with hooks", async () => {
      const module = graph.getModule("chart-with-test-pod")
      const resources = await getChartResources(ctx, module, false, log)

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
      const module = graph.getModule("api")

      expect(await getBaseModule(module)).to.be.undefined
    })

    it("should return the resolved base module if specified", async () => {
      const module = graph.getModule("api")
      const baseModule = graph.getModule("postgres")

      module.spec.base = baseModule.name
      module.buildDependencies = { postgres: baseModule }

      expect(await getBaseModule(module)).to.equal(baseModule)
    })

    it("should throw if the base module isn't in the build dependency map", async () => {
      const module = graph.getModule("api")

      module.spec.base = "postgres"

      await expectError(
        () => getBaseModule(module),
        (err) =>
          expect(err.message).to.equal(
            deline`Helm module 'api' references base module 'postgres' but it is missing from the module's build dependencies.`
          )
      )
    })

    it("should throw if the base module isn't a Helm module", async () => {
      const module = graph.getModule("api")
      const baseModule = graph.getModule("postgres")

      baseModule.type = "foo"

      module.spec.base = baseModule.name
      module.buildDependencies = { postgres: baseModule }

      await expectError(
        () => getBaseModule(module),
        (err) =>
          expect(err.message).to.equal(
            deline`Helm module 'api' references base module 'postgres' which is a 'foo' module,
            but should be a helm module.`
          )
      )
    })
  })

  describe("getChartPath", () => {
    context("module has chart sources", () => {
      it("should return the chart path in the build directory", async () => {
        const module = graph.getModule("api")
        expect(await getChartPath(module)).to.equal(resolve(ctx.projectRoot, ".garden", "build", "api"))
      })
    })

    context("module references remote chart", () => {
      it("should construct the chart path based on the chart name", async () => {
        const module = graph.getModule("postgres")
        expect(await getChartPath(module)).to.equal(
          resolve(ctx.projectRoot, ".garden", "build", "postgres", "postgresql")
        )
      })
    })
  })

  describe("getGardenValuesPath", () => {
    it("should add garden-values.yml to the specified path", () => {
      expect(getGardenValuesPath(ctx.projectRoot)).to.equal(resolve(ctx.projectRoot, "garden-values.yml"))
    })
  })

  describe("getValueArgs", () => {
    it("should return just garden-values.yml if no valueFiles are configured", async () => {
      const module = graph.getModule("api")
      module.spec.valueFiles = []
      const gardenValuesPath = getGardenValuesPath(module.buildPath)
      expect(await getValueArgs(module, false)).to.eql(["--values", gardenValuesPath])
    })

    it("should add a --set flag if hotReload=true", async () => {
      const module = graph.getModule("api")
      module.spec.valueFiles = []
      const gardenValuesPath = getGardenValuesPath(module.buildPath)
      expect(await getValueArgs(module, true)).to.eql([
        "--values",
        gardenValuesPath,
        "--set",
        "\\.garden.hotReload=true",
      ])
    })

    it("should return a --values arg for each valueFile configured", async () => {
      const module = graph.getModule("api")
      module.spec.valueFiles = ["foo.yaml", "bar.yaml"]
      const gardenValuesPath = getGardenValuesPath(module.buildPath)

      expect(await getValueArgs(module, false)).to.eql([
        "--values",
        resolve(module.buildPath, "foo.yaml"),
        "--values",
        resolve(module.buildPath, "bar.yaml"),
        "--values",
        gardenValuesPath,
      ])
    })
  })

  describe("getReleaseName", () => {
    it("should return the module name if not overridden in config", async () => {
      const module = graph.getModule("api")
      delete module.spec.releaseName
      expect(getReleaseName(module)).to.equal("api")
    })

    it("should return the configured release name if any", async () => {
      const module = graph.getModule("api")
      expect(getReleaseName(module)).to.equal("api-release")
    })
  })
})
