/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expectError, makeTestGarden, TestGarden } from "@garden-io/sdk/build/src/testing"
import { expect } from "chai"
import { detectProjectType, getBuildFlags, JibBuildAction } from "../src/util"
import { join, resolve } from "path"
import { ResolvedConfigGraph } from "@garden-io/core/build/src/graph/config-graph"
import { Resolved } from "@garden-io/core/build/src/actions/types"
import { gardenPlugin } from "../src/index"
import { rm } from "fs/promises"
import { createFile } from "fs-extra"

describe("util", function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(180 * 1000) // initial jib build can take a long time

  const projectRoot = resolve(__dirname, "../../test/", "test-project")

  let garden: TestGarden
  let graph: ResolvedConfigGraph
  let action: Resolved<JibBuildAction>
  let buildPath: string

  before(async () => {
    garden = await makeTestGarden(projectRoot, {
      plugins: [gardenPlugin()],
    })
  })

  beforeEach(async () => {
    graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })
    action = graph.getBuild("foo")
    buildPath = action.getBuildPath()
  })

  describe("detectProjectType", async () => {
    afterEach(async () => {
      try {
        await rm(join(`${buildPath}/build.gradle`), { recursive: true })
      } catch (e) {}
      try {
        await rm(join(`${buildPath}/pom.xml`), { recursive: true })
      } catch (e) {}
    })

    it("returns gradle if action files include a gradle config", async () => {
      await createFile(resolve(buildPath, "build.gradle"))

      expect(await detectProjectType(action)).to.equal("gradle")
    })

    it("returns maven if action files include a maven config", async () => {
      await createFile(resolve(buildPath, "pom.xml"))

      expect(await detectProjectType(action)).to.equal("maven")
    })

    it("throws if no maven or gradle config is in the action file list", async () => {
      await expectError(() => detectProjectType(action), {
        contains: `Could not detect a gradle or maven project to build ${action.longDescription()}`,
      })
    })
  })

  const imageId = "foo:abcdef"

  describe("getBuildFlags", () => {
    it("correctly sets default build flags", () => {
      action["_staticOutputs"].deploymentImageId = imageId

      const versionString = action.getFullVersion().versionString
      const { args } = getBuildFlags(action, "gradle")

      expect(args).to.eql([
        "jib",
        `-Djib.to.image=${imageId}`,
        `-Djib.container.args=GARDEN_MODULE_VERSION=${versionString},GARDEN_ACTION_VERSION=${versionString}`,
        "-Dstyle.color=always",
        "-Djansi.passthrough=true",
        "-Djib.console=plain",
      ])
    })

    it("correctly sets the target for maven", () => {
      action["_staticOutputs"].deploymentImageId = imageId

      const versionString = action.getFullVersion().versionString
      const { args } = getBuildFlags(action, "maven")

      expect(args).to.include("jib:build")
    })

    it("sets target dir to target/ for maven projects", () => {
      action["_staticOutputs"].deploymentImageId = imageId
      action.getSpec().tarOnly = true

      const versionString = action.getFullVersion().versionString
      const { args, tarPath } = getBuildFlags(action, "maven")

      expect(args).to.include(`-Djib.outputPaths.tar=target/jib-image-foo-${versionString}.tar`)
      expect(tarPath).to.include(`/target/jib-image-foo-${versionString}.tar`)
    })

    it("adds extraFlags if set in action spec", () => {
      action["_staticOutputs"].deploymentImageId = imageId
      action.getSpec().extraFlags = ["bloop"]

      const { args } = getBuildFlags(action, "maven")
      expect(args).to.include("bloop")
    })

    it("adds docker build args if set in buildAction spec", () => {
      action["_staticOutputs"].deploymentImageId = imageId
      action.getSpec().buildArgs = { foo: "bar" }

      const versionString = action.getFullVersion().versionString
      const { args } = getBuildFlags(action, "maven")

      expect(args).to.include(
        `-Djib.container.args=GARDEN_MODULE_VERSION=${versionString},GARDEN_ACTION_VERSION=${versionString},foo=bar`
      )
    })

    it("sets OCI tar format if tarOnly and tarFormat=oci are set", () => {
      action["_staticOutputs"].deploymentImageId = imageId
      action.getSpec().buildArgs = { foo: "bar" }
      action.getSpec().tarOnly = true
      action.getSpec().tarFormat = "oci"

      const { args } = getBuildFlags(action, "maven")

      expect(args).to.include("-Djib.container.format=OCI")
    })

    context("tarOnly=true", () => {
      it("sets correct target and output paths", () => {
        action["_staticOutputs"].deploymentImageId = imageId
        action.getSpec().tarOnly = true

        const { args } = getBuildFlags(action, "gradle")
        const versionString = action.getFullVersion().versionString

        const targetDir = "build"
        const basenameSuffix = `-foo-${versionString}`

        expect(args).to.eql([
          "jibBuildTar",
          `-Djib.to.image=${imageId}`,
          `-Djib.container.args=GARDEN_MODULE_VERSION=${versionString},GARDEN_ACTION_VERSION=${versionString}`,
          "-Dstyle.color=always",
          "-Djansi.passthrough=true",
          "-Djib.console=plain",
          `-Djib.outputPaths.tar=${targetDir}/jib-image${basenameSuffix}.tar`,
          `-Djib.outputPaths.digest=${targetDir}/jib-image${basenameSuffix}.digest`,
          `-Djib.outputPaths.imageId=${targetDir}/jib-image${basenameSuffix}.id`,
          `-Djib.outputPaths.imageJson=${targetDir}/jib-image${basenameSuffix}.json`,
        ])
      })

      it("correctly sets the target for maven", () => {
        action["_staticOutputs"].deploymentImageId = imageId
        action.getSpec().tarOnly = true

        const { args } = getBuildFlags(action, "maven")

        expect(args).to.include("jib:buildTar")
      })
    })

    context("dockerBuild=true", () => {
      it("correctly sets the target for gradel", () => {
        action["_staticOutputs"].deploymentImageId = imageId
        action.getSpec().dockerBuild = true

        const { args } = getBuildFlags(action, "gradle")

        expect(args).to.include("jibDockerBuild")
      })

      it("correctly sets the target for maven", () => {
        action["_staticOutputs"].deploymentImageId = imageId
        action.getSpec().dockerBuild = true

        const { args } = getBuildFlags(action, "maven")

        expect(args).to.include("jib:dockerBuild")
      })
    })
  })
})
