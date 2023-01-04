/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dataDir, expectError, makeTestGarden, TestGarden } from "../../../../../helpers"
import { resolve } from "path"
import { expect } from "chai"
import { first, uniq } from "lodash"
import {
  getBaseModule,
  getChartPath,
  getChartResources,
  getReleaseName,
  getValueArgs,
  renderTemplates,
} from "../../../../../../src/plugins/kubernetes/helm/common"
import { LogEntry } from "../../../../../../src/logger/log-entry"
import { BuildTask } from "../../../../../../src/tasks/build"
import { dedent, deline } from "../../../../../../src/util/string"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { KubernetesPluginContext } from "../../../../../../src/plugins/kubernetes/config"
import { safeLoadAll } from "js-yaml"
import { Garden } from "../../../../../../src"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { getIngressApiVersion } from "../../../../../../src/plugins/kubernetes/container/ingress"
import { HelmDeployAction } from "../../../../../../src/plugins/kubernetes/helm/config"

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

let helmLocalModeTestGarden: TestGarden

export async function getHelmLocalModeTestGarden() {
  if (helmLocalModeTestGarden) {
    return helmLocalModeTestGarden
  }

  const projectRoot = resolve(dataDir, "test-projects", "helm-local-mode")
  const garden = await makeTestGarden(projectRoot)

  helmLocalModeTestGarden = garden

  return garden
}

export async function buildHelmModules(garden: Garden | TestGarden, graph: ConfigGraph) {
  const actions = graph.getBuilds()
  const tasks = actions.map(
    (action) =>
      new BuildTask({
        garden,
        graph,
        log: garden.log,
        action,
        force: false,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })
  )
  const results = await garden.processTasks({ tasks, log: garden.log })

  const err = first(Object.values(results).map((r) => r && r.error))

  if (err) {
    throw err
  }
}

const ingressApiPreferenceOrder = ["networking.k8s.io/v1", "extensions/v1beta1", "networking.k8s.io/v1beta1"]

