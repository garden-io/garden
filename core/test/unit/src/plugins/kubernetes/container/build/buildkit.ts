/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { DeepPartial } from "utility-types"
import type { ContainerBuildAction } from "../../../../../../../src/plugins/container/config.js"
import type {
  ClusterBuildkitCacheConfig,
  KubernetesProvider,
} from "../../../../../../../src/plugins/kubernetes/config.js"
import { defaultResources } from "../../../../../../../src/plugins/kubernetes/config.js"
import {
  defaultUtilImageRegistryDomain,
  getBuildkitImagePath,
  getK8sUtilImagePath,
} from "../../../../../../../src/plugins/kubernetes/constants.js"
import {
  getBuildkitDeployment,
  getBuildkitFlags,
  getBuildkitImageFlags,
  makeBuildkitBuildCommand,
} from "../../../../../../../src/plugins/kubernetes/container/build/buildkit.js"
import { getDataDir, makeTestGarden } from "../../../../../../helpers.js"
import { k8sGetContainerBuildActionOutputs } from "../../../../../../../src/plugins/kubernetes/container/handlers.js"

describe("buildkit build", () => {
  describe("getBuildkitDeployment", () => {
    const _provider: DeepPartial<KubernetesProvider> = {
      config: {
        utilImageRegistryDomain: defaultUtilImageRegistryDomain,
        resources: defaultResources,
      },
    }
    let provider = _provider as KubernetesProvider
    beforeEach(() => {
      provider = _provider as KubernetesProvider
    })

    it("should return a Kubernetes Deployment manifest for buildkit in-cluster-builder", () => {
      const result = getBuildkitDeployment(provider, "authSecretName", [{ name: "imagePullSecretName" }])
      expect(result.kind).eql("Deployment")
      expect(result.metadata).eql({
        annotations: undefined,
        labels: {
          app: "garden-buildkit",
        },
        name: "garden-buildkit",
      })
      expect(result.spec.template.metadata).eql({
        annotations: undefined,
        labels: {
          app: "garden-buildkit",
        },
      })

      expect(result.spec.strategy).eql({
        type: "Recreate",
      })

      expect(result.spec.template.spec?.containers.length).eql(2)

      expect(result.spec.template.spec?.containers[0]).eql({
        args: ["--addr", "unix:///run/buildkit/buildkitd.sock"],
        env: [
          {
            name: "DOCKER_CONFIG",
            value: "/.docker",
          },
        ],
        image: getBuildkitImagePath(provider.config.utilImageRegistryDomain),
        name: "buildkitd",
        readinessProbe: {
          exec: {
            command: ["buildctl", "debug", "workers"],
          },
          initialDelaySeconds: 3,
          periodSeconds: 5,
        },
        resources: {
          limits: {
            cpu: "4",
            memory: "8Gi",
          },
          requests: {
            cpu: "100m",
            memory: "512Mi",
          },
        },
        securityContext: {
          privileged: true,
        },
        volumeMounts: [
          {
            mountPath: "/.docker",
            name: "authSecretName",
            readOnly: true,
          },
          {
            mountPath: "/garden-build",
            name: "garden-sync",
          },
        ],
      })

      expect(result.spec.template.spec?.containers[1]).eql({
        command: ["/rsync-server.sh"],
        env: [
          {
            name: "ALLOW",
            value: "0.0.0.0/0",
          },
          {
            name: "RSYNC_PORT",
            value: "8730",
          },
        ],
        image: getK8sUtilImagePath(provider.config.utilImageRegistryDomain),
        imagePullPolicy: "IfNotPresent",
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
        name: "util",
        ports: [
          {
            containerPort: 8730,
            name: "garden-rsync",
            protocol: "TCP",
          },
        ],
        readinessProbe: {
          failureThreshold: 5,
          initialDelaySeconds: 1,
          periodSeconds: 1,
          successThreshold: 2,
          tcpSocket: {
            port: "garden-rsync",
          },
          timeoutSeconds: 3,
        },
        resources: {
          limits: {
            cpu: "256m",
            memory: "512Mi",
          },
          requests: {
            cpu: "256m",
            memory: "512Mi",
          },
        },
        securityContext: {
          runAsGroup: 1000,
          runAsUser: 1000,
        },
        volumeMounts: [
          {
            mountPath: "/home/user/.docker",
            name: "authSecretName",
            readOnly: true,
          },
          {
            mountPath: "/data",
            name: "garden-sync",
          },
        ],
      })
    })

    it("should return a Kubernetes Deployment with the configured annotations", () => {
      provider.config.clusterBuildkit = {
        cache: [],
        annotations: {
          buildkitAnnotation: "is-there",
        },
      }
      const result = getBuildkitDeployment(provider, "authSecretName", [{ name: "imagePullSecretName" }])
      expect(result.metadata.annotations).eql(provider.config.clusterBuildkit.annotations)
      expect(result.spec.template.metadata?.annotations).eql(provider.config.clusterBuildkit.annotations)
    })

    it("should use a custom container registry if set by user", () => {
      const providerWithCustomRegistry = {
        ...provider,
        config: {
          ...provider.config,
          utilImageRegistryDomain: "https://my-custom-registry-mirror.io",
        },
      }

      const result = getBuildkitDeployment(providerWithCustomRegistry, "authSecretName", [
        { name: "imagePullSecretName" },
      ])

      expect(result.spec.template.spec?.containers[0].image).to.eql(
        getBuildkitImagePath("https://my-custom-registry-mirror.io")
      )
      expect(result.spec.template.spec?.containers[1].image).to.eql(
        getK8sUtilImagePath("https://my-custom-registry-mirror.io")
      )
    })
  })

  describe("getBuildkitFlags", () => {
    it("should correctly format the build target option", async () => {
      const projectRoot = getDataDir("test-project-container")
      const garden = await makeTestGarden(projectRoot)
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const rawBuild = graph.getBuild("module-a") as ContainerBuildAction
      const build = await garden.resolveAction({ action: rawBuild, log: garden.log, graph })

      build._config.spec.targetStage = "foo"

      const flags = getBuildkitFlags(build, garden.log)
      const versionString = build.versionString(garden.log)

      expect(flags).to.eql([
        "--opt",
        "build-arg:GARDEN_MODULE_VERSION=" + versionString,
        "--opt",
        "build-arg:GARDEN_ACTION_VERSION=" + versionString,
        "--opt",
        "target=foo",
      ])
    })
  })

  describe("makeBuildkitBuildCommand", () => {
    const _provider: DeepPartial<KubernetesProvider> = {
      config: {
        utilImageRegistryDomain: defaultUtilImageRegistryDomain,
        resources: defaultResources,
        clusterBuildkit: {
          cache: [],
          annotations: {},
        },
        deploymentRegistry: {
          hostname: "gcr.io/deploymentRegistry",
          namespace: "namespace",
          insecure: false,
        },
      },
    }
    let provider = _provider as KubernetesProvider
    beforeEach(() => {
      provider = _provider as KubernetesProvider
    })

    it("should return the correctly formatted buildkit build command", async () => {
      const projectRoot = getDataDir("test-project-container")
      const garden = await makeTestGarden(projectRoot)
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const rawBuild = graph.getBuild("module-a") as ContainerBuildAction
      const action = await garden.resolveAction({ action: rawBuild, log: garden.log, graph })
      action._config.spec.targetStage = "foo"
      const contextPath = `/garden-build/some-hash/${action.name}`
      const outputs = k8sGetContainerBuildActionOutputs({ provider, action, log: garden.log })

      const buildCommand = makeBuildkitBuildCommand({
        provider,
        outputs,
        action,
        contextPath,
        dockerfile: "dockerfile",
        log: garden.log,
      })
      const cdCmd = `cd ${contextPath}`
      const versionString = action.versionString(garden.log)
      const buildctlCmd = `'buildctl' 'build' '--frontend=dockerfile.v0' '--local' 'context=${contextPath}' '--local' 'dockerfile=${contextPath}' '--opt' 'filename=dockerfile' '--output' 'type=image,"name=gcr.io/deploymentRegistry/namespace/${
        action.name
      }:${versionString}",push=true' '--opt' 'build-arg:GARDEN_MODULE_VERSION=${versionString}' '--opt' 'build-arg:GARDEN_ACTION_VERSION=${versionString}' '--opt' 'target=foo'`

      expect(buildCommand).to.eql(["sh", "-c", `${cdCmd} && ${buildctlCmd}`])
    })
  })

  describe("getBuildkitImageFlags()", () => {
    const defaultConfig: ClusterBuildkitCacheConfig[] = [
      {
        type: "registry",
        mode: "auto",
        tag: "_buildcache",
        export: true,
      },
    ]

    // test autodetection for mode=inline
    const expectedInline = [
      // The following registries are actually known NOT to support mode=max
      "gcr.io",
      // Most self-hosted registries actually support mode=max, but because
      // Harbor actually doesn't, we need to default to inline.
      "anyOtherRegistry",
      "127.0.0.1",
    ]
    for (const registry of expectedInline) {
      it(`returns type=inline cache flags with default config with registry ${registry}`, async () => {
        const moduleOutputs = {
          "local-image-id": "name:v-xxxxxx",
          "local-image-name": "name",
          "deployment-image-id": `${registry}/namespace/name:v-xxxxxx`,
          "deployment-image-name": `${registry}/namespace/name`,
        }

        const flags = getBuildkitImageFlags(defaultConfig, moduleOutputs, false)

        expect(flags).to.eql([
          "--export-cache",
          "type=inline",
          "--output",
          `type=image,"name=${registry}/namespace/name:v-xxxxxx,${registry}/namespace/name:_buildcache",push=true`,
          "--import-cache",
          `type=registry,ref=${registry}/namespace/name:_buildcache`,
        ])
      })
    }

    // AWS ECR supports mode=max with image-manifest=true option
    const expectedMaxWithImageManifest = [
      "aws_account_id.dkr.ecr.region.amazonaws.com",
      "keks.dkr.ecr.bla.amazonaws.com",
    ]
    for (const registry of expectedMaxWithImageManifest) {
      it(`returns mode=max cache flags with image-manifest=true for registry ${registry}`, async () => {
        const moduleOutputs = {
          "local-image-id": "name:v-xxxxxx",
          "local-image-name": "name",
          "deployment-image-id": `${registry}/namespace/name:v-xxxxxx`,
          "deployment-image-name": `${registry}/namespace/name`,
        }

        const flags = getBuildkitImageFlags(defaultConfig, moduleOutputs, false)

        expect(flags).to.eql([
          "--output",
          `type=image,"name=${registry}/namespace/name:v-xxxxxx",push=true`,
          "--import-cache",
          `type=registry,ref=${registry}/namespace/name:_buildcache`,
          "--export-cache",
          `image-manifest=true,type=registry,ref=${registry}/namespace/name:_buildcache,mode=max`,
        ])
      })
    }

    // test autodetection for mode=max
    const expectedMax = [
      // The following registries are known to actually support mode=max
      "index.docker.io",
      "pkg.dev",
      "some.subdomain.pkg.dev",
      "ghcr.io",
      "GHCR.io",
      "azurecr.io",
      "some.subdomain.azurecr.io",
    ]

    for (const registry of expectedMax) {
      it(`returns mode=max cache flags with default config with registry ${registry}`, async () => {
        const moduleOutputs = {
          "local-image-id": "name:v-xxxxxx",
          "local-image-name": "name",
          "deployment-image-id": `${registry}/namespace/name:v-xxxxxx`,
          "deployment-image-name": `${registry}/namespace/name`,
        }

        const flags = getBuildkitImageFlags(defaultConfig, moduleOutputs, false)

        expect(flags).to.eql([
          "--output",
          `type=image,"name=${registry}/namespace/name:v-xxxxxx",push=true`,
          "--import-cache",
          `type=registry,ref=${registry}/namespace/name:_buildcache`,
          "--export-cache",
          `type=registry,ref=${registry}/namespace/name:_buildcache,mode=max`,
        ])
      })
    }

    // explicit min / max
    const explicitModes: ClusterBuildkitCacheConfig["mode"][] = ["min", "max"]
    for (const mode of explicitModes) {
      it(`returns mode=${mode} cache flags if explicitly configured`, async () => {
        const registry = "explicitTeamRegistry"

        const moduleOutputs = {
          "local-image-id": "name:v-xxxxxx",
          "local-image-name": "name",
          "deployment-image-id": `${registry}/namespace/name:v-xxxxxx`,
          "deployment-image-name": `${registry}/namespace/name`,
        }

        const config: ClusterBuildkitCacheConfig[] = [
          {
            type: "registry",
            mode,
            tag: "_buildcache",
            export: true,
          },
        ]

        const flags = getBuildkitImageFlags(config, moduleOutputs, false)

        expect(flags).to.eql([
          "--output",
          `type=image,"name=${registry}/namespace/name:v-xxxxxx",push=true`,
          "--import-cache",
          `type=registry,ref=${registry}/namespace/name:_buildcache`,
          "--export-cache",
          `type=registry,ref=${registry}/namespace/name:_buildcache,mode=${mode}`,
        ])
      })
    }

    // explicit inline
    it(`returns type=inline cache flags when explicitly configured`, async () => {
      const registry = "someExplicitInlineRegistry"

      const moduleOutputs = {
        "local-image-id": "name:v-xxxxxx",
        "local-image-name": "name",
        "deployment-image-id": `${registry}/namespace/name:v-xxxxxx`,
        "deployment-image-name": `${registry}/namespace/name`,
      }

      const config: ClusterBuildkitCacheConfig[] = [
        {
          type: "registry",
          mode: "inline",
          tag: "_buildcache",
          export: true,
        },
      ]

      const flags = getBuildkitImageFlags(config, moduleOutputs, false)

      expect(flags).to.eql([
        "--export-cache",
        "type=inline",
        "--output",
        `type=image,"name=${registry}/namespace/name:v-xxxxxx,${registry}/namespace/name:_buildcache",push=true`,
        "--import-cache",
        `type=registry,ref=${registry}/namespace/name:_buildcache`,
      ])
    })

    it("returns correct flags with separate cache registry", async () => {
      const deploymentRegistry = "gcr.io/deploymentRegistry"
      const cacheRegistry = "pkg.dev/cacheRegistry"

      const moduleOutputs = {
        "local-image-id": "name:v-xxxxxx",
        "local-image-name": "name",
        "deployment-image-id": `${deploymentRegistry}/namespace/name:v-xxxxxx`,
        "deployment-image-name": `${deploymentRegistry}/namespace/name`,
      }

      const config: ClusterBuildkitCacheConfig[] = [
        {
          type: "registry",
          registry: {
            hostname: cacheRegistry,
            namespace: "namespace",
            insecure: false,
          },
          mode: "auto",
          tag: "_buildcache",
          export: true,
        },
      ]

      const flags = getBuildkitImageFlags(config, moduleOutputs, false)

      expect(flags).to.eql([
        // output to deploymentRegistry
        "--output",
        `type=image,"name=${deploymentRegistry}/namespace/name:v-xxxxxx",push=true`,

        // import and export to cacheRegistry with mode=max
        "--import-cache",
        `type=registry,ref=${cacheRegistry}/namespace/name:_buildcache`,
        "--export-cache",
        `type=registry,ref=${cacheRegistry}/namespace/name:_buildcache,mode=max`,
      ])
    })

    it("returns correct flags for complex cache registry use case", async () => {
      const deploymentRegistry = "gcr.io/someBigTeamDeploymentRegistry"
      const cacheRegistry = "pkg.dev/someBigTeamCacheRegistry"

      const moduleOutputs = {
        "local-image-id": "name:v-xxxxxx",
        "local-image-name": "name",
        "deployment-image-id": `${deploymentRegistry}/namespace/name:v-xxxxxx`,
        "deployment-image-name": `${deploymentRegistry}/namespace/name`,
      }

      const config: ClusterBuildkitCacheConfig[] = [
        {
          type: "registry",
          registry: {
            hostname: cacheRegistry,
            namespace: "namespace",
            insecure: false,
          },
          mode: "auto",
          tag: "_buildcache-featureBranch",
          export: true,
        },
        {
          type: "registry",
          registry: {
            hostname: cacheRegistry,
            namespace: "namespace",
            insecure: false,
          },
          mode: "auto",
          tag: "_buildcache-main",
          export: false,
        },
      ]

      const flags = getBuildkitImageFlags(config, moduleOutputs, false)

      expect(flags).to.eql([
        // output to deploymentRegistry
        "--output",
        `type=image,"name=${deploymentRegistry}/namespace/name:v-xxxxxx",push=true`,
        // import and export to cacheRegistry with mode=max
        // import first _buildcache-featureBranch, then _buildcache-main
        "--import-cache",
        `type=registry,ref=${cacheRegistry}/namespace/name:_buildcache-featureBranch`,
        "--export-cache",
        `type=registry,ref=${cacheRegistry}/namespace/name:_buildcache-featureBranch,mode=max`,
        "--import-cache",
        `type=registry,ref=${cacheRegistry}/namespace/name:_buildcache-main`,
      ])
    })
  })
})
