/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getForwardablePorts } from "../../../../../src/plugins/kubernetes/port-forward.js"
import type {
  KubernetesDeployActionConfig,
  KubernetesDeployActionSpec,
} from "../../../../../src/plugins/kubernetes/kubernetes-type/config.js"
import type { ResolvedDeployAction } from "../../../../../src/actions/deploy.js"

describe("getForwardablePorts", () => {
  it("returns all ports for Service resources", () => {
    const ports = getForwardablePorts({
      resources: [
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
      ],
      parentAction: undefined,
    })

    expect(ports).to.eql([
      {
        name: undefined,
        protocol: "TCP",
        targetName: "Service/foo",
        targetPort: 12345,
      },
    ])
  })

  it("returns explicitly configured port forwards if set", () => {
    // This mock only defines the necessary class members, the rest have been omitted by <any> cast hack.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const action: ResolvedDeployAction<KubernetesDeployActionConfig> = <any>{
      kind: "Deploy",
      name: "foo",
      getSpec(): KubernetesDeployActionSpec {
        return {
          manifestFiles: [],
          manifestTemplates: [],
          manifests: [],
          portForwards: [
            {
              name: "test",
              resource: "Service/test",
              targetPort: 999,
              localPort: 9999,
            },
          ],
        }
      },
    }

    const ports = getForwardablePorts({
      resources: [
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
      ],
      parentAction: action,
    })

    expect(ports).to.eql([
      {
        name: "test",
        protocol: "TCP",
        targetName: "Service/test",
        targetPort: 999,
        preferredLocalPort: 9999,
      },
    ])
  })

  it("returns all ports for Deployment resources", () => {
    const ports = getForwardablePorts({
      resources: [
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
      ],
      parentAction: undefined,
    })

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
    const ports = getForwardablePorts({
      resources: [
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
      ],
      parentAction: undefined,
    })

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
    const ports = getForwardablePorts({
      resources: [
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
      ],
      parentAction: undefined,
    })

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
