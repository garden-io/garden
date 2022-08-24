/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ClusterBuildkitCacheConfig } from "../../../../../../../src/plugins/kubernetes/config"
import { getBuildkitImageFlags } from "../../../../../../../src/plugins/kubernetes/container/build/buildkit"
import { ContainerBuildAction } from "../../../../../../../src/plugins/container/config"
import { getBuildkitFlags } from "../../../../../../../src/plugins/kubernetes/container/build/buildkit"
import { getDataDir, makeTestGarden } from "../../../../../../helpers"

describe("getBuildkitModuleFlags", () => {
  it("should correctly format the build target option", async () => {
    const projectRoot = getDataDir("test-project-container")
    const garden = await makeTestGarden(projectRoot)
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const rawBuild = graph.getBuild("module-a.build") as ContainerBuildAction
    const build = await garden.resolveAction({ action: rawBuild, log: garden.log, graph })

    build._config.spec.targetStage = "foo"

    const flags = getBuildkitFlags(build)

    expect(flags).to.eql(["--opt", "build-arg:GARDEN_MODULE_VERSION=" + build.versionString, "--opt", "target=foo"])
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
    "eu.gcr.io",
    "gcr.io",
    "aws_account_id.dkr.ecr.region.amazonaws.com",
    "keks.dkr.ecr.bla.amazonaws.com",
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

  // test autodetection for mode=max
  const expectedMax = [
    // The following registries are known to actually support mode=max
    "hub.docker.com",
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

  it("returns correct flags for complex feautureBranch / Main branch + separate cache registry use case", async () => {
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
