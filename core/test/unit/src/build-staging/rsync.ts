/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists } from "fs-extra"
import { expect } from "chai"
import { makeTestGarden, dataDir, expectError, getDataDir, TestGarden } from "../../../helpers"
import { BuildDirRsync } from "../../../../src/build-staging/rsync"
import { commonSyncTests } from "./build-staging"

/*
  Module dependency diagram for build-dir test project

    a   b
     \ /
      d   c  e (e is a local exec module)
        \ | /
          f
 */

const projectRoot = join(dataDir, "test-projects", "build-dir")

describe("BuildDirRsync", () => {
  let garden: TestGarden

  before(async () => {
    garden = await makeTestGarden(projectRoot, { experimentalBuildSync: false })
  })

  afterEach(async () => {
    await garden.buildStaging.clear()
  })

  it("should have ensured the existence of the build dir when Garden was initialized", async () => {
    const buildDirExists = await pathExists(garden.buildStaging.buildDirPath)
    expect(buildDirExists).to.eql(true)
  })

  it("should throw if rsync is not on PATH", async () => {
    const orgPath = process.env.PATH

    try {
      process.env.PATH = ""
      await expectError(
        () => BuildDirRsync.factory(garden.projectRoot, garden.gardenDirPath),
        (err) =>
          expect(err.message).to.equal(
            "Could not find rsync binary. Please make sure rsync (version 3.1.0 or later) is installed " +
              "and on your PATH."
          )
      )
    } finally {
      process.env.PATH = orgPath
    }
  })

  it("should work with rsync v3.1.0", async () => {
    const orgPath = process.env.PATH

    try {
      process.env.PATH = getDataDir("dummy-rsync", "min-version")
      await BuildDirRsync.factory(garden.projectRoot, garden.gardenDirPath)
    } finally {
      process.env.PATH = orgPath
    }
  })

  it("should work with rsync v3.2.3", async () => {
    const orgPath = process.env.PATH

    try {
      process.env.PATH = getDataDir("dummy-rsync", "new-version")
      await BuildDirRsync.factory(garden.projectRoot, garden.gardenDirPath)
    } finally {
      process.env.PATH = orgPath
    }
  })

  it("should throw if rsync is too old", async () => {
    const orgPath = process.env.PATH

    try {
      process.env.PATH = getDataDir("dummy-rsync", "old-version")
      await expectError(
        () => BuildDirRsync.factory(garden.projectRoot, garden.gardenDirPath),
        (err) =>
          expect(err.message).to.equal(
            "Found rsync binary but the version is too old (2.1.2). Please install version 3.1.0 or later."
          )
      )
    } finally {
      process.env.PATH = orgPath
    }
  })

  it("should throw if rsync returns invalid version", async () => {
    const orgPath = process.env.PATH

    try {
      process.env.PATH = getDataDir("dummy-rsync", "invalid")
      await expectError(
        () => BuildDirRsync.factory(garden.projectRoot, garden.gardenDirPath),
        (err) =>
          expect(err.message).to.equal(
            "Could not detect rsync version. Please make sure rsync version 3.1.0 or later is installed " +
              "and on your PATH."
          )
      )
    } finally {
      process.env.PATH = orgPath
    }
  })

  describe("(common)", () => commonSyncTests(false))

  describe("sync", () => {
    it("should not sync symlinks that point outside the module root", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const module = graph.getModule("symlink-outside-module")

      await garden.buildStaging.syncFromSrc(module, garden.log)

      const buildDir = await garden.buildStaging.buildPath(module)
      expect(await pathExists(join(buildDir, "symlink.txt"))).to.be.false
    })
  })
})
