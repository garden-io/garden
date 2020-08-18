/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

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
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin] })
  })

  it("should return service resources", async () => {
    const graph = await garden.getConfigGraph(garden.log)
    const service = graph.getService("service-a")

    const resources = await createServiceResources(service, "my-namespace", false)

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
          },
          type: "ClusterIP",
        },
      },
    ])
  })

  it("should pin to specific deployment version if blueGreen=true", async () => {
    const graph = await garden.getConfigGraph(garden.log)
    const service = graph.getService("service-a")

    const resources = await createServiceResources(service, "my-namespace", true)

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
    const graph = await garden.getConfigGraph(garden.log)
    const service: ContainerService = graph.getService("service-a")

    service.spec.annotations = { my: "annotation" }

    const resources = await createServiceResources(service, "my-namespace", false)

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
          },
          type: "ClusterIP",
        },
      },
    ])
  })

  it("should create a NodePort service if a nodePort is specified", async () => {
    const graph = await garden.getConfigGraph(garden.log)
    const service: ContainerService = graph.getService("service-a")

    service.spec.ports[0].nodePort = 12345

    const resources = await createServiceResources(service, "my-namespace", false)

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
          },
          type: "NodePort",
        },
      },
    ])
  })

  it("should create a NodePort service without nodePort set if nodePort is specified as true", async () => {
    const graph = await garden.getConfigGraph(garden.log)
    const service: ContainerService = graph.getService("service-a")

    service.spec.ports[0].nodePort = true

    const resources = await createServiceResources(service, "my-namespace", false)

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
          },
          type: "NodePort",
        },
      },
    ])
  })
})
