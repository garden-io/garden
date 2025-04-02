/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  getBuilderServiceAccountSpec,
  getUtilManifests,
  inClusterBuilderServiceAccount,
  skopeoManifestUnknown,
} from "../../../../../../../src/plugins/kubernetes/container/build/common.js"
import { expect } from "chai"
import type { KubernetesProvider } from "../../../../../../../src/plugins/kubernetes/config.js"
import { defaultResources } from "../../../../../../../src/plugins/kubernetes/config.js"
import type { DeepPartial } from "../../../../../../../src/util/util.js"
import {
  defaultUtilImageRegistryDomain,
  getK8sUtilImagePath,
} from "../../../../../../../src/plugins/kubernetes/constants.js"

describe("common build", () => {
  describe("manifest error", () => {
    it("should result in manifest unknown for common registry error", () => {
      const errorMessage = "ERROR: manifest unknown: manifest unknown"

      expect(skopeoManifestUnknown(errorMessage)).to.be.true
    })

    it("should result in manifest unknown for Harbor registry error", () => {
      const errorMessage =
        'Unable to query registry for image status: time="2021-10-13T17:50:25Z" level=fatal msg="Error parsing image name "docker://registry.domain/namespace/image-name:v-1f160eadbb": Error reading manifest v-1f160eadbb in registry.domain/namespace/image-name: unknown: artifact namespace/image-name:v-1f160eadbb not found"'

      expect(skopeoManifestUnknown(errorMessage)).to.be.true
    })

    it("should result in manifest unknown for Harbor registry repository not found", () => {
      const errorMessage =
        'Unable to query registry for image status: time="2021-10-13T17:50:25Z" level=fatal msg="Error parsing image name "docker://registry.domain/namespace/image-name:v-1f160eadbb": Error reading manifest v-1f160eadbb in registry.domain/namespace/image-name: unknown: repository namespace/image-name not found"'

      expect(skopeoManifestUnknown(errorMessage)).to.be.true
    })

    it("should result in manifest not unknown for other errors", () => {
      const errorMessage =
        "unauthorized: unauthorized to access repository: namespace/image-name, action: push: unauthorized to access repository: namespace/image-name, action: push"

      expect(skopeoManifestUnknown(errorMessage)).to.be.false
    })
  })

  describe("getBuilderServiceAccountSpec", () => {
    it("should return the manifest", () => {
      const annotation = { "some-annotation": "annotation-value" }
      const result = getBuilderServiceAccountSpec("random-namespace", annotation)
      expect(result).eql({
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: inClusterBuilderServiceAccount,
          annotations: annotation,
          namespace: "random-namespace",
        },
      })
    })

    it("should return empty annotations when no annotations are provided", () => {
      const result = getBuilderServiceAccountSpec("random-namespace")
      expect(result.metadata.annotations).eql({})
    })
  })

  describe("getUtilManifests", () => {
    const _provider: DeepPartial<KubernetesProvider> = {
      config: {
        utilImageRegistryDomain: defaultUtilImageRegistryDomain,
        resources: {
          util: defaultResources.util,
        },
      },
    }
    let provider = _provider as KubernetesProvider
    beforeEach(() => {
      provider = _provider as KubernetesProvider
    })

    it("should return the manifest", () => {
      const result = getUtilManifests(provider, "test", [])
      expect(result).eql({
        deployment: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: { labels: { app: "garden-util" }, name: "garden-util", annotations: undefined },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: "garden-util" } },
            strategy: {
              type: "Recreate",
            },
            template: {
              metadata: { labels: { app: "garden-util" }, annotations: undefined },
              spec: {
                serviceAccountName: inClusterBuilderServiceAccount,
                containers: [
                  {
                    name: "util",
                    image: getK8sUtilImagePath(provider.config.utilImageRegistryDomain),
                    imagePullPolicy: "IfNotPresent",
                    command: ["/rsync-server.sh"],
                    env: [
                      { name: "ALLOW", value: "0.0.0.0/0" },
                      { name: "RSYNC_PORT", value: "8730" },
                    ],
                    volumeMounts: [
                      { name: "test", mountPath: "/home/user/.docker", readOnly: true },
                      { name: "garden-sync", mountPath: "/data" },
                    ],
                    ports: [{ name: "garden-rsync", protocol: "TCP", containerPort: 8730 }],
                    readinessProbe: {
                      initialDelaySeconds: 1,
                      periodSeconds: 1,
                      timeoutSeconds: 3,
                      successThreshold: 2,
                      failureThreshold: 5,
                      tcpSocket: { port: "garden-rsync" },
                    },
                    lifecycle: {
                      preStop: {
                        exec: {
                          command: [
                            "/bin/sh",
                            "-c",
                            "until test $(pgrep -f '^[^ ]+rsync' | wc -l) = 1; do echo waiting for rsync to finish...; sleep 1; done",
                          ],
                        },
                      },
                    },
                    resources: { limits: { cpu: "256m", memory: "512Mi" }, requests: { cpu: "256m", memory: "512Mi" } },
                    securityContext: { runAsUser: 1000, runAsGroup: 1000 },
                  },
                ],
                imagePullSecrets: [],
                volumes: [
                  {
                    name: "test",
                    secret: { secretName: "test", items: [{ key: ".dockerconfigjson", path: "config.json" }] },
                  },
                  { name: "garden-sync", emptyDir: {} },
                ],
                tolerations: [{ key: "garden-build", operator: "Equal", value: "true", effect: "NoSchedule" }],
              },
            },
          },
        },
        service: {
          apiVersion: "v1",
          kind: "Service",
          metadata: { name: "garden-util" },
          spec: {
            ports: [{ name: "rsync", protocol: "TCP", port: 8730, targetPort: 8730 }],
            selector: { app: "garden-util" },
            type: "ClusterIP",
          },
        },
      })
    })

    it("should use a custom registry mirror if configured by the user", () => {
      const providerWithCustomRegistry = {
        ...provider,
        config: {
          ...provider.config,
          utilImageRegistryDomain: "https://my-custom-registry-mirror.io",
        },
      }

      const result = getUtilManifests(providerWithCustomRegistry, "test", [])
      expect(result.deployment.spec.template.spec?.containers[0].image).to.eql(
        getK8sUtilImagePath("https://my-custom-registry-mirror.io")
      )
    })

    it("should return the manifest with kaniko config tolerations if util tolerations are not specified", () => {
      const toleration = { key: "custom-kaniko-toleration", operator: "Equal", value: "true", effect: "NoSchedule" }
      provider.config.kaniko = {
        tolerations: [toleration],
      }
      const result = getUtilManifests(provider, "test", [])
      const tolerations = result.deployment.spec.template.spec?.tolerations

      expect(tolerations?.find((t) => t.key === toleration.key)).to.eql(toleration)
    })

    it("should return the manifest with util config tolerations if util tolerations are specified", () => {
      const tolerationUtil = { key: "util-toleration", operator: "Equal", value: "true", effect: "NoSchedule" }
      provider.config.kaniko = {
        util: {
          tolerations: [tolerationUtil],
        },
      }
      const result = getUtilManifests(provider, "test", [])
      const tolerations = result.deployment.spec.template.spec?.tolerations

      expect(tolerations?.find((t) => t.key === tolerationUtil.key)).to.eql(tolerationUtil)
    })

    it("should return the manifest with util tolerations only if kaniko has separate tolerations configured", () => {
      const tolerationKaniko = { key: "kaniko-toleration", operator: "Equal", value: "true", effect: "NoSchedule" }
      const tolerationUtil = { key: "util-toleration", operator: "Equal", value: "true", effect: "NoSchedule" }
      provider.config.kaniko = {
        tolerations: [tolerationKaniko],
      }
      provider.config.kaniko.util = {
        tolerations: [tolerationUtil],
      }
      const result = getUtilManifests(provider, "test", [])
      const tolerations = result.deployment.spec.template.spec?.tolerations

      expect(tolerations?.findIndex((t) => t.key === tolerationKaniko.key)).to.eql(-1)
    })

    it("should return the manifest with kaniko annotations when util annotations are missing", () => {
      provider.config.kaniko = {
        annotations: {
          testAnnotation: "its-there",
        },
      }
      const result = getUtilManifests(provider, "test", [])

      const deploymentAnnotations = result.deployment.metadata?.annotations
      expect(deploymentAnnotations).to.eql(provider.config.kaniko.annotations)

      const podAnnotations = result.deployment.spec.template.metadata?.annotations
      expect(podAnnotations).to.eql(provider.config.kaniko.annotations)
    })

    it("should return the manifest with util annotations when util annotations are specified", () => {
      provider.config.kaniko = {
        util: {
          annotations: {
            testAnnotation: "its-there",
          },
        },
      }
      const result = getUtilManifests(provider, "test", [])

      const deploymentAnnotations = result.deployment.metadata?.annotations
      expect(deploymentAnnotations).to.eql(provider.config.kaniko.util?.annotations)

      const podAnnotations = result.deployment.spec.template.metadata?.annotations
      expect(podAnnotations).to.eql(provider.config.kaniko.util?.annotations)
    })

    it("should return the manifest with kaniko nodeSelector when util nodeSelector is missing", () => {
      provider.config.kaniko = {
        nodeSelector: { "kubernetes.io/os": "linux" },
      }
      const result = getUtilManifests(provider, "test", [])

      const podNodeSelector = result.deployment.spec.template.spec?.nodeSelector
      expect(podNodeSelector).to.eql(provider.config.kaniko.nodeSelector)
    })

    it("should return the manifest with util nodeSelector when util nodeSelector is specified", () => {
      provider.config.kaniko = {
        util: {
          nodeSelector: { "kubernetes.io/os": "linux" },
        },
      }
      const result = getUtilManifests(provider, "test", [])

      const podNodeSelector = result.deployment.spec.template.spec?.nodeSelector
      expect(podNodeSelector).to.eql(provider.config.kaniko.util?.nodeSelector)
    })
  })
})
