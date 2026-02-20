/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  convertHostPath,
  isLocalVolumesEnabled,
  configureLocalVolumes,
} from "../../../../../src/plugins/kubernetes/local-volumes.js"
import type { LocalVolumesActionSpec } from "../../../../../src/plugins/kubernetes/local-volumes.js"
import type { KubernetesTargetResourceSpec } from "../../../../../src/plugins/kubernetes/config.js"
import type { KubernetesResource } from "../../../../../src/plugins/kubernetes/types.js"
import type { Log } from "../../../../../src/logger/log-entry.js"

// Minimal mock for Log
const mockLog = {
  verbose: () => {},
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  silly: () => {},
} as unknown as Log

describe("local-volumes", () => {
  describe("isLocalVolumesEnabled", () => {
    it("should return true when no action spec is provided", () => {
      expect(isLocalVolumesEnabled()).to.be.true
    })

    it("should return true when action spec has no enabled field", () => {
      expect(isLocalVolumesEnabled({})).to.be.true
    })

    it("should return true when action spec has enabled=true", () => {
      expect(isLocalVolumesEnabled({ enabled: true })).to.be.true
    })

    it("should return false when action spec has enabled=false", () => {
      expect(isLocalVolumesEnabled({ enabled: false })).to.be.false
    })

    it("should return true when action spec has enabled=undefined", () => {
      expect(isLocalVolumesEnabled({ enabled: undefined })).to.be.true
    })
  })

  describe("convertHostPath", () => {
    describe("kind cluster", () => {
      it("should return path as-is on macOS", () => {
        expect(convertHostPath("/Users/dev/project", "darwin", "kind")).to.equal("/Users/dev/project")
      })

      it("should return path as-is on Linux", () => {
        expect(convertHostPath("/home/dev/project", "linux", "kind")).to.equal("/home/dev/project")
      })

      it("should return path as-is on Windows", () => {
        expect(convertHostPath("C:\\Users\\dev\\project", "windows", "kind")).to.equal("C:\\Users\\dev\\project")
      })
    })

    describe("minikube cluster", () => {
      it("should return path as-is on macOS", () => {
        expect(convertHostPath("/Users/dev/project", "darwin", "minikube")).to.equal("/Users/dev/project")
      })

      it("should return path as-is on Linux", () => {
        expect(convertHostPath("/home/dev/project", "linux", "minikube")).to.equal("/home/dev/project")
      })
    })

    describe("generic cluster (Docker Desktop)", () => {
      it("should return path as-is on macOS", () => {
        expect(convertHostPath("/Users/dev/project", "darwin", "generic")).to.equal("/Users/dev/project")
      })

      it("should prefix with /host_mnt on Linux", () => {
        expect(convertHostPath("/home/dev/project", "linux", "generic")).to.equal("/host_mnt/home/dev/project")
      })

      it("should prefix with /host_mnt on Alpine", () => {
        expect(convertHostPath("/home/dev/project", "alpine", "generic")).to.equal("/host_mnt/home/dev/project")
      })

      it("should convert Windows drive letter paths", () => {
        expect(convertHostPath("C:\\Users\\dev\\project", "windows", "generic")).to.equal(
          "/run/desktop/mnt/host/c/Users/dev/project"
        )
      })

      it("should handle Windows paths with forward slashes", () => {
        expect(convertHostPath("C:/Users/dev/project", "windows", "generic")).to.equal(
          "/run/desktop/mnt/host/c/Users/dev/project"
        )
      })

      it("should handle lowercase drive letters", () => {
        expect(convertHostPath("d:\\data\\project", "windows", "generic")).to.equal(
          "/run/desktop/mnt/host/d/data/project"
        )
      })
    })

    describe("no cluster type", () => {
      it("should apply platform-based conversion on Linux with no cluster type", () => {
        expect(convertHostPath("/home/dev/project", "linux", undefined)).to.equal("/host_mnt/home/dev/project")
      })

      it("should return path as-is on macOS with no cluster type", () => {
        expect(convertHostPath("/Users/dev/project", "darwin", undefined)).to.equal("/Users/dev/project")
      })
    })
  })

  describe("configureLocalVolumes", () => {
    function makeDeployment(name: string): KubernetesResource {
      return {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: "main",
                  image: "nginx:latest",
                },
              ],
            },
          },
        },
      }
    }

    // Use "kind" cluster type so that convertHostPath passes paths through as-is on all platforms.
    // ("generic" on Linux would add a /host_mnt prefix, causing CI failures.)
    function makeProvider(clusterType?: string): any {
      return {
        config: {
          clusterType: clusterType ?? "kind",
          context: "docker-desktop",
        },
      }
    }

    function makeAction(localVolumes: LocalVolumesActionSpec, defaultTarget?: KubernetesTargetResourceSpec): any {
      return {
        getSpec: () => ({ localVolumes, defaultTarget }),
        sourcePath: () => "/Users/dev/project",
        mode: () => "default",
      }
    }

    it("should return original manifests when localVolumes is not enabled", async () => {
      const manifests = [makeDeployment("test")]
      const provider = makeProvider()
      const action = makeAction({
        enabled: false,
        volumes: [{ name: "vol", sourcePath: "src", containerPath: "/app" }],
      })

      const result = await configureLocalVolumes({ provider, action, manifests, log: mockLog })
      expect(result.updated).to.have.length(0)
    })

    it("should return original manifests when no volumes are specified", async () => {
      const manifests = [makeDeployment("test")]
      const provider = makeProvider()
      const action = makeAction({ enabled: true, volumes: [] })

      const result = await configureLocalVolumes({ provider, action, manifests, log: mockLog })
      expect(result.updated).to.have.length(0)
    })

    it("should inject volume and volumeMount into the target deployment", async () => {
      const manifests = [makeDeployment("my-app")]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "my-app" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [{ name: "backend", sourcePath: "backend", containerPath: "/var/code/backend" }],
        },
        defaultTarget
      )

      const result = await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })

      expect(result.updated).to.have.length(1)
      const updatedDeployment = result.manifests[0]
      const podSpec = updatedDeployment.spec.template.spec

      expect(podSpec.volumes).to.have.length(1)
      expect(podSpec.volumes[0].name).to.equal("backend")
      expect(podSpec.volumes[0].hostPath.path).to.equal("/Users/dev/project/backend")
      expect(podSpec.volumes[0].hostPath.type).to.equal("DirectoryOrCreate")

      expect(podSpec.containers[0].volumeMounts).to.have.length(1)
      expect(podSpec.containers[0].volumeMounts[0].name).to.equal("backend")
      expect(podSpec.containers[0].volumeMounts[0].mountPath).to.equal("/var/code/backend")
    })

    it("should inject multiple volumes into the same target", async () => {
      const manifests = [makeDeployment("my-app")]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "my-app" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [
            { name: "backend", sourcePath: "backend", containerPath: "/var/code/backend" },
            { name: "frontend", sourcePath: "frontend", containerPath: "/var/code/frontend" },
          ],
        },
        defaultTarget
      )

      const result = await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })

      const podSpec = result.manifests[0].spec.template.spec
      expect(podSpec.volumes).to.have.length(2)
      expect(podSpec.containers[0].volumeMounts).to.have.length(2)
    })

    it("should use per-volume target over defaultTarget", async () => {
      const manifests = [makeDeployment("app-a"), makeDeployment("app-b")]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "app-a" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [
            { name: "vol-a", sourcePath: "src-a", containerPath: "/app-a" },
            {
              name: "vol-b",
              target: { kind: "Deployment", name: "app-b" },
              sourcePath: "src-b",
              containerPath: "/app-b",
            },
          ],
        },
        defaultTarget
      )

      const result = await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })

      expect(result.updated).to.have.length(2)

      // vol-a should be in app-a
      const appA = result.manifests.find((m) => m.metadata.name === "app-a")!
      expect(appA.spec.template.spec.volumes[0].name).to.equal("vol-a")

      // vol-b should be in app-b
      const appB = result.manifests.find((m) => m.metadata.name === "app-b")!
      expect(appB.spec.template.spec.volumes[0].name).to.equal("vol-b")
    })

    it("should throw if cluster is not local (no clusterType)", async () => {
      const manifests = [makeDeployment("my-app")]
      const provider = { config: {} } as any // no clusterType
      const defaultTarget = { kind: "Deployment" as const, name: "my-app" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [{ name: "vol", sourcePath: "src", containerPath: "/app" }],
        },
        defaultTarget
      )

      try {
        await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })
        expect.fail("should have thrown")
      } catch (err: any) {
        expect(err.message).to.include("only supported on local Kubernetes clusters")
      }
    })

    it("should throw if no target and no defaultTarget is set", async () => {
      const manifests = [makeDeployment("my-app")]
      const provider = makeProvider()
      const action = makeAction({
        enabled: true,
        volumes: [{ name: "vol", sourcePath: "src", containerPath: "/app" }],
      })

      try {
        await configureLocalVolumes({ provider, action, manifests, log: mockLog })
        expect.fail("should have thrown")
      } catch (err: any) {
        expect(err.message).to.include("no target specified")
      }
    })

    it("should throw if defaultTarget only has podSelector (no kind/name)", async () => {
      const manifests = [makeDeployment("my-app")]
      const provider = makeProvider()
      const defaultTarget = { podSelector: { app: "my-app" } } as KubernetesTargetResourceSpec
      const action = makeAction(
        {
          enabled: true,
          volumes: [{ name: "vol", sourcePath: "src", containerPath: "/app" }],
        },
        defaultTarget
      )

      try {
        await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })
        expect.fail("should have thrown")
      } catch (err: any) {
        expect(err.message).to.include("no target specified")
      }
    })

    it("should throw if target resource is not found in manifests", async () => {
      const manifests = [makeDeployment("other-app")]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "my-app" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [{ name: "vol", sourcePath: "src", containerPath: "/app" }],
        },
        defaultTarget
      )

      try {
        await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })
        expect.fail("should have thrown")
      } catch (err: any) {
        expect(err.message).to.include("Could not find target resource")
      }
    })

    it("should not modify the original manifests (deep clone)", async () => {
      const original = makeDeployment("my-app")
      const manifests = [original]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "my-app" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [{ name: "vol", sourcePath: "src", containerPath: "/app" }],
        },
        defaultTarget
      )

      await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })

      // Original should not have been modified
      expect(original.spec.template.spec.volumes).to.be.undefined
      expect(original.spec.template.spec.containers[0].volumeMounts).to.be.undefined
    })

    it("should not add duplicate volumes with the same name", async () => {
      const deployment = makeDeployment("my-app")
      deployment.spec.template.spec.volumes = [{ name: "existing-vol", hostPath: { path: "/old/path" } }]
      deployment.spec.template.spec.containers[0].volumeMounts = [{ name: "existing-vol", mountPath: "/old/mount" }]

      const manifests = [deployment]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "my-app" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [{ name: "existing-vol", sourcePath: "src", containerPath: "/app" }],
        },
        defaultTarget
      )

      const result = await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })

      const podSpec = result.manifests[0].spec.template.spec
      // Should not duplicate
      expect(podSpec.volumes).to.have.length(1)
      expect(podSpec.containers[0].volumeMounts).to.have.length(1)
    })

    it("should inject emptyDir mask volumes for excludes", async () => {
      const manifests = [makeDeployment("my-app")]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "my-app" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [
            {
              name: "app-code",
              sourcePath: ".",
              containerPath: "/app",
              excludes: ["node_modules", ".cache"],
            },
          ],
        },
        defaultTarget
      )

      const result = await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })

      const podSpec = result.manifests[0].spec.template.spec

      // Should have 3 volumes: 1 hostPath + 2 emptyDir masks
      expect(podSpec.volumes).to.have.length(3)
      expect(podSpec.volumes[0].name).to.equal("app-code")
      expect(podSpec.volumes[0].hostPath).to.exist
      expect(podSpec.volumes[1].name).to.equal("app-code-node-modules")
      expect(podSpec.volumes[1].emptyDir).to.deep.equal({})
      expect(podSpec.volumes[2].name).to.equal("app-code-cache")
      expect(podSpec.volumes[2].emptyDir).to.deep.equal({})

      // Should have 3 volumeMounts: 1 for the main volume + 2 for the masks
      expect(podSpec.containers[0].volumeMounts).to.have.length(3)
      expect(podSpec.containers[0].volumeMounts[0].mountPath).to.equal("/app")
      expect(podSpec.containers[0].volumeMounts[1].mountPath).to.equal("/app/node_modules")
      expect(podSpec.containers[0].volumeMounts[1].name).to.equal("app-code-node-modules")
      expect(podSpec.containers[0].volumeMounts[2].mountPath).to.equal("/app/.cache")
      expect(podSpec.containers[0].volumeMounts[2].name).to.equal("app-code-cache")
    })

    it("should handle excludes with nested paths", async () => {
      const manifests = [makeDeployment("my-app")]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "my-app" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [
            {
              name: "code",
              sourcePath: ".",
              containerPath: "/app",
              excludes: ["vendor/bundle"],
            },
          ],
        },
        defaultTarget
      )

      const result = await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })

      const podSpec = result.manifests[0].spec.template.spec

      expect(podSpec.volumes).to.have.length(2)
      expect(podSpec.volumes[1].name).to.equal("code-vendor-bundle")
      expect(podSpec.volumes[1].emptyDir).to.deep.equal({})

      expect(podSpec.containers[0].volumeMounts[1].mountPath).to.equal("/app/vendor/bundle")
    })

    it("should not add excludes when the list is empty", async () => {
      const manifests = [makeDeployment("my-app")]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "my-app" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [
            {
              name: "code",
              sourcePath: ".",
              containerPath: "/app",
              excludes: [],
            },
          ],
        },
        defaultTarget
      )

      const result = await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })

      const podSpec = result.manifests[0].spec.template.spec
      expect(podSpec.volumes).to.have.length(1)
      expect(podSpec.containers[0].volumeMounts).to.have.length(1)
    })

    it("should target a specific container by name", async () => {
      const deployment = makeDeployment("my-app")
      deployment.spec.template.spec.containers.push({
        name: "sidecar",
        image: "sidecar:latest",
      } as any)

      const manifests = [deployment]
      const provider = makeProvider()
      const defaultTarget = { kind: "Deployment" as const, name: "my-app", containerName: "sidecar" }
      const action = makeAction(
        {
          enabled: true,
          volumes: [{ name: "vol", sourcePath: "src", containerPath: "/app" }],
        },
        defaultTarget
      )

      const result = await configureLocalVolumes({ provider, action, defaultTarget, manifests, log: mockLog })

      const podSpec = result.manifests[0].spec.template.spec
      // Volume should be on the sidecar container, not main
      expect(podSpec.containers[0].volumeMounts).to.be.undefined
      expect(podSpec.containers[1].volumeMounts).to.have.length(1)
      expect(podSpec.containers[1].volumeMounts[0].name).to.equal("vol")
    })
  })
})
