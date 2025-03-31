/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import { getDataDir, makeTestGardenA, makeTestGarden } from "../../../helpers.js"
import {
  scanDirectory,
  toCygwinPath,
  getChildDirNames,
  isConfigFilename,
  getWorkingCopyId,
  findConfigPathsInPath,
  joinWithPosix,
} from "../../../../src/util/fs.js"
import { withDir } from "tmp-promise"
import fsExtra from "fs-extra"
const { mkdirp, writeFile } = fsExtra

describe("scanDirectory", () => {
  it("should iterate through all files in a directory", async () => {
    const testPath = getDataDir("scanDirectory")
    let count = 0

    const expectedPaths = ["1", "2", "3", "subdir", "subdir/4"].map((f) => join(testPath, f))

    for await (const item of scanDirectory(testPath)) {
      expect(expectedPaths).to.include(item.path)
      count++
    }

    expect(count).to.eq(5)
  })

  it("should filter files based on filter function", async () => {
    const testPath = getDataDir("scanDirectory")
    const filterFunc = (item) => !item.includes("scanDirectory/subdir")
    const expectedPaths = ["1", "2", "3"].map((f) => join(testPath, f))

    let count = 0

    for await (const item of scanDirectory(testPath, {
      filter: filterFunc,
    })) {
      expect(expectedPaths).to.include(item.path)
      count++
    }

    expect(count).to.eq(3)
  })
})

describe("getChildDirNames", () => {
  it("should return the names of all none hidden directories in the parent directory", async () => {
    const testPath = getDataDir("get-child-dir-names")
    expect(await getChildDirNames(testPath)).to.eql(["a", "b"])
  })
})

describe("toCygwinPath", () => {
  it("should convert a win32 path to a cygwin path", () => {
    const path = "C:\\some\\path"
    expect(toCygwinPath(path)).to.equal("/cygdrive/c/some/path")
  })

  it("should retain a trailing slash", () => {
    const path = "C:\\some\\path\\"
    expect(toCygwinPath(path)).to.equal("/cygdrive/c/some/path/")
  })
})

describe("isConfigFilename", () => {
  it("should return true if the name of the file is garden.yaml", async () => {
    expect(isConfigFilename("garden.yaml")).to.be.true
  })
  it("should return true if the name of the file is garden.yml", async () => {
    expect(isConfigFilename("garden.yml")).to.be.true
  })
  it("should return false otherwise", async () => {
    const badNames = ["agarden.yml", "garden.ymla", "garden.yaaml", "garden.ml"]
    for (const name of badNames) {
      expect(isConfigFilename(name)).to.be.false
    }
  })
})

describe("getWorkingCopyId", () => {
  it("should generate and return a new ID for an empty directory", async () => {
    return withDir(
      async (dir) => {
        const id = await getWorkingCopyId(dir.path)
        expect(id).to.be.a("string")
      },
      { unsafeCleanup: true }
    )
  })

  it("should return the same ID after generating for the first time", async () => {
    return withDir(
      async (dir) => {
        const idA = await getWorkingCopyId(dir.path)
        const idB = await getWorkingCopyId(dir.path)

        expect(idA).to.equal(idB)
      },
      { unsafeCleanup: true }
    )
  })
})

