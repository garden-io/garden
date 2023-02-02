/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

context("build.ts", () => {
  describe("getContainerBuildStatus", () => {
    it("should return ready if build exists locally", async () => {
      td.replace(helpers, "hasDockerfile", () => true)

      const module = td.object(await getTestModule(baseConfig))

      td.replace(helpers, "imageExistsLocally", async () => true)

      const result = await getBuildStatus({ ctx, log, module })
      expect(result).to.eql({ ready: true })
    })

    it("should return not-ready if build does not exist locally", async () => {
      td.replace(helpers, "hasDockerfile", () => true)

      const module = td.object(await getTestModule(baseConfig))

      td.replace(helpers, "imageExistsLocally", async () => false)

      const result = await getBuildStatus({ ctx, log, module })
      expect(result).to.eql({ ready: false })
    })
  })

  describe("build", () => {
    beforeEach(() => {
      td.replace(helpers, "checkDockerServerVersion", () => null)
    })

    it("should pull image if image tag is set and the module doesn't container a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => false)
      td.replace(helpers, "pullImage", async () => null)
      td.replace(helpers, "imageExistsLocally", async () => false)

      const result = await build({ ctx, log, module })

      expect(result).to.eql({ fetched: true })
    })

    it("should build image if module contains Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => true)
      td.replace(helpers, "imageExistsLocally", async () => false)

      module.outputs["local-image-id"] = "some/image"

      const cmdArgs = [
        "build",
        "-t",
        "some/image",
        "--build-arg",
        `GARDEN_MODULE_VERSION=${module.version.versionString}`,
        module.buildPath,
      ]

      td.replace(helpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(module.buildPath)
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log" }
      })

      const result = await build({ ctx, log, module })

      expect(result).to.eql({
        buildLog: "log",
        fresh: true,
        details: { identifier: "some/image" },
      })
    })

    it("should set build target image parameter if configured", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      config.spec.build.targetImage = "foo"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => true)
      td.replace(helpers, "imageExistsLocally", async () => false)

      module.outputs["local-image-id"] = "some/image"

      const cmdArgs = [
        "build",
        "-t",
        "some/image",
        "--build-arg",
        `GARDEN_MODULE_VERSION=${module.version.versionString}`,
        "--target",
        "foo",
        module.buildPath,
      ]

      td.replace(helpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(module.buildPath)
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log" }
      })

      const result = await build({ ctx, log, module })

      expect(result).to.eql({
        buildLog: "log",
        fresh: true,
        details: { identifier: "some/image" },
      })
    })

    it("should build image using the user specified Dockerfile path", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.dockerfile = relDockerfilePath

      td.replace(helpers, "hasDockerfile", () => true)

      const module = td.object(await getTestModule(config))

      td.replace(helpers, "imageExistsLocally", async () => false)

      module.outputs["local-image-id"] = "some/image"

      const cmdArgs = [
        "build",
        "-t",
        "some/image",
        "--build-arg",
        `GARDEN_MODULE_VERSION=${module.version.versionString}`,
        "--file",
        join(module.buildPath, relDockerfilePath),
        module.buildPath,
      ]

      td.replace(helpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(module.buildPath)
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log" }
      })

      const result = await build({ ctx, log, module })

      expect(result).to.eql({
        buildLog: "log",
        fresh: true,
        details: { identifier: "some/image" },
      })
    })
  })
})
