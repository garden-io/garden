/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import type { ExtendedStats, MappedPaths, ResolveSymlinkParams } from "../../../../src/build-staging/helpers.js"
import { cloneFileAsync, FileStatsHelper, scanDirectoryForClone } from "../../../../src/build-staging/helpers.js"
import type { TempDirectory } from "../../../../src/util/fs.js"
import { makeTempDir } from "../../../../src/util/fs.js"
import fsExtra from "fs-extra"

const { realpath, symlink, writeFile, readFile, mkdir, ensureFile, ensureDir } = fsExtra
import { expect } from "chai"
import { expectError } from "../../../helpers.js"
import { sleep } from "../../../../src/util/util.js"
import { sortBy } from "lodash-es"
import { equalWithPrecision } from "../../../../src/util/testing.js"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { readlink } from "fs/promises"

describe("build staging helpers", () => {
  let statsHelper: FileStatsHelper
  let tmpDir: TempDirectory
  let tmpPath: string

  beforeEach(async () => {
    statsHelper = new FileStatsHelper()
    tmpDir = await makeTempDir()
    tmpPath = await realpath(tmpDir.path)
  })

  afterEach(async () => {
    await tmpDir?.cleanup()
  })

  async function readFileStr(path: string) {
    const buf = await readFile(path)
    return buf.toString()
  }

  describe("cloneFile", () => {
    const logger = getRootLogger()
    const log = logger.createLog()

    it("clones a file", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await writeFile(a, "foo")
      const res = await cloneFileAsync({ log, sourceRoot: a, from: a, to: b, statsHelper, allowDelete: false })
      const data = await readFileStr(b)
      expect(res.skipped).to.be.false
      expect(data).to.equal("foo")
    })

    it("removes existing directory at target if allowDelete=true", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await writeFile(a, "foo")
      await mkdir(b)
      const res = await cloneFileAsync({ log, sourceRoot: a, from: a, to: b, statsHelper, allowDelete: true })
      const data = await readFileStr(b)
      expect(res.skipped).to.be.false
      expect(data).to.equal("foo")
    })

    it("throws if a directory exists at target and allowDelete=false", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await writeFile(a, "foo")
      await mkdir(b)

      await expectError(() => cloneFileAsync({ log, sourceRoot: a, from: a, to: b, statsHelper, allowDelete: false }), {
        contains: `Build staging: Failed copying file from '${a}' to '${b}' because a directory exists at the target path`,
      })
    })

    it("preserves mtime from source at target", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await writeFile(a, "foo")
      await sleep(100)

      await cloneFileAsync({ log, sourceRoot: a, from: a, to: b, statsHelper, allowDelete: false })

      const statA = await statsHelper.extendedStat({ path: a })
      const statB = await statsHelper.extendedStat({ path: b })

      expect(equalWithPrecision(statA?.mtimeMs!, statB?.mtimeMs!, 2)).to.be.true
    })

    it("skips if file at target exists and has same mtime and size", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await writeFile(a, "foo")

      await cloneFileAsync({ log, sourceRoot: a, from: a, to: b, statsHelper, allowDelete: false })

      const res = await cloneFileAsync({ log, sourceRoot: a, from: a, to: b, statsHelper, allowDelete: false })
      expect(res.skipped).to.be.true
    })

    it("ensures the target directory for the file exists", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "subdir", "b")
      await writeFile(a, "foo")

      await cloneFileAsync({ log, sourceRoot: a, from: a, to: b, statsHelper, allowDelete: false })

      const data = await readFileStr(b)
      expect(data).to.equal("foo")
    })

    it("resolves a symlink before copying", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      const c = join(tmpPath, "c")
      await writeFile(a, "foo")
      await symlink("a", b)
      const res = await cloneFileAsync({ log, sourceRoot: b, from: b, to: c, statsHelper, allowDelete: false })
      const data = await readFileStr(c)
      expect(res.skipped).to.be.false
      expect(data).to.equal("foo")
    })

    it("throws an error if symlink is out of bounds", async () => {
      const b = join(tmpPath, "b")
      const a = join(tmpPath, "a")
      const symlPath = "symlink"
      const symlTarget = ".."
      await mkdir(a)
      await symlink(symlTarget, join(a, symlPath))
      await expectError(
        () =>
          cloneFileAsync({
            log,
            sourceRoot: a,
            from: join(a, symlPath),
            to: join(b, symlPath),
            statsHelper,
            allowDelete: false,
          }),
        {
          contains: ["Encountered a symlink", "whose target .. is out of bounds (not inside"],
        }
      )
    })

    it("reproduces the symlink if it points to a directory", async () => {
      const b = join(tmpPath, "b")
      const a = join(tmpPath, "a")
      const syml = "symlink"
      const symlBroken = "broken"
      const dir = "dir"
      const file = join(dir, "fruit")
      await mkdir(a)
      await mkdir(join(a, dir))
      await writeFile(join(a, file), "banana")
      await symlink("dir", join(a, syml))
      await symlink("target_does_not_exist", join(a, symlBroken))
      const filesToClone = [syml, symlBroken, file]
      for (const f of filesToClone) {
        const res = await cloneFileAsync({
          log,
          sourceRoot: a,
          from: join(a, f),
          to: join(b, f),
          statsHelper,
          allowDelete: false,
        })
        expect(res.skipped).to.be.false
      }
      expect(await readlink(join(b, syml))).to.equal("dir")
      expect(await readlink(join(b, symlBroken))).to.equal("target_does_not_exist")
      expect(await readFileStr(join(b, file))).to.equal("banana")
      expect(await readFileStr(join(b, syml, "fruit"))).to.equal("banana")
    })

    it("clones a file that's within a symlinked directory", async () => {
      const dirLink = join(tmpPath, "dir-link")
      const dir = join(tmpPath, "dir")
      const a = join(dirLink, "a")
      const b = join(tmpPath, "b")

      await ensureDir(dir)
      await symlink("dir", dirLink)
      await writeFile(a, "foo")

      const res = await cloneFileAsync({ log, sourceRoot: a, from: a, to: b, statsHelper, allowDelete: false })
      const data = await readFileStr(b)
      expect(res.skipped).to.be.false
      expect(data).to.equal("foo")
    })

    it("throws if attempting to clone a directory", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await ensureDir(a)

      await expectError(() => cloneFileAsync({ log, sourceRoot: a, from: a, to: b, statsHelper, allowDelete: false }), {
        contains: `Error while copying from '${a}' to '${b}': Source is neither a symbolic link, nor a file`,
      })
    })
  })

  describe("scanDirectoryForClone", () => {
    function sortFiles(paths: MappedPaths) {
      return sortBy(paths, (p) => p.join(":"))
    }

    it("returns all files in a directory when no pattern is set", async () => {
      await ensureFile(join(tmpPath, "a"))
      await ensureFile(join(tmpPath, "dir-a", "b"))
      await ensureFile(join(tmpPath, "dir-a", "c"))
      await ensureFile(join(tmpPath, "dir-b", "d"))

      const res = await scanDirectoryForClone(tmpPath)

      expect(sortFiles(res)).to.eql([
        ["a", "a"],
        ["dir-a/b", "dir-a/b"],
        ["dir-a/c", "dir-a/c"],
        ["dir-b/d", "dir-b/d"],
      ])
    })

    it("matches a single directory", async () => {
      await ensureFile(join(tmpPath, "a"))
      await ensureFile(join(tmpPath, "dir-a", "b"))
      await ensureFile(join(tmpPath, "dir-a", "c"))
      await ensureFile(join(tmpPath, "dir-b", "d"))

      const res = await scanDirectoryForClone(tmpPath, "dir-a")

      expect(sortFiles(res)).to.eql([
        ["dir-a/b", "dir-a/b"],
        ["dir-a/c", "dir-a/c"],
      ])
    })

    it("matches multiple directories", async () => {
      await ensureFile(join(tmpPath, "a"))
      await ensureFile(join(tmpPath, "dir-a", "b"))
      await ensureFile(join(tmpPath, "dir-a", "c"))
      await ensureFile(join(tmpPath, "dir-b", "d"))

      const res = await scanDirectoryForClone(tmpPath, "dir-*")

      expect(sortFiles(res)).to.eql([
        ["dir-a/b", "dir-a/b"],
        ["dir-a/c", "dir-a/c"],
        ["dir-b/d", "dir-b/d"],
      ])
    })

    it("matches a set of files in root", async () => {
      await ensureFile(join(tmpPath, "file-a"))
      await ensureFile(join(tmpPath, "file-b"))
      await ensureFile(join(tmpPath, "file-c"))
      await ensureFile(join(tmpPath, "dir-a", "file-d"))
      await ensureFile(join(tmpPath, "dir-b", "file-e"))

      const res = await scanDirectoryForClone(tmpPath, "file-*")

      expect(sortFiles(res)).to.eql([
        ["file-a", "file-a"],
        ["file-b", "file-b"],
        ["file-c", "file-c"],
      ])
    })

    it("matches files across all directories and maps to root", async () => {
      await ensureFile(join(tmpPath, "file-a"))
      await ensureFile(join(tmpPath, "file-b"))
      await ensureFile(join(tmpPath, "nope"))
      await ensureFile(join(tmpPath, "dir-a", "file-d"))
      await ensureFile(join(tmpPath, "dir-b", "file-e"))

      const res = await scanDirectoryForClone(tmpPath, "**/file-*")

      expect(sortFiles(res)).to.eql([
        ["dir-a/file-d", "file-d"],
        ["dir-b/file-e", "file-e"],
        ["file-a", "file-a"],
        ["file-b", "file-b"],
      ])
    })

    it("matches files in multiple directories and maps to root", async () => {
      await ensureFile(join(tmpPath, "file-a"))
      await ensureFile(join(tmpPath, "file-b"))
      await ensureFile(join(tmpPath, "file-c"))
      await ensureFile(join(tmpPath, "dir-a", "file-d"))
      await ensureFile(join(tmpPath, "dir-a", "nope"))
      await ensureFile(join(tmpPath, "dir-b", "file-e"))

      const res = await scanDirectoryForClone(tmpPath, "dir-*/file-*")

      expect(sortFiles(res)).to.eql([
        ["dir-a/file-d", "file-d"],
        ["dir-b/file-e", "file-e"],
      ])
    })

    it("matches everything with a wildcard", async () => {
      await ensureFile(join(tmpPath, "file-a"))
      await ensureFile(join(tmpPath, "file-b"))
      await ensureFile(join(tmpPath, "file-c"))
      await ensureFile(join(tmpPath, "dir-a", "file-d"))
      await ensureFile(join(tmpPath, "dir-b", "file-e"))

      const res = await scanDirectoryForClone(tmpPath, "*")

      expect(sortFiles(res)).to.eql([
        ["dir-a/file-d", "dir-a/file-d"],
        ["dir-b/file-e", "dir-b/file-e"],
        ["file-a", "file-a"],
        ["file-b", "file-b"],
        ["file-c", "file-c"],
      ])
    })

    it("matches and maps some subdirectories", async () => {
      await ensureFile(join(tmpPath, "file-a"))
      await ensureFile(join(tmpPath, "dir-a", "subdir", "file-d"))
      await ensureFile(join(tmpPath, "dir-b", "subdir", "file-e"))

      const res = await scanDirectoryForClone(tmpPath, "*/subdir")

      expect(sortFiles(res)).to.eql([
        ["dir-a/subdir/file-d", "subdir/file-d"],
        ["dir-b/subdir/file-e", "subdir/file-e"],
      ])
    })

    it("matches files within symlinked directories, mapping source path to link source", async () => {
      await ensureFile(join(tmpPath, "file-a"))
      await ensureFile(join(tmpPath, "dir-a", "file-b"))
      await ensureFile(join(tmpPath, "dir-a", "file-c"))
      await symlink("dir-a", join(tmpPath, "link-a"))

      const res = await scanDirectoryForClone(tmpPath, "link-a/*")

      expect(sortFiles(res)).to.eql([
        ["link-a/file-b", "file-b"],
        ["link-a/file-c", "file-c"],
      ])
    })

    // TODO
    it.skip("ignores symlinks that point outside the root", async () => {
      const rootPath = join(tmpPath, "root")
      const outside = join(tmpPath, "outside")
      await ensureDir(rootPath)
      await ensureDir(outside)
      await ensureFile(join(tmpPath, "linked-a"))
      await ensureFile(join(rootPath, "file-a"))
      await ensureFile(join(rootPath, "file-b"))
      await ensureFile(join(outside, "file-c"))
      await symlink("../linked-a", join(rootPath, "link-a"))
      await symlink("../outside", join(rootPath, "link-b"))

      const res = await scanDirectoryForClone(rootPath, "*")

      expect(sortFiles(res)).to.eql([
        ["file-a", "file-a"],
        ["file-b", "file-b"],
      ])
    })
  })

  describe("FileStatsHelper", () => {
    describe("lstat", () => {
      it("stats a path", (done) => {
        statsHelper.lstat(tmpPath, (err, stats) => {
          expect(stats?.isDirectory()).to.be.true
          done(err)
        })
      })

      it("caches the stats for a path", (done) => {
        statsHelper.lstat(tmpPath, (err, stats) => {
          expect(statsHelper["lstatCache"][tmpPath]).to.equal(stats)
          done(err)
        })
      })
    })

    describe("extendedStat", () => {
      it("resolves a simple file path", async () => {
        const a = join(tmpPath, "a")
        await writeFile(a, "foo")
        const stat = await statsHelper.extendedStat({ path: a })
        expect(stat?.path).to.equal(a)
        expect(stat?.isFile()).to.be.true
      })

      it("resolves a symlink", async () => {
        const a = join(tmpPath, "a")
        const b = join(tmpPath, "b")
        await writeFile(a, "foo")
        await symlink("a", b)
        const stat = await statsHelper.extendedStat({ path: b })
        expect(stat?.path).to.equal(b)
        expect(stat?.isSymbolicLink()).to.be.true
        expect(stat?.target?.path).to.equal(a)
        expect(stat?.target?.isFile()).to.be.true
      })

      it("resolves a simple directory path", async () => {
        const stat = await statsHelper.extendedStat({ path: tmpPath })
        expect(stat?.path).to.equal(tmpPath)
        expect(stat?.isDirectory()).to.be.true
      })

      it("caches the resolved path", async () => {
        const stats = await statsHelper.extendedStat({ path: tmpPath })
        expect(statsHelper["extendedStatCache"][tmpPath]).to.equal(stats)
      })

      it("returns null if path cannot be found", async () => {
        const a = join(tmpPath, "foo")
        const stat = await statsHelper.extendedStat({ path: a })
        expect(stat).to.equal(null)
      })

      it("throws if given a relative path", async () => {
        return expectError(() => statsHelper.extendedStat({ path: "foo" }), {
          contains: "Must specify absolute path (got foo)",
        })
      })

      context("with callback", () => {
        it("resolves a simple directory path", (done) => {
          statsHelper.extendedStat({ path: tmpPath }, (err, stat) => {
            expect(stat?.path).to.equal(tmpPath)
            expect(stat?.isDirectory()).to.be.true
            done(err)
          })
        })

        it("caches the resolved path", (done) => {
          statsHelper.extendedStat({ path: tmpPath }, (err, stats) => {
            expect(statsHelper["extendedStatCache"][tmpPath]).to.equal(stats)
            done(err)
          })
        })

        it("returns null if path cannot be found", (done) => {
          const a = join(tmpPath, "foo")
          statsHelper.extendedStat({ path: a }, (err, stat) => {
            expect(stat).to.equal(null)
            done(err)
          })
        })
      })
    })

    describe("resolveSymlink", () => {
      // A promisified version to simplify tests
      async function resolveSymlink(params: ResolveSymlinkParams) {
        return new Promise<{
          target: ExtendedStats | null
          targetPath: string | null
        }>((resolve, reject) => {
          statsHelper.resolveSymlink(params, ({ err, target, targetPath }) => {
            if (err) {
              reject(err)
            } else {
              resolve({
                target,
                targetPath,
              })
            }
          })
        })
      }

      it("resolves a simple symlink", async () => {
        const a = join(tmpPath, "a")
        const b = join(tmpPath, "b")
        await writeFile(a, "foo")
        await symlink("a", b)
        const res = await resolveSymlink({ path: b })
        expect(res?.target?.path).to.equal(a)
        expect(res?.targetPath).to.equal("a")
      })

      it("resolves a symlink recursively", async () => {
        const a = join(tmpPath, "a")
        const b = join(tmpPath, "b")
        const c = join(tmpPath, "c")
        await writeFile(a, "foo")
        await symlink("a", b)
        await symlink("b", c)
        const res = await resolveSymlink({ path: c })
        expect(res?.target?.path).to.equal(a)
        expect(res?.targetPath).to.equal("b")
      })

      it("returns null for an absolute symlink", async () => {
        const a = join(tmpPath, "a")
        const b = join(tmpPath, "b")
        await writeFile(a, "foo")
        await symlink(a, b) // <- absolute link
        const res = await resolveSymlink({ path: b })
        expect(res.target).to.equal(null)
        expect(res.targetPath).to.equal(null)
      })

      it("returns null for a recursive absolute symlink", async () => {
        const a = join(tmpPath, "a")
        const b = join(tmpPath, "b")
        const c = join(tmpPath, "c")
        await writeFile(a, "foo")
        await symlink(a, b) // <- absolute link
        await symlink("b", c)
        const res = await resolveSymlink({ path: c })
        expect(res.target).to.equal(null)
        // target path can be resolved; If the build staging logic were only to reproduce relative symlinks, broken or not, it would all be much easier to understand.
        expect(res.targetPath).to.equal("b")
      })

      it("resolves an absolute symlink if allowAbsolute=true", async () => {
        const a = join(tmpPath, "a")
        const b = join(tmpPath, "b")
        await writeFile(a, "foo")
        await symlink(a, b) // <- absolute link
        const res = await resolveSymlink({ path: b, allowAbsolute: true })
        expect(res?.target?.path).to.equal(a)
        expect(res?.targetPath).to.equal(a)
      })

      it("throws if a relative path is given", async () => {
        return expectError(() => resolveSymlink({ path: "foo" }), { contains: "Must specify absolute path (got foo)" })
      })

      it("throws if a path to a non-symlink (e.g. directory) is given", async () => {
        return expectError(() => resolveSymlink({ path: tmpPath }), {
          contains: ["Error reading symlink", `EINVAL: invalid argument, readlink '${tmpPath}'`],
        })
      })

      it("returns null if resolving a circular symlink", async () => {
        const a = join(tmpPath, "a")
        const b = join(tmpPath, "b")
        await symlink("a", b)
        await symlink("b", a)
        const res = await resolveSymlink({ path: b })
        expect(res.target).to.equal(null)
        expect(res.targetPath).to.equal("a")
      })

      it("returns null if resolving a two-step circular symlink", async () => {
        const a = join(tmpPath, "a")
        const b = join(tmpPath, "b")
        const c = join(tmpPath, "c")
        await symlink("c", a)
        await symlink("a", b)
        await symlink("b", c)
        const res = await resolveSymlink({ path: c })
        expect(res.target).to.equal(null)
        expect(res.targetPath).to.equal("b")
      })
    })
  })
})
