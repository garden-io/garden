/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ClusterBuildkitCacheConfig } from "../../../../../../../src/plugins/kubernetes/config"
import {
  getBuildkitImageFlags,
  getBuildkitModuleFlags,
} from "../../../../../../../src/plugins/kubernetes/container/build/buildkit"
import { getDataDir, makeTestGarden } from "../../../../../../helpers"

describe("getBuildkitModuleFlags", () => {
  it("should correctly format the build target option", async () => {
    const projectRoot = getDataDir("test-project-container")
    const garden = await makeTestGarden(projectRoot)
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const module = graph.getModule("module-a")

    module.spec.build.targetImage = "foo"

    const flags = getBuildkitModuleFlags(module)

    expect(flags).to.eql([
      "--opt",
      "build-arg:GARDEN_MODULE_VERSION=" + module.version.versionString,
      "--opt",
      "target=foo",
    ])
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
    "eu.gcr.io",
    "gcr.io",
    "aws_account_id.dkr.ecr.region.amazonaws.com",
    "keks.dkr.ecr.bla.amazonaws.com",
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

  // test autodetection for mode=max
  const expectedMax = ["anyOtherRegistry", "hub.docker.com", "blakekswtf", "127.0.0.1"]
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

  it("uses registry.insecure=true with the in-cluster registry", async () => {
    const registry = "in-kubernetes-registry.local:5000"

    const moduleOutputs = {
      "local-image-id": "name:v-xxxxxx",
      "local-image-name": "name",
      "deployment-image-id": `${registry}/namespace/name:v-xxxxxx`,
      "deployment-image-name": `${registry}/namespace/name`,
    }

    const flags = getBuildkitImageFlags(
      defaultConfig,
      moduleOutputs,
      true // deploymentRegistryInsecure
    )

    expect(flags).to.eql([
      "--output",
      `type=image,"name=${registry}/namespace/name:v-xxxxxx",push=true,registry.insecure=true`,
      "--import-cache",
      `type=registry,ref=${registry}/namespace/name:_buildcache,registry.insecure=true`,
      "--export-cache",
      `type=registry,ref=${registry}/namespace/name:_buildcache,mode=max,registry.insecure=true`,
    ])
  })

  it("returns correct flags with separate cache registry", async () => {
    const deploymentRegistry = "deploymentRegistry"
    const cacheRegistry = "cacheRegistry"

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

  it("returns correct flags for complex feautureBranch / Main branch + separate cache registry use case", async () => {
    const deploymentRegistry = "someBigTeamDeploymentRegistry"
    const cacheRegistry = "someBigTeamCacheRegistry"

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
