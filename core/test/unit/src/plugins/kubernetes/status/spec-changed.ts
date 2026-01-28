/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { specChanged } from "../../../../../../src/plugins/kubernetes/status/status.js"
import type { KubernetesResource } from "../../../../../../src/plugins/kubernetes/types.js"
import { cloneDeep } from "lodash-es"

/**
 * Helper function to simulate what Kubernetes adds to a deployed resource.
 * This mimics the behavior of the Kubernetes API server adding default values.
 */
function simulateKubernetesDeployment(resource: KubernetesResource): KubernetesResource {
  const result = cloneDeep(resource)

  // Add server-managed metadata
  if (!result.metadata.resourceVersion) result.metadata.resourceVersion = "12345"
  if (!result.metadata.uid) result.metadata.uid = "abc-123-def-456"
  if (!result.metadata.generation) result.metadata.generation = 1
  if (!result.metadata.creationTimestamp) result.metadata.creationTimestamp = "2024-01-01T00:00:00Z" as any

  // Add defaults based on resource kind
  if (result.kind === "Service") {
    if (!result.spec.sessionAffinity) result.spec.sessionAffinity = "None"
    if (!result.spec.type) result.spec.type = "ClusterIP"
  }

  if (result.kind === "Deployment") {
    if (!result.spec.revisionHistoryLimit) result.spec.revisionHistoryLimit = 10
    if (!result.spec.progressDeadlineSeconds) result.spec.progressDeadlineSeconds = 600
    if (!result.spec.strategy) {
      result.spec.strategy = {
        type: "RollingUpdate",
        rollingUpdate: {
          maxUnavailable: "25%",
          maxSurge: "25%",
        },
      }
    }
  }

  if (result.kind === "DaemonSet") {
    if (!result.spec.revisionHistoryLimit) result.spec.revisionHistoryLimit = 10
    if (result.spec.minReadySeconds === undefined) result.spec.minReadySeconds = 0
  }

  if (result.kind === "StatefulSet") {
    if (!result.spec.revisionHistoryLimit) result.spec.revisionHistoryLimit = 10
    if (!result.spec.updateStrategy) {
      result.spec.updateStrategy = {
        type: "RollingUpdate",
        rollingUpdate: { partition: 0 },
      }
    }
    if (!result.spec.podManagementPolicy) result.spec.podManagementPolicy = "OrderedReady"
  }

  // Add pod spec defaults (for workloads and Pods)
  const podSpec = result.kind === "Pod" ? result.spec : result.spec?.template?.spec
  if (podSpec) {
    if (!podSpec.restartPolicy) podSpec.restartPolicy = "Always"
    if (!podSpec.dnsPolicy) podSpec.dnsPolicy = "ClusterFirst"
    if (!podSpec.schedulerName) podSpec.schedulerName = "default-scheduler"
    if (podSpec.terminationGracePeriodSeconds === undefined) podSpec.terminationGracePeriodSeconds = 30

    // Add container defaults
    const containers = [...(podSpec.containers || []), ...(podSpec.initContainers || [])]
    for (const container of containers) {
      if (!container.imagePullPolicy) {
        const hasLatestTag =
          container.image?.endsWith(":latest") ||
          (container.image && !container.image.includes(":") && !container.image.includes("@"))
        container.imagePullPolicy = hasLatestTag ? "Always" : "IfNotPresent"
      }
      if (!container.terminationMessagePath) container.terminationMessagePath = "/dev/termination-log"
      if (!container.terminationMessagePolicy) container.terminationMessagePolicy = "File"

      // Add port protocol defaults
      if (container.ports) {
        for (const port of container.ports) {
          if (!port.protocol) port.protocol = "TCP"
        }
      }
    }
  }

  return result
}

