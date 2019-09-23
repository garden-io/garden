import { createServiceResources } from "../../../../../../src/plugins/kubernetes/container/service"
import { makeTestGarden, dataDir } from "../../../../../helpers"
import { gardenPlugin } from "../../../../../../src/plugins/container/container"
import { resolve } from "path"
import { Garden } from "../../../../../../src/garden"
import { expect } from "chai"
import { ContainerService } from "../../../../../../src/plugins/container/config"
import { gardenAnnotationKey } from "../../../../../../src/util/string"

describe("createServiceResources", () => {
  const projectRoot = resolve(dataDir, "test-project-container")
  let garden: Garden

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { extraPlugins: { container: gardenPlugin } })
  })

  it("should return service resources", async () => {
    const graph = await garden.getConfigGraph()
    const service = await graph.getService("service-a")

    const resources = await createServiceResources(service, "my-namespace")

    expect(resources).to.eql([
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          annotations: {},
          name: "service-a",
          namespace: "my-namespace",
        },
        spec: {
          ports: [
            {
              name: "http",
              protocol: "TCP",
              targetPort: 8080,
              port: 8080,
            },
          ],
          selector: {
            [gardenAnnotationKey("service")]: "service-a",
            [gardenAnnotationKey("version")]: service.module.version.versionString,
          },
          type: "ClusterIP",
        },
      },
    ])
  })

  it("should add annotations if configured", async () => {
    const graph = await garden.getConfigGraph()
    const service: ContainerService = await graph.getService("service-a")

    service.spec.annotations = { my: "annotation" }

    const resources = await createServiceResources(service, "my-namespace")

    expect(resources).to.eql([
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "service-a",
          annotations: {
            my: "annotation",
          },
          namespace: "my-namespace",
        },
        spec: {
          ports: [
            {
              name: "http",
              protocol: "TCP",
              targetPort: 8080,
              port: 8080,
            },
          ],
          selector: {
            [gardenAnnotationKey("service")]: "service-a",
            [gardenAnnotationKey("version")]: service.module.version.versionString,
          },
          type: "ClusterIP",
        },
      },
    ])
  })

  it("should create a NodePort service if a nodePort is specified", async () => {
    const graph = await garden.getConfigGraph()
    const service: ContainerService = await graph.getService("service-a")

    service.spec.ports[0].nodePort = 12345

    const resources = await createServiceResources(service, "my-namespace")

    expect(resources).to.eql([
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "service-a",
          namespace: "my-namespace",
          annotations: {},
        },
        spec: {
          ports: [
            {
              name: "http",
              protocol: "TCP",
              targetPort: 8080,
              port: 8080,
              nodePort: 12345,
            },
          ],
          selector: {
            [gardenAnnotationKey("service")]: "service-a",
            [gardenAnnotationKey("version")]: service.module.version.versionString,
          },
          type: "NodePort",
        },
      },
    ])
  })

  it("should create a NodePort service without nodePort set if nodePort is specified as true", async () => {
    const graph = await garden.getConfigGraph()
    const service: ContainerService = await graph.getService("service-a")

    service.spec.ports[0].nodePort = true

    const resources = await createServiceResources(service, "my-namespace")

    expect(resources).to.eql([
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "service-a",
          namespace: "my-namespace",
          annotations: {},
        },
        spec: {
          ports: [
            {
              name: "http",
              protocol: "TCP",
              targetPort: 8080,
              port: 8080,
            },
          ],
          selector: {
            [gardenAnnotationKey("service")]: "service-a",
            [gardenAnnotationKey("version")]: service.module.version.versionString,
          },
          type: "NodePort",
        },
      },
    ])
  })
})
