/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createServiceResources } from "../../../../../../src/plugins/kubernetes/container/service.js"
import { makeTestGarden, getDataDir } from "../../../../../helpers.js"
import { gardenPlugin } from "../../../../../../src/plugins/container/container.js"
import type { Garden } from "../../../../../../src/garden.js"
import { expect } from "chai"
import { gardenAnnotationKey } from "../../../../../../src/util/string.js"

describe("createServiceResources", () => {
  const projectRoot = getDataDir("test-project-container")
  let garden: Garden

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
  })

  it("should return service resources", async () => {
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const rawAction = graph.getDeploy("service-a")
    const action = await garden.resolveAction({ graph, log: garden.log, action: rawAction })

    const resources = await createServiceResources(action, "my-namespace")

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
            [gardenAnnotationKey("action")]: "deploy.service-a",
          },
          type: "ClusterIP",
        },
      },
    ])
  })

  it("should add annotations if configured", async () => {
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const rawAction = graph.getDeploy("service-a")
    const action = await garden.resolveAction({ graph, log: garden.log, action: rawAction })

    action._config.spec.annotations = { my: "annotation" }

    const resources = await createServiceResources(action, "my-namespace")

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
            [gardenAnnotationKey("action")]: "deploy.service-a",
          },
          type: "ClusterIP",
        },
      },
    ])
  })

  it("should create a NodePort service if a nodePort is specified", async () => {
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const rawAction = graph.getDeploy("service-a")
    const action = await garden.resolveAction({ graph, log: garden.log, action: rawAction })

    action._config.spec.ports[0].nodePort = 12345

    const resources = await createServiceResources(action, "my-namespace")

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
            [gardenAnnotationKey("action")]: "deploy.service-a",
          },
          type: "NodePort",
        },
      },
    ])
  })

  it("should create a NodePort service without nodePort set if nodePort is specified as true", async () => {
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const rawAction = graph.getDeploy("service-a")
    const action = await garden.resolveAction({ graph, log: garden.log, action: rawAction })

    action._config.spec.ports[0].nodePort = true

    const resources = await createServiceResources(action, "my-namespace")

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
            [gardenAnnotationKey("action")]: "deploy.service-a",
          },
          type: "NodePort",
        },
      },
    ])
  })
})
