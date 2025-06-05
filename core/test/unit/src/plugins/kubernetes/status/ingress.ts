/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { V1Ingress } from "@kubernetes/client-node"
import { expect } from "chai"
import { getK8sIngresses } from "../../../../../../src/plugins/kubernetes/status/ingress.js"
import type { KubernetesResource } from "../../../../../../src/plugins/kubernetes/types.js"

describe("getK8sIngresses", () => {
  it("ignores non-Ingress resources", () => {
    const resources: KubernetesResource[] = [
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "foo",
        },
        spec: {},
      },
      {
        apiVersion: "v1",
        kind: "Deployment",
        metadata: {
          name: "foo",
        },
        spec: {},
      },
    ]
    expect(getK8sIngresses(resources)).to.eql([])
  })

  it("picks up extensions/v1beta1 Ingress resource", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ingress: KubernetesResource<any> = {
      apiVersion: "extensions/v1beta1",
      kind: "Ingress",
      metadata: {
        name: "foo",
      },
      spec: {
        rules: [
          {
            host: "a.com",
            http: {
              paths: [
                { path: "/a1", backend: { serviceName: "one" } },
                { path: "/a2", backend: { serviceName: "two" } },
              ],
            },
          },
          {
            host: "b.com",
            http: {
              paths: [
                { path: "/b1", backend: { serviceName: "one" } },
                { path: "/b2", backend: { serviceName: "two" } },
              ],
            },
          },
        ],
      },
    }
    expect(getK8sIngresses([ingress])).to.eql([
      {
        hostname: "a.com",
        path: "/a1",
        protocol: "http",
      },
      {
        hostname: "a.com",
        path: "/a2",
        protocol: "http",
      },
      {
        hostname: "b.com",
        path: "/b1",
        protocol: "http",
      },
      {
        hostname: "b.com",
        path: "/b2",
        protocol: "http",
      },
    ])
  })

  it("picks up networking.k8s.io/v1beta1 Ingress resource", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ingress: KubernetesResource<any> = {
      apiVersion: "networking.k8s.io/v1beta1",
      kind: "Ingress",
      metadata: {
        name: "foo",
      },
      spec: {
        rules: [
          {
            host: "a.com",
            http: {
              paths: [
                { path: "/a1", backend: { serviceName: "one" } },
                { path: "/a2", backend: { serviceName: "two" } },
              ],
            },
          },
          {
            host: "b.com",
            http: {
              paths: [
                { path: "/b1", backend: { serviceName: "one" } },
                { path: "/b2", backend: { serviceName: "two" } },
              ],
            },
          },
        ],
      },
    }
    expect(getK8sIngresses([ingress])).to.eql([
      {
        hostname: "a.com",
        path: "/a1",
        protocol: "http",
      },
      {
        hostname: "a.com",
        path: "/a2",
        protocol: "http",
      },
      {
        hostname: "b.com",
        path: "/b1",
        protocol: "http",
      },
      {
        hostname: "b.com",
        path: "/b2",
        protocol: "http",
      },
    ])
  })

  it("picks up networking.k8s.io/v1 Ingress resource", () => {
    const ingress: KubernetesResource<V1Ingress> = {
      apiVersion: "networking.k8s.io/v1beta1",
      kind: "Ingress",
      metadata: {
        name: "foo",
      },
      spec: {
        rules: [
          {
            host: "a.com",
            http: {
              paths: [
                { path: "/a1", pathType: "ImplementationSpecific", backend: { service: { name: "one" } } },
                { path: "/a2", pathType: "ImplementationSpecific", backend: { service: { name: "two" } } },
              ],
            },
          },
          {
            host: "b.com",
            http: {
              paths: [
                { path: "/b1", pathType: "ImplementationSpecific", backend: { service: { name: "one" } } },
                { path: "/b2", pathType: "ImplementationSpecific", backend: { service: { name: "two" } } },
              ],
            },
          },
        ],
      },
    }
    expect(getK8sIngresses([ingress])).to.eql([
      {
        hostname: "a.com",
        path: "/a1",
        protocol: "http",
      },
      {
        hostname: "a.com",
        path: "/a2",
        protocol: "http",
      },
      {
        hostname: "b.com",
        path: "/b1",
        protocol: "http",
      },
      {
        hostname: "b.com",
        path: "/b2",
        protocol: "http",
      },
    ])
  })

  it("sets https protocol if host is in tls.hosts", () => {
    const ingress: KubernetesResource<V1Ingress> = {
      apiVersion: "networking.k8s.io/v1beta1",
      kind: "Ingress",
      metadata: {
        name: "foo",
      },
      spec: {
        rules: [
          {
            host: "a.com",
            http: {
              paths: [
                { path: "/a1", pathType: "ImplementationSpecific", backend: { service: { name: "one" } } },
                { path: "/a2", pathType: "ImplementationSpecific", backend: { service: { name: "two" } } },
              ],
            },
          },
          {
            host: "b.com",
            http: {
              paths: [
                { path: "/b1", pathType: "ImplementationSpecific", backend: { service: { name: "one" } } },
                { path: "/b2", pathType: "ImplementationSpecific", backend: { service: { name: "two" } } },
              ],
            },
          },
        ],
        tls: [{ hosts: ["b.com", "c.com"] }],
      },
    }
    expect(getK8sIngresses([ingress])).to.eql([
      {
        hostname: "a.com",
        path: "/a1",
        protocol: "http",
      },
      {
        hostname: "a.com",
        path: "/a2",
        protocol: "http",
      },
      {
        hostname: "b.com",
        path: "/b1",
        protocol: "https",
      },
      {
        hostname: "b.com",
        path: "/b2",
        protocol: "https",
      },
    ])
  })

  it("ignores rule without hosts set", () => {
    const ingress: KubernetesResource<V1Ingress> = {
      apiVersion: "networking.k8s.io/v1beta1",
      kind: "Ingress",
      metadata: {
        name: "foo",
      },
      spec: {
        rules: [
          {
            host: "a.com",
            http: {
              paths: [
                { path: "/a1", pathType: "ImplementationSpecific", backend: { service: { name: "one" } } },
                { path: "/a2", pathType: "ImplementationSpecific", backend: { service: { name: "two" } } },
              ],
            },
          },
          {
            // host: "b.com", <---
            http: {
              paths: [
                { path: "/b1", pathType: "ImplementationSpecific", backend: { service: { name: "one" } } },
                { path: "/b2", pathType: "ImplementationSpecific", backend: { service: { name: "two" } } },
              ],
            },
          },
        ],
      },
    }
    expect(getK8sIngresses([ingress])).to.eql([
      {
        hostname: "a.com",
        path: "/a1",
        protocol: "http",
      },
      {
        hostname: "a.com",
        path: "/a2",
        protocol: "http",
      },
    ])
  })

  it("ignores rule path without path field set", () => {
    const ingress: KubernetesResource<V1Ingress> = {
      apiVersion: "networking.k8s.io/v1beta1",
      kind: "Ingress",
      metadata: {
        name: "foo",
      },
      spec: {
        rules: [
          {
            host: "a.com",
            http: {
              paths: [
                { path: "/a1", pathType: "ImplementationSpecific", backend: { service: { name: "one" } } },
                { pathType: "ImplementationSpecific", backend: { service: { name: "two" } } }, // <---
              ],
            },
          },
          {
            host: "b.com",
            http: {
              paths: [
                { pathType: "ImplementationSpecific", backend: { service: { name: "one" } } }, // <---
                { path: "/b2", pathType: "ImplementationSpecific", backend: { service: { name: "two" } } },
              ],
            },
          },
        ],
        tls: [{ hosts: ["b.com", "c.com"] }],
      },
    }
    expect(getK8sIngresses([ingress])).to.eql([
      {
        hostname: "a.com",
        path: "/a1",
        protocol: "http",
      },
      {
        hostname: "b.com",
        path: "/b2",
        protocol: "https",
      },
    ])
  })
})
