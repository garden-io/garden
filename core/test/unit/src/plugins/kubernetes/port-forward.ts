/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getForwardablePorts } from "../../../../../src/plugins/kubernetes/port-forward"

describe("getForwardablePorts", () => {
  it("returns all ports for Service resources", () => {
    const ports = getForwardablePorts([
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "foo",
        },
        spec: {
          ports: [{ port: 12345 }],
        },
      },
    ])

    expect(ports).to.eql([
      {
        name: undefined,
        protocol: "TCP",
        targetName: "Service/foo",
        targetPort: 12345,
      },
    ])
  })

  it("returns all ports for Deployment resources", () => {
    const ports = getForwardablePorts([
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "foo",
        },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  ports: [{ containerPort: 12345 }],
                },
              ],
            },
          },
        },
      },
    ])

    expect(ports).to.eql([
      {
        name: undefined,
        protocol: "TCP",
        targetName: "Deployment/foo",
        targetPort: 12345,
      },
    ])
  })

  it("returns all ports for DaemonSet resources", () => {
    const ports = getForwardablePorts([
      {
        apiVersion: "apps/v1",
        kind: "DaemonSet",
        metadata: {
          name: "foo",
        },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  ports: [{ containerPort: 12345 }],
                },
              ],
            },
          },
        },
      },
    ])

    expect(ports).to.eql([
      {
        name: undefined,
        protocol: "TCP",
        targetName: "DaemonSet/foo",
        targetPort: 12345,
      },
    ])
  })

  it("omits a Deployment port that is already pointed to by a Service resource", () => {
    const ports = getForwardablePorts([
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "foo",
        },
        spec: {
          selector: {
            app: "foo",
          },
          ports: [{ port: 12345, targetPort: 12346 }],
        },
      },
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "foo",
        },
        spec: {
          template: {
            metadata: {
              labels: {
                app: "foo",
              },
            },
            spec: {
              containers: [
                {
                  ports: [{ containerPort: 12346 }],
                },
              ],
            },
          },
        },
      },
    ])

    expect(ports).to.eql([
      {
        name: undefined,
        protocol: "TCP",
        targetName: "Service/foo",
        targetPort: 12345,
      },
    ])
  })
})
