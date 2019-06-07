import { createServiceResources } from "../../../../../../src/plugins/kubernetes/container/service"
import { makeTestGarden, dataDir } from "../../../../../helpers"
import { gardenPlugin } from "../../../../../../src/plugins/container/container"
import { resolve } from "path"
import { Garden } from "../../../../../../src/garden"
import { expect } from "chai"

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
            service: "service-a",
          },
          type: "ClusterIP",
        },
      },
    ])
  })

  it("should add annotations if configured", async () => {
    const graph = await garden.getConfigGraph()
    const service = await graph.getService("service-a")

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
            service: "service-a",
          },
          type: "ClusterIP",
        },
      },
    ])
  })
})