describe("findConfigPathsInPath", () => {
  it("should recursively find all garden configs in a directory", async () => {
    const garden = await makeTestGardenA()
    const files = await findConfigPathsInPath({
      vcs: garden.vcs,
      dir: garden.projectRoot,
      log: garden.log,
    })
    expect(files).to.eql([
      join(garden.projectRoot, "commands.garden.yml"),
      join(garden.projectRoot, "garden.yml"),
      join(garden.projectRoot, "module-a", "garden.yml"),
      join(garden.projectRoot, "module-b", "garden.yml"),
      join(garden.projectRoot, "module-c", "garden.yml"),
    ])
  })

  it("should ignore .garden directory", async () => {
    const garden = await makeTestGardenA()
    await mkdirp(join(garden.projectRoot, ".garden"))
    await writeFile(join(garden.projectRoot, ".garden", "foo.garden.yml"), "---")
    const files = await findConfigPathsInPath({
      vcs: garden.vcs,
      dir: garden.projectRoot,
      log: garden.log,
    })
    expect(files).to.eql([
      join(garden.projectRoot, "commands.garden.yml"),
      join(garden.projectRoot, "garden.yml"),
      join(garden.projectRoot, "module-a", "garden.yml"),
      join(garden.projectRoot, "module-b", "garden.yml"),
      join(garden.projectRoot, "module-c", "garden.yml"),
    ])
  })

  it("should find custom-named garden configs", async () => {
    const garden = await makeTestGarden(getDataDir("test-projects", "custom-config-names"))
    const files = await findConfigPathsInPath({
      vcs: garden.vcs,
      dir: garden.projectRoot,
      log: garden.log,
    })
    expect(files).to.eql([
      join(garden.projectRoot, "module-a", "garden.yml"),
      join(garden.projectRoot, "module-b", "module-b.garden.yaml"),
      join(garden.projectRoot, "project.garden.yml"),
      join(garden.projectRoot, "workflows.garden.yml"),
    ])
  })

  it("should respect the include option, if specified", async () => {
    const garden = await makeTestGardenA()
    const include = ["module-a/**/*"]
    const files = await findConfigPathsInPath({
      vcs: garden.vcs,
      dir: garden.projectRoot,
      log: garden.log,
      include,
    })
    expect(files).to.eql([join(garden.projectRoot, "module-a", "garden.yml")])
  })

  it("should respect the exclude option, if specified", async () => {
    const garden = await makeTestGardenA()
    const exclude = ["module-a/**/*"]
    const files = await findConfigPathsInPath({
      vcs: garden.vcs,
      dir: garden.projectRoot,
      log: garden.log,
      exclude,
    })
    expect(files).to.eql([
      join(garden.projectRoot, "commands.garden.yml"),
      join(garden.projectRoot, "garden.yml"),
      join(garden.projectRoot, "module-b", "garden.yml"),
      join(garden.projectRoot, "module-c", "garden.yml"),
    ])
  })

  it("should respect the include and exclude options, if both are specified", async () => {
    const garden = await makeTestGardenA()
    const include = ["module*/**/*"]
    const exclude = ["module-a/**/*"]
    const files = await findConfigPathsInPath({
      vcs: garden.vcs,
      dir: garden.projectRoot,
      log: garden.log,
      include,
      exclude,
    })
    expect(files).to.eql([
      join(garden.projectRoot, "module-b", "garden.yml"),
      join(garden.projectRoot, "module-c", "garden.yml"),
    ])
  })

  it("should find directly referenced files in modules.include", async () => {
    const garden = await makeTestGardenA()
    const include = ["module-b/garden.yml"]
    const exclude = []
    const files = await findConfigPathsInPath({
      vcs: garden.vcs,
      dir: garden.projectRoot,
      log: garden.log,
      include,
      exclude,
    })
    expect(files).to.eql([join(garden.projectRoot, "module-b", "garden.yml")])
  })

  it("should find configs with .yaml extension", async () => {
    const garden = await makeTestGarden(getDataDir("test-project-yaml-file-extensions"))
    const files = await findConfigPathsInPath({
      vcs: garden.vcs,
      dir: garden.projectRoot,
      log: garden.log,
    })
    expect(files).to.eql([
      join(garden.projectRoot, "garden.yaml"),
      join(garden.projectRoot, "module-yaml", "garden.yaml"),
      join(garden.projectRoot, "module-yml", "garden.yml"),
    ])
  })
})

describe("joinWithPosix", () => {
  it("should join a POSIX path to another path", () => {
    expect(joinWithPosix("/tmp", "a/b")).to.equal("/tmp/a/b")
  })
})