describe("Helm common functions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let log: LogEntry

  before(async () => {
    garden = await getHelmTestGarden()
    const provider = await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = (await garden.getPluginContext(provider)) as KubernetesPluginContext
    log = garden.log
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    await buildHelmModules(garden, graph)
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  describe("renderTemplates", () => {
    it("should render and return the manifests for a local template", async () => {
      const deployAction = graph.getDeploy("api")
      const buildImageAction = graph.getBuild("api-image")
      const templates = await renderTemplates({
        ctx,
        action: await garden.resolveAction<HelmDeployAction>({ action: deployAction, log, graph }),
        devMode: false,
        localMode: false,
        log,
      })

      const api = await KubeApi.factory(log, ctx, ctx.provider)
      const ingressApiVersion = await getIngressApiVersion(log, api, ingressApiPreferenceOrder)
      let expectedIngressOutput: string
      if (ingressApiVersion === "networking.k8s.io/v1") {
        expectedIngressOutput = dedent`
          # Source: api/templates/ingress.yaml
          # Use the new Ingress manifest structure
          apiVersion: networking.k8s.io/v1
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
                      pathType: Prefix
                      backend:
                        service:
                          name: api-release
                          port:
                            number: 80`
      } else {
        expectedIngressOutput = dedent`
          # Source: api/templates/ingress.yaml
          # Use the old Ingress manifest structure
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
                        servicePort: http `
      }

      const expected = `
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
          image: "api-image:${buildImageAction.versionString()}"
          imagePullPolicy: IfNotPresent
          args: [python, app.py]
          ports:
            - name: http
              containerPort: 80
              protocol: TCP
          resources:
            {}
---
${expectedIngressOutput}
      `

      expect(templates.trim()).to.eql(expected.trim())
    })

    it("should render and return the manifests for a remote template", async () => {
      const action = graph.getDeploy("postgres")
      const templates = await renderTemplates({
        ctx,
        action: await garden.resolveAction({ action, log, graph }),
        devMode: false,
        localMode: false,
        log,
      })

      // The exact output will vary by K8s versions so we just validate that we get valid YAML and
      // the expected kinds.
      const parsed = safeLoadAll(templates)
      expect(parsed.length).to.equal(4)

      const kinds = uniq(parsed.map((p) => p.kind)).sort()
      expect(kinds).to.eql(["Secret", "Service", "StatefulSet"])
    })
  })

  describe("getChartResources", () => {
    it("should render and return resources for a local template", async () => {
      const action = graph.getDeploy("api")
      const resources = await getChartResources({
        ctx,
        action: await garden.resolveAction<HelmDeployAction>({ action, log, graph }),
        devMode: false,
        localMode: false,
        log,
      })

      const api = await KubeApi.factory(log, ctx, ctx.provider)
      const ingressApiVersion = await getIngressApiVersion(log, api, ingressApiPreferenceOrder)
      let ingressResource: any
      if (ingressApiVersion === "networking.k8s.io/v1") {
        ingressResource = {
          apiVersion: "networking.k8s.io/v1",
          kind: "Ingress",
          metadata: {
            name: `api-release`,
            labels: {
              "app.kubernetes.io/name": "api",
              "helm.sh/chart": `api-0.1.0`,
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
                      pathType: "Prefix",
                      backend: {
                        service: {
                          name: `api-release`,
                          port: {
                            number: 80,
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        }
      } else {
        ingressResource = {
          apiVersion: "extensions/v1beta1",
          kind: "Ingress",
          metadata: {
            name: `api-release`,
            labels: {
              "app.kubernetes.io/name": "api",
              "helm.sh/chart": `api-0.1.0`,
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
                        serviceName: `api-release`,
                        servicePort: "http",
                      },
                    },
                  ],
                },
              },
            ],
          },
        }
      }
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
        ingressResource,
      ])
    })

    it("should render and return resources for a remote template", async () => {
      const action = graph.getDeploy("postgres")
      const resources = await getChartResources({
        ctx,
        action: await garden.resolveAction({ action, log, graph }),
        devMode: false,
        localMode: false,
        log,
      })

      // The exact output will vary by K8s versions so we just validate that we get valid YAML and
      // the expected kinds.
      expect(resources.length).to.equal(4)

      const kinds = uniq(resources.map((p) => p.kind)).sort()
      expect(kinds).to.eql(["Secret", "Service", "StatefulSet"])
    })

    it("should handle duplicate keys in template", async () => {
      const action = graph.getDeploy("duplicate-keys-in-template")
      expect(
        await getChartResources({
          ctx,
          action: await garden.resolveAction({ action, log, graph }),
          devMode: false,
          localMode: false,
          log,
        })
      ).to.not.throw
    })

    it("should filter out resources with hooks", async () => {
      const action = graph.getDeploy("chart-with-test-pod")
      const resources = await getChartResources({
        ctx,
        action: await garden.resolveAction({ action, log, graph }),
        devMode: false,
        localMode: false,
        log,
      })

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
        const action = await garden.resolveAction<HelmDeployAction>({ action: graph.getDeploy("api"), log, graph })
        expect(await getChartPath(action)).to.equal(resolve(ctx.projectRoot, ".garden", "build", "api"))
      })
    })

    context("module references remote chart", () => {
      it("should construct the chart path based on the chart name", async () => {
        const action = await garden.resolveAction<HelmDeployAction>({ action: graph.getDeploy("postgres"), log, graph })
        expect(await getChartPath(action)).to.equal(
          resolve(ctx.projectRoot, ".garden", "build", "postgres", "postgresql")
        )
      })
    })
  })

  describe("getValueArgs", () => {
    const gardenValuesPath = "/tmp/foo"

    it("should return just garden-values.yml if no valueFiles are configured", async () => {
      const action = await garden.resolveAction<HelmDeployAction>({ action: graph.getDeploy("api"), log, graph })
      action.getSpec().valueFiles = []
      expect(await getValueArgs({ action, devMode: false, localMode: false, valuesPath: gardenValuesPath })).to.eql(["--values", gardenValuesPath])
    })

    it("should add a --set flag if devMode=true", async () => {
      const action = await garden.resolveAction<HelmDeployAction>({ action: graph.getDeploy("api"), log, graph })
      action.getSpec().valueFiles = []
      expect(await getValueArgs({ action, devMode: true, localMode: false, valuesPath: gardenValuesPath })).to.eql([
        "--values",
        gardenValuesPath,
        "--set",
        "\\.garden.devMode=true",
      ])
    })

    it("should add a --set flag if localMode=true", async () => {
      const action = await garden.resolveAction<HelmDeployAction>({ action: graph.getDeploy("api"), log, graph })
      action.getSpec().valueFiles = []
      expect(await getValueArgs({ action, devMode: false, localMode: true, valuesPath: gardenValuesPath })).to.eql([
        "--values",
        gardenValuesPath,
        "--set",
        "\\.garden.localMode=true",
      ])
    })

    it("localMode should always take precedence over devMode when add a --set flag", async () => {
      const action = await garden.resolveAction<HelmDeployAction>({ action: graph.getDeploy("api"), log, graph })
      action.getSpec().valueFiles = []
      expect(await getValueArgs({ action, devMode: true, localMode: true, valuesPath: gardenValuesPath })).to.eql([
        "--values",
        gardenValuesPath,
        "--set",
        "\\.garden.localMode=true",
      ])
    })

    it("should return a --values arg for each valueFile configured", async () => {
      const action = await garden.resolveAction<HelmDeployAction>({ action: graph.getDeploy("api"), log, graph })
      action.getSpec().valueFiles = ["foo.yaml", "bar.yaml"]

      expect(await getValueArgs({ action, devMode: false, localMode: false, valuesPath: gardenValuesPath })).to.eql([
        "--values",
        resolve(action.getBuildPath(), "foo.yaml"),
        "--values",
        resolve(action.getBuildPath(), "bar.yaml"),
        "--values",
        gardenValuesPath,
      ])
    })
  })

  describe("getReleaseName", () => {
    it("should return the module name if not overridden in config", async () => {
      const action = await garden.resolveAction<HelmDeployAction>({ action: graph.getDeploy("api"), log, graph })
      delete action.getSpec().releaseName
      expect(getReleaseName(action)).to.equal("api")
    })

    it("should return the configured release name if any", async () => {
      const action = await garden.resolveAction<HelmDeployAction>({ action: graph.getDeploy("api"), log, graph })
      expect(getReleaseName(action)).to.equal("api-release")
    })
  })

  describe("prepareTemplates", () => {
    it("writes values to a temp file and returns path", async () => {
      throw "TODO"
    })

    context("chart.path is set", () => {
      it("sets reference to chart path", async () => {
        throw "TODO"
      })

      it("updates dependencies for local charts", async () => {
        throw "TODO"
      })
    })

    context("chart.url is set", () => {
      it("sets reference to chart.url", async () => {
        throw "TODO"
      })

      it("adds --version flag if chart.version is set", async () => {
        throw "TODO"
      })
    })

    context("chart.name is set", () => {
      it("sets reference to chart.name", async () => {
        throw "TODO"
      })

      it("adds --version flag if chart.version is set", async () => {
        throw "TODO"
      })

      it("adds --repo flag if chart.repo is set", async () => {
        throw "TODO"
      })
    })
  })
})