describe("specChanged", () => {
  describe("numeric vs string coercion", () => {
    it("should not detect change when numeric values are strings", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:1.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      deployed.spec.replicas = "3" as any

      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })

    it("should detect change when numeric values differ", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 5,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:1.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      deployed.spec.replicas = 3

      expect(specChanged({ manifest, deployedResource: deployed })).to.be.true
    })
  })

  describe("container name-based matching", () => {
    it("should correctly normalize containers when order matches", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [
                { name: "app", image: "nginx:1.0" },
                { name: "sidecar", image: "redis:6.0" },
              ],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      // Containers in same order - normalization should work correctly
      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })

    it("should detect change when container image differs (by name)", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [
                { name: "app", image: "nginx:2.0" },
                { name: "sidecar", image: "redis:6.0" },
              ],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      // Reverse order AND change sidecar image
      deployed.spec.template.spec.containers = [
        { ...deployed.spec.template.spec.containers[1], image: "redis:7.0" },
        deployed.spec.template.spec.containers[0],
      ]

      expect(specChanged({ manifest, deployedResource: deployed })).to.be.true
    })
  })

  describe("imagePullPolicy inference)", () => {
    it("should infer Always for explicit :latest tag", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:latest" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      expect(deployed.spec.template.spec.containers[0].imagePullPolicy).to.equal("Always")
      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })

    it("should infer Always for implicit :latest (no tag)", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx" }], // No tag = implicit :latest
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      expect(deployed.spec.template.spec.containers[0].imagePullPolicy).to.equal("Always")
      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })

    it("should infer IfNotPresent for versioned tag", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:1.21.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      expect(deployed.spec.template.spec.containers[0].imagePullPolicy).to.equal("IfNotPresent")
      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })

    it("should infer IfNotPresent for SHA256 digest", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [
                {
                  name: "app",
                  image: "nginx@sha256:abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234",
                },
              ],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      expect(deployed.spec.template.spec.containers[0].imagePullPolicy).to.equal("IfNotPresent")
      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })
  })

  describe("Kubernetes default values", () => {
    it("should handle Service defaults", () => {
      const manifest: KubernetesResource = {
        apiVersion: "v1",
        kind: "Service",
        metadata: { name: "test", namespace: "default" },
        spec: {
          ports: [{ port: 80 }],
          selector: { app: "test" },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      // K8s adds sessionAffinity and type
      expect(deployed.spec.sessionAffinity).to.equal("None")
      expect(deployed.spec.type).to.equal("ClusterIP")
      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })

    it("should handle Deployment defaults", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:1.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      expect(deployed.spec.revisionHistoryLimit).to.equal(10)
      expect(deployed.spec.progressDeadlineSeconds).to.equal(600)
      expect(deployed.spec.strategy).to.deep.equal({
        type: "RollingUpdate",
        rollingUpdate: {
          maxUnavailable: "25%",
          maxSurge: "25%",
        },
      })
      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })

    it("should handle Pod defaults", () => {
      const manifest: KubernetesResource = {
        apiVersion: "v1",
        kind: "Pod",
        metadata: { name: "test", namespace: "default" },
        spec: {
          containers: [{ name: "app", image: "nginx:1.0" }],
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      expect(deployed.spec.restartPolicy).to.equal("Always")
      expect(deployed.spec.dnsPolicy).to.equal("ClusterFirst")
      expect(deployed.spec.terminationGracePeriodSeconds).to.equal(30)
      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })
  })

  describe("server-managed metadata", () => {
    it("should ignore server-managed metadata fields", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:1.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      // Server adds these fields
      expect(deployed.metadata.resourceVersion).to.exist
      expect(deployed.metadata.uid).to.exist
      expect(deployed.metadata.generation).to.exist

      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })
  })

  describe("Garden annotations", () => {
    it("should ignore garden.io/* annotations", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "test",
          namespace: "default",
          annotations: {
            "garden.io/version": "1.0.0",
            "other-annotation": "keep-this",
          },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:1.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      deployed.metadata.annotations!["garden.io/version"] = "2.0.0" // Different version

      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })

    it("should NOT detect change for metadata annotations (only spec matters)", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "test",
          namespace: "default",
          annotations: {
            "custom-annotation": "value-1",
          },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:1.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      // Change top-level metadata annotation - this is NOT a spec change
      deployed.metadata.annotations!["custom-annotation"] = "value-2"

      // Should NOT detect change because specChanged only compares .spec, not .metadata
      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })

    it("should detect change in pod template annotations (part of spec)", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: {
              labels: { app: "test" },
              annotations: { "custom-annotation": "value-1" },
            },
            spec: {
              containers: [{ name: "app", image: "nginx:1.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      // Change pod template annotation - this IS part of spec
      deployed.spec.template.metadata.annotations!["custom-annotation"] = "value-2"

      expect(specChanged({ manifest, deployedResource: deployed })).to.be.true
    })
  })

  describe("actual spec changes", () => {
    it("should detect replica count change", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:1.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      deployed.spec.replicas = 5

      expect(specChanged({ manifest, deployedResource: deployed })).to.be.true
    })

    it("should detect image change", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "test", namespace: "default" },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "test" } },
          template: {
            metadata: { labels: { app: "test" } },
            spec: {
              containers: [{ name: "app", image: "nginx:2.0" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      deployed.spec.template.spec.containers[0].image = "nginx:1.0"

      expect(specChanged({ manifest, deployedResource: deployed })).to.be.true
    })
  })

  describe("StatefulSet defaults", () => {
    it("should handle StatefulSet with default updateStrategy and podManagementPolicy", () => {
      const manifest: KubernetesResource = {
        apiVersion: "apps/v1",
        kind: "StatefulSet",
        metadata: { name: "postgres", namespace: "default" },
        spec: {
          serviceName: "postgres",
          replicas: 1,
          selector: { matchLabels: { app: "postgres" } },
          template: {
            metadata: { labels: { app: "postgres" } },
            spec: {
              containers: [{ name: "postgres", image: "postgres:13" }],
            },
          },
        },
      }

      const deployed = simulateKubernetesDeployment(manifest)
      // simulateKubernetesDeployment adds K8s defaults including updateStrategy and podManagementPolicy

      expect(specChanged({ manifest, deployedResource: deployed })).to.be.false
    })
  })
})
