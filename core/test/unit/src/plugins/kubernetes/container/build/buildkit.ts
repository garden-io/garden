/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ContainerModuleOutputs } from "../../../../../../../src/plugins/container/container"
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

describe("getBuildkitImageFlags", () => {
  const cacheConfig = ({ mode = "auto" as ClusterBuildkitCacheConfig["mode"] }): ClusterBuildkitCacheConfig => ({
    type: "registry",
    mode,
    tag: "_buildcache",
    export: true,
  })

  const defaultConfig = [cacheConfig({})]

  const modeFlags = ({ mode, registry = "registry", registryModifier = "" }) => [
    "--output",
    `type=image,"name=${registry}/namespace/name:v-xxxxxx",push=true${registryModifier}`,
    "--import-cache",
    `type=registry,ref=${registry}/namespace/name:_buildcache${registryModifier}`,
    "--export-cache",
    `type=registry,ref=${registry}/namespace/name:_buildcache,mode=${mode}${registryModifier}`,
  ]

  const inlineFlags = ({ registry = "registry" }) => [
    "--export-cache",
    "type=inline",
    "--output",
    `type=image,"name=${registry}/namespace/name:v-xxxxxx,${registry}/namespace/name:_buildcache",push=true`,
    "--import-cache",
    `type=registry,ref=${registry}/namespace/name:_buildcache`,
  ]

  const moduleOutputs = ({ registry = "registry", insecure = false }): ContainerModuleOutputs => ({
    "local-image-id": "name:v-xxxxxx",
    "local-image-name": "name",
    "deployment-image-id": `${registry}/namespace/name:v-xxxxxx`,
    "deployment-image-name": `${registry}/namespace/name`,
    "deployment-registry-insecure": insecure,
  })

  it("returns mode=max cache flags with default config by default", async () => {
    const flags = getBuildkitImageFlags(defaultConfig, moduleOutputs({ registry: "hub.docker.com" }))

    expect(flags).to.eql(modeFlags({ mode: "max", registry: "hub.docker.com" }))
  })

  it("returns inline cache flags with default config when mode=max is not", async () => {
    const flags = getBuildkitImageFlags(defaultConfig, moduleOutputs({ registry: "eu.gcr.io" }))

    expect(flags).to.eql(inlineFlags({ registry: "eu.gcr.io" }))
  })

  it("returns mode=max cache flags with mode=max config", async () => {
    const flags = getBuildkitImageFlags([cacheConfig({ mode: "max" })], moduleOutputs({ registry: "eu.gcr.io" }))

    expect(flags).to.eql(modeFlags({ mode: "max", registry: "eu.gcr.io" }))
  })

  it("returns mode=min cache flags with mode=min config", async () => {
    const flags = getBuildkitImageFlags([cacheConfig({ mode: "min" })], moduleOutputs({ registry: "eu.gcr.io" }))

    expect(flags).to.eql(modeFlags({ mode: "min", registry: "eu.gcr.io" }))
  })

  it("returns inline cache flags with mode=inline config", async () => {
    const flags = getBuildkitImageFlags(
      [cacheConfig({ mode: "inline" })],
      moduleOutputs({ registry: "hub.docker.com" })
    )

    expect(flags).to.eql(inlineFlags({ registry: "hub.docker.com" }))
  })

  it("uses registry.insecure=true with the in-cluster registry", async () => {
    const flags = getBuildkitImageFlags(
      defaultConfig,
      moduleOutputs({ registry: "in-cluster-registry", insecure: true })
    )

    expect(flags).to.eql(
      modeFlags({ mode: "max", registry: "in-cluster-registry", registryModifier: ",registry.insecure=true" })
    )
  })

  it("returns correct flags with separate cache registry", async () => {
    const flags = getBuildkitImageFlags(
      [
        {
          type: "registry",
          registry: {
            hostname: "cacheRegistry",
            namespace: "namespace",
            insecure: false,
          },
          mode: "auto",
          tag: "_buildcache",
          export: true,
        },
      ],
      moduleOutputs({ registry: "deploymentRegistry" })
    )

    expect(flags).to.eql([
      // output to deploymentRegistry
      "--output",
      `type=image,"name=deploymentRegistry/namespace/name:v-xxxxxx",push=true`,

      // import and export to cacheRegistry with mode=max
      "--import-cache",
      `type=registry,ref=cacheRegistry/namespace/name:_buildcache`,
      "--export-cache",
      `type=registry,ref=cacheRegistry/namespace/name:_buildcache,mode=max`,
    ])
  })

  it("returns correct flags for complex feautureBranch / Main branch + separate cache registry use case", async () => {
    const flags = getBuildkitImageFlags(
      [
        {
          type: "registry",
          registry: {
            hostname: "cacheRegistry",
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
            hostname: "cacheRegistry",
            namespace: "namespace",
            insecure: false,
          },
          mode: "auto",
          tag: "_buildcache-main",
          export: false,
        },
      ],
      moduleOutputs({ registry: "deploymentRegistry" })
    )

    expect(flags).to.eql([
      // output to deploymentRegistry
      "--output",
      `type=image,"name=deploymentRegistry/namespace/name:v-xxxxxx",push=true`,
      // import and export to cacheRegistry with mode=max
      // import first _buildcache-featureBranch, then _buildcache-main
      "--import-cache",
      `type=registry,ref=cacheRegistry/namespace/name:_buildcache-featureBranch`,
      "--export-cache",
      `type=registry,ref=cacheRegistry/namespace/name:_buildcache-featureBranch,mode=max`,
      "--import-cache",
      `type=registry,ref=cacheRegistry/namespace/name:_buildcache-main`,
    ])
  })
})
