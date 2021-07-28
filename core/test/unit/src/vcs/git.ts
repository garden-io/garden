/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa = require("execa")
import { expect } from "chai"
import tmp from "tmp-promise"
import { createFile, writeFile, realpath, mkdir, remove, symlink, ensureSymlink, lstat } from "fs-extra"
import { join, resolve, basename, relative } from "path"

import { expectError, makeTestGardenA, TestGarden } from "../../../helpers"
import { getCommitIdFromRefList, parseGitUrl, GitHandler } from "../../../../src/vcs/git"
import { LogEntry } from "../../../../src/logger/log-entry"
import { hashRepoUrl } from "../../../../src/util/ext-source-util"
import { deline } from "../../../../src/util/string"
import { uuidv4 } from "../../../../src/util/util"

// Overriding this to make sure any ignorefile name is respected
const defaultIgnoreFilename = ".testignore"

async function getCommitMsg(repoPath: string) {
  const res = (await execa("git", ["log", "-1", "--pretty=%B"], { cwd: repoPath })).stdout
  return res.replace("\n", "")
}

async function commit(msg: string, repoPath: string) {
  // Ensure master contains changes when commiting
  const uniqueFilename = `${uuidv4()}.txt`
  const filePath = join(repoPath, uniqueFilename)
  await createFile(filePath)
  await execa("git", ["add", filePath], { cwd: repoPath })
  await execa("git", ["commit", "-m", msg], { cwd: repoPath })
  return uniqueFilename
}

async function makeTempGitRepo() {
  const tmpDir = await tmp.dir({ unsafeCleanup: true })
  const tmpPath = await realpath(tmpDir.path)
  await execa("git", ["init"], { cwd: tmpPath })

  return tmpDir
}

async function addToIgnore(tmpPath: string, pathToExclude: string, ignoreFilename = defaultIgnoreFilename) {
  const gardenignorePath = resolve(tmpPath, ignoreFilename)

  await createFile(gardenignorePath)
  await writeFile(gardenignorePath, pathToExclude)
}

describe("GitHandler", () => {
  let garden: TestGarden
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string
  let git: any
  let handler: GitHandler
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    tmpDir = await makeTempGitRepo()
    tmpPath = await realpath(tmpDir.path)
    handler = new GitHandler(tmpPath, join(tmpPath, ".garden"), [defaultIgnoreFilename], garden.cache)
    git = (<any>handler).gitCli(log, tmpPath)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  describe("getRepoRoot", () => {
    it("should return the repo root if it is the same as the given path", async () => {
      const path = tmpPath
      expect(await handler.getRepoRoot(log, path)).to.equal(tmpPath)
    })

    it("should return the nearest repo root, given a subpath of that repo", async () => {
      const dirPath = join(tmpPath, "dir")
      await mkdir(dirPath)
      expect(await handler.getRepoRoot(log, dirPath)).to.equal(tmpPath)
    })

    it("should throw a nice error when given a path outside of a repo", async () => {
      await expectError(
        () => handler.getRepoRoot(log, "/tmp"),
        (err) =>
          expect(err.message).to.equal(deline`
          Path /tmp is not in a git repository root. Garden must be run from within a git repo.
          Please run \`git init\` if you're starting a new project and repository, or move the project to
          an existing repository, and try again.
        `)
      )
    })
  })

  describe("getBranchName", () => {
    it("should return undefined with no commits in repo", async () => {
      const path = tmpPath
      expect(await handler.getBranchName(log, path)).to.equal(undefined)
    })

    it("should return the current branch name when there are commits in the repo", async () => {
      const path = tmpPath
      await commit("init", tmpPath)
      expect(await handler.getBranchName(log, path)).to.equal("master")
    })

    it("should return undefined when given a path outside of a repo", async () => {
      expect(await handler.getBranchName(log, "/tmp")).to.equal(undefined)
    })
  })

  describe("getFiles", () => {
    it("should work with no commits in repo", async () => {
      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([])
    })

    it("should return tracked files as absolute paths with hash", async () => {
      const path = resolve(tmpPath, "foo.txt")

      await createFile(path)
      await writeFile(path, "my change")
      await git("add", ".")
      await git("commit", "-m", "foo")

      const hash = "6e1ab2d7d26c1c66f27fea8c136e13c914e3f137"

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([{ path, hash }])
    })

    it("should return the correct hash on a modified file", async () => {
      const path = resolve(tmpPath, "foo.txt")

      await createFile(path)
      await git("add", ".")
      await git("commit", "-m", "foo")

      await writeFile(path, "my change")
      const hash = "6e1ab2d7d26c1c66f27fea8c136e13c914e3f137"

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([{ path, hash }])
    })

    const dirContexts = [
      { ctx: "when called from repo root", pathFn: (tp) => tp },
      { ctx: "when called from project root", pathFn: (tp) => resolve(tp, "somedir") },
    ]

    for (const { ctx, pathFn } of dirContexts) {
      context(ctx, () => {
        it("should return different hashes before and after a file is modified", async () => {
          const dirPath = pathFn(tmpPath)
          const filePath = resolve(tmpPath, "somedir", "foo.txt")

          await createFile(filePath)
          await writeFile(filePath, "original content")
          await git("add", ".")
          await git("commit", "-m", "foo")

          await writeFile(filePath, "my change")
          const beforeHash = (await handler.getFiles({ path: dirPath, log }))[0].hash

          await writeFile(filePath, "ch-ch-ch-ch-changes")
          const afterHash = (await handler.getFiles({ path: dirPath, log }))[0].hash

          expect(beforeHash).to.not.eql(afterHash)
        })

        it("should return untracked files as absolute paths with hash", async () => {
          const dirPath = pathFn(tmpPath)
          await createFile(join(dirPath, "foo.txt"))
          const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"

          expect(await handler.getFiles({ path: dirPath, log })).to.eql([{ path: resolve(dirPath, "foo.txt"), hash }])
        })
      })
    }

    it("should return untracked files in untracked directory", async () => {
      const dirPath = join(tmpPath, "dir")
      await mkdir(dirPath)
      await createFile(join(dirPath, "file.txt"))
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"

      expect(await handler.getFiles({ path: dirPath, log })).to.eql([{ path: resolve(dirPath, "file.txt"), hash }])
    })

    it("should work with tracked files with spaces in the name", async () => {
      const filePath = join(tmpPath, "my file.txt")
      await createFile(filePath)
      await git("add", filePath)
      await git("commit", "-m", "foo")
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([{ path: resolve(tmpPath, "my file.txt"), hash }])
    })

    it("should work with tracked+modified files with spaces in the name", async () => {
      const filePath = join(tmpPath, "my file.txt")
      await createFile(filePath)
      await git("add", filePath)
      await git("commit", "-m", "foo")

      await writeFile(filePath, "fooooo")

      const hash = "099673697c6cbf5c1a96c445ef3eab123740c778"

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([{ path: resolve(tmpPath, "my file.txt"), hash }])
    })

    it("should gracefully skip files that are deleted after having been committed", async () => {
      const filePath = join(tmpPath, "my file.txt")
      await createFile(filePath)
      await git("add", filePath)
      await git("commit", "-m", "foo")

      await remove(filePath)

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([])
    })

    it("should work with untracked files with spaces in the name", async () => {
      const filePath = join(tmpPath, "my file.txt")
      await createFile(filePath)
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([{ path: resolve(tmpPath, "my file.txt"), hash }])
    })

    it("should return nothing if include: []", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)

      expect(await handler.getFiles({ path: tmpPath, include: [], log })).to.eql([])
    })

    it("should filter out files that don't match the include filter, if specified", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)

      expect(await handler.getFiles({ path: tmpPath, include: ["bar.*"], log })).to.eql([])
    })

    it("should include files that match the include filter, if specified", async () => {
      const path = resolve(tmpPath, "foo.txt")
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
      await createFile(path)

      expect(await handler.getFiles({ path: tmpPath, include: ["foo.*"], exclude: [], log })).to.eql([{ path, hash }])
    })

    it("should include a directory that's explicitly included by exact name", async () => {
      const subdirName = "subdir"
      const subdir = resolve(tmpPath, subdirName)
      await mkdir(subdir)
      const path = resolve(tmpPath, subdirName, "foo.txt")
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
      await createFile(path)

      expect(await handler.getFiles({ path: tmpPath, include: [subdirName], exclude: [], log })).to.eql([
        { path, hash },
      ])
    })

    it("should include hidden files that match the include filter, if specified", async () => {
      const path = resolve(tmpPath, ".foo")
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
      await createFile(path)

      expect(await handler.getFiles({ path: tmpPath, include: ["*"], exclude: [], log })).to.eql([{ path, hash }])
    })

    it("should filter out files that match the exclude filter, if specified", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)

      expect(await handler.getFiles({ path: tmpPath, include: [], exclude: ["foo.*"], log })).to.eql([])
    })

    it("should respect include and exclude patterns, if both are specified", async () => {
      const moduleDir = resolve(tmpPath, "module-a")
      const pathA = resolve(moduleDir, "yes.txt")
      const pathB = resolve(tmpPath, "no.txt")
      const pathC = resolve(moduleDir, "yes.pass")
      await mkdir(moduleDir)
      await createFile(pathA)
      await createFile(pathB)
      await createFile(pathC)

      const files = (
        await handler.getFiles({
          path: tmpPath,
          include: ["module-a/**/*"],
          exclude: ["**/*.txt"],
          log,
        })
      ).map((f) => f.path)

      expect(files).to.eql([pathC])
    })

    it("should exclude untracked files that are listed in ignore file", async () => {
      const name = "foo.txt"
      const path = resolve(tmpPath, name)
      await createFile(path)
      await addToIgnore(tmpPath, name)

      const files = (await handler.getFiles({ path: tmpPath, exclude: [], log })).filter(
        (f) => !f.path.includes(defaultIgnoreFilename)
      )

      expect(files).to.eql([])
    })

    it("should exclude tracked files that are listed in ignore file", async () => {
      const name = "foo.txt"
      const path = resolve(tmpPath, name)
      await createFile(path)
      await addToIgnore(tmpPath, name)

      await git("add", path)
      await git("commit", "-m", "foo")

      const files = (await handler.getFiles({ path: tmpPath, exclude: [], log })).filter(
        (f) => !f.path.includes(defaultIgnoreFilename)
      )

      expect(files).to.eql([])
    })

    it("should work without ignore files", async () => {
      const path = resolve(tmpPath, "foo.txt")

      await createFile(path)
      await writeFile(path, "my change")
      await git("add", ".")
      await git("commit", "-m", "foo")

      const hash = "6e1ab2d7d26c1c66f27fea8c136e13c914e3f137"

      const _handler = new GitHandler(tmpPath, join(tmpPath, ".garden"), [], garden.cache)

      expect(await _handler.getFiles({ path: tmpPath, log })).to.eql([{ path, hash }])
    })

    it("should correctly handle multiple ignore files", async () => {
      const nameA = "excluded-a.txt"
      const nameB = "excluded-b.txt"
      const nameC = "excluded-c.txt"
      const nameD = "committed.txt"
      const nameE = "untracked.txt"
      const pathA = resolve(tmpPath, nameA)
      const pathB = resolve(tmpPath, nameB)
      const pathC = resolve(tmpPath, nameC)
      const pathD = resolve(tmpPath, nameD)
      const pathE = resolve(tmpPath, nameE)
      await createFile(pathA)
      await createFile(pathB)
      await createFile(pathC)
      await createFile(pathD)
      await createFile(pathE)

      await addToIgnore(tmpPath, nameA)
      await addToIgnore(tmpPath, nameB, ".testignore2")
      await addToIgnore(tmpPath, nameC, ".testignore3")

      // We skip paths A and E, to make sure untracked files work as expected
      await git("add", pathB)
      await git("add", pathC)
      await git("add", pathD)
      await git("commit", "-m", "foo")

      const _handler = new GitHandler(
        tmpPath,
        join(tmpPath, ".garden"),
        [defaultIgnoreFilename, ".testignore2", ".testignore3"],
        garden.cache
      )

      const files = (await _handler.getFiles({ path: tmpPath, exclude: [], log })).filter(
        (f) => !f.path.includes(defaultIgnoreFilename)
      )

      expect(files.map((f) => f.path)).to.eql([pathE, pathD])
    })

    it("should include a relative symlink within the path", async () => {
      const fileName = "foo"
      const filePath = resolve(tmpPath, fileName)
      const symlinkPath = resolve(tmpPath, "symlink")

      await createFile(filePath)
      await symlink(fileName, symlinkPath)

      const files = (await handler.getFiles({ path: tmpPath, exclude: [], log })).map((f) => f.path)
      expect(files).to.eql([filePath, symlinkPath])
    })

    it("should exclude a relative symlink that points outside the path", async () => {
      const subPath = resolve(tmpPath, "subdir")

      const fileName = "foo"
      const filePath = resolve(tmpPath, fileName)
      const symlinkPath = resolve(subPath, "symlink")

      await createFile(filePath)
      await ensureSymlink(join("..", fileName), symlinkPath)

      const files = (await handler.getFiles({ path: subPath, exclude: [], log })).map((f) => f.path)
      expect(files).to.eql([])
    })

    it("should exclude an absolute symlink that points inside the path", async () => {
      const fileName = "foo"
      const filePath = resolve(tmpPath, fileName)
      const symlinkPath = resolve(tmpPath, "symlink")

      await createFile(filePath)
      await symlink(filePath, symlinkPath)

      const files = (await handler.getFiles({ path: tmpPath, exclude: [], log })).map((f) => f.path)
      expect(files).to.eql([filePath])
    })

    it("gracefully aborts if given path doesn't exist", async () => {
      const path = resolve(tmpPath, "foo")

      const files = (await handler.getFiles({ path, exclude: [], log })).map((f) => f.path)
      expect(files).to.eql([])
    })

    it("gracefully aborts if given path is not a directory", async () => {
      const path = resolve(tmpPath, "foo")
      await createFile(path)

      const files = (await handler.getFiles({ path, exclude: [], log })).map((f) => f.path)
      expect(files).to.eql([])
    })

    context("path contains a submodule", () => {
      let submodule: tmp.DirectoryResult
      let submodulePath: string
      let initFile: string

      beforeEach(async () => {
        submodule = await makeTempGitRepo()
        submodulePath = await realpath(submodule.path)
        initFile = await commit("init", submodulePath)

        await execa("git", ["submodule", "add", submodulePath, "sub", "--force"], { cwd: tmpPath })
        await execa("git", ["commit", "-m", "add submodule"], { cwd: tmpPath })
      })

      afterEach(async () => {
        await submodule.cleanup()
      })

      it("should include tracked files in submodules", async () => {
        const files = await handler.getFiles({ path: tmpPath, log })
        const paths = files.map((f) => relative(tmpPath, f.path))

        expect(paths).to.eql([".gitmodules", join("sub", initFile)])
      })

      it("should include tracked files in submodules when multiple dotignore files are set", async () => {
        const _handler = new GitHandler(
          tmpPath,
          join(tmpPath, ".garden"),
          [defaultIgnoreFilename, ".gardenignore"],
          garden.cache
        )

        const files = await _handler.getFiles({ path: tmpPath, log })
        const paths = files.map((f) => relative(tmpPath, f.path))

        expect(paths).to.eql([".gitmodules", join("sub", initFile)])
      })

      it("should include untracked files in submodules", async () => {
        const path = join(tmpPath, "sub", "x.txt")
        await createFile(path)

        const files = await handler.getFiles({ path: tmpPath, log })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.eql([".gitmodules", join("sub", initFile), join("sub", "x.txt")])
      })

      it("should respect include filter when scanning a submodule", async () => {
        const path = join(tmpPath, "sub", "x.foo")
        await createFile(path)

        const files = await handler.getFiles({ path: tmpPath, log, include: ["**/*.txt"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.not.include(join("sub", path))
        expect(paths).to.include(join("sub", initFile))
      })

      it("should respect exclude filter when scanning a submodule", async () => {
        const path = join(tmpPath, "sub", "x.foo")
        await createFile(path)

        const files = await handler.getFiles({ path: tmpPath, log, exclude: ["sub/*.txt"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.eql([".gitmodules", join("sub", "x.foo")])
      })

      it("should respect include filter with ./ prefix when scanning a submodule", async () => {
        const path = join(tmpPath, "sub", "x.foo")
        await createFile(path)

        const files = await handler.getFiles({ path: tmpPath, log, include: ["./sub/*.txt"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.not.include(join("sub", path))
        expect(paths).to.include(join("sub", initFile))
      })

      it("should include the whole submodule contents when an include directly specifies its path", async () => {
        const files = await handler.getFiles({ path: tmpPath, log, include: ["sub"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.include(join("sub", initFile))
      })

      it("should include a whole directory within a submodule when an include specifies its path", async () => {
        const subdirName = "subdir"
        const subdir = resolve(submodulePath, subdirName)
        await mkdir(subdir)
        const relPath = join("sub", subdirName, "foo.txt")
        const path = resolve(tmpPath, relPath)
        await createFile(path)
        await commit(relPath, submodulePath)

        const files = await handler.getFiles({ path: tmpPath, log, include: ["sub/subdir"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.eql([relPath])
      })

      it("should include the whole submodule when a surrounding include matches it", async () => {
        const files = await handler.getFiles({ path: tmpPath, log, include: ["**/*"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.include(join("sub", initFile))
      })

      it("gracefully skips submodule if its path doesn't exist", async () => {
        const subPath = join(tmpPath, "sub")
        await remove(subPath)

        const files = await handler.getFiles({ path: tmpPath, log })
        const paths = files.map((f) => relative(tmpPath, f.path))

        expect(paths).to.eql([".gitmodules"])
      })

      it("gracefully skips submodule if its path doesn't point to a directory", async () => {
        const subPath = join(tmpPath, "sub")
        await remove(subPath)
        await createFile(subPath)

        const files = await handler.getFiles({ path: tmpPath, log })
        const paths = files.map((f) => relative(tmpPath, f.path))

        expect(paths).to.eql([".gitmodules"])
      })

      context("submodule contains another submodule", () => {
        let submoduleB: tmp.DirectoryResult
        let submodulePathB: string
        let initFileB: string

        beforeEach(async () => {
          submoduleB = await makeTempGitRepo()
          submodulePathB = await realpath(submoduleB.path)
          initFileB = await commit("init", submodulePathB)

          await execa("git", ["submodule", "add", submodulePathB, "sub-b"], { cwd: join(tmpPath, "sub") })
          await execa("git", ["commit", "-m", "add submodule"], { cwd: join(tmpPath, "sub") })
        })

        afterEach(async () => {
          await submoduleB.cleanup()
        })

        it("should include tracked files in nested submodules", async () => {
          const files = await handler.getFiles({ path: tmpPath, log })
          const paths = files.map((f) => relative(tmpPath, f.path)).sort()

          expect(paths).to.eql([
            ".gitmodules",
            join("sub", ".gitmodules"),
            join("sub", initFile),
            join("sub", "sub-b", initFileB),
          ])
        })

        it("should include untracked files in nested submodules", async () => {
          const dir = join(tmpPath, "sub", "sub-b")
          const path = join(dir, "x.txt")
          await createFile(path)

          const files = await handler.getFiles({ path: tmpPath, log })
          const paths = files.map((f) => relative(tmpPath, f.path)).sort()

          expect(paths).to.eql([
            ".gitmodules",
            join("sub", ".gitmodules"),
            join("sub", initFile),
            join("sub", "sub-b", initFileB),
            join("sub", "sub-b", "x.txt"),
          ])
        })
      })
    })
  })

  describe("hashObject", () => {
    it("should return the same result as `git hash-object` for a file", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)
      await writeFile(path, "iogjeiojgeowigjewoijoeiw")
      const stats = await lstat(path)

      const expected = (await git("hash-object", path))[0]

      expect(await handler.hashObject(stats, path)).to.equal(expected)
    })

    it("should return the same result as `git ls-files` for a file", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)
      await writeFile(path, "iogjeiojgeowigjewoijoeiw")
      const stats = await lstat(path)
      await git("add", path)

      const files = (await git("ls-files", "-s", path))[0]
      const expected = files.split(" ")[1]

      expect(await handler.hashObject(stats, path)).to.equal(expected)
    })

    it("should return the same result as `git ls-files` for a symlink", async () => {
      const filePath = resolve(tmpPath, "foo")
      const symlinkPath = resolve(tmpPath, "bar")
      await createFile(filePath)
      await writeFile(filePath, "kfgjdslgjaslj")

      await symlink("foo", symlinkPath)
      await git("add", symlinkPath)

      const stats = await lstat(symlinkPath)

      const files = (await git("ls-files", "-s", symlinkPath))[0]
      const expected = files.split(" ")[1]

      expect(await handler.hashObject(stats, symlinkPath)).to.equal(expected)
    })
  })

  describe("remote sources", () => {
    // Some git repo that we set as a remote source
    let tmpRepoA: tmp.DirectoryResult
    let tmpRepoPathA: string
    let repositoryUrlA: string

    // Another git repo that we add as a submodule to tmpRepoA
    let tmpRepoB: tmp.DirectoryResult
    let tmpRepoPathB: string

    // The path to which Garden clones the remote source, i.e.: `.garden/sources/modules/my-remote-module--hash`
    let clonePath: string

    beforeEach(async () => {
      tmpRepoA = await makeTempGitRepo()
      tmpRepoPathA = await realpath(tmpRepoA.path)
      await commit("test commit A", tmpRepoPathA)

      repositoryUrlA = `file://${tmpRepoPathA}#master`

      tmpRepoB = await makeTempGitRepo()
      tmpRepoPathB = await realpath(tmpRepoB.path)
      await commit("test commit B", tmpRepoPathB)

      const hash = hashRepoUrl(repositoryUrlA)
      clonePath = join(tmpPath, ".garden", "sources", "module", `foo--${hash}`)
    })

    afterEach(async () => {
      await tmpRepoA.cleanup()
      await tmpRepoB.cleanup()
    })

    describe("ensureRemoteSource", () => {
      it("should clone the remote source", async () => {
        await handler.ensureRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(await getCommitMsg(clonePath)).to.eql("test commit A")
      })
      it("should return the correct remote source path for module sources", async () => {
        const res = await handler.ensureRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(res).to.eql(clonePath)
      })
      it("should return the correct remote source path for project sources", async () => {
        const res = await handler.ensureRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "project",
          log,
        })

        const hash = hashRepoUrl(repositoryUrlA)
        expect(res).to.eql(join(tmpPath, ".garden", "sources", "project", `foo--${hash}`))
      })
      it("should not error if source already cloned", async () => {
        await handler.ensureRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(
          await handler.ensureRemoteSource({
            url: repositoryUrlA,
            name: "foo",
            sourceType: "module",
            log,
          })
        ).to.not.throw
      })
      it("should also clone submodules", async () => {
        // Add repo B as a submodule to repo A
        await execa("git", ["submodule", "add", tmpRepoPathB], { cwd: tmpRepoPathA })
        await execa("git", ["commit", "-m", "add submodule"], { cwd: tmpRepoPathA })

        await handler.ensureRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        // Path to submodule inside cloned source
        const submoduleFullPath = join(clonePath, basename(tmpRepoPathB))

        expect(await getCommitMsg(submoduleFullPath)).to.eql("test commit B")
        expect(await getCommitMsg(clonePath)).to.eql("add submodule")
      })
    })

    describe("updateRemoteSource", () => {
      it("should work for remote module sources", async () => {
        await handler.updateRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(await getCommitMsg(clonePath)).to.eql("test commit A")
      })
      it("should work for remote project sources", async () => {
        await handler.updateRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "project",
          log,
        })

        const hash = hashRepoUrl(repositoryUrlA)
        clonePath = join(tmpPath, ".garden", "sources", "project", `foo--${hash}`)

        expect(await getCommitMsg(clonePath)).to.eql("test commit A")
      })
      it("should update remote source", async () => {
        await handler.ensureRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        await commit("new commit", tmpRepoPathA)

        await handler.updateRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(await getCommitMsg(clonePath)).to.eql("new commit")
      })
      it("should update submodules", async () => {
        // Add repo B as a submodule to repo A
        await execa("git", ["submodule", "add", tmpRepoPathB], { cwd: tmpRepoPathA })
        await execa("git", ["commit", "-m", "add submodule"], { cwd: tmpRepoPathA })

        await handler.ensureRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        // Update repo B
        await commit("update repo B", tmpRepoPathB)

        // Update submodule in repo A
        await execa("git", ["submodule", "update", "--recursive", "--remote"], { cwd: tmpRepoPathA })
        await execa("git", ["add", "."], { cwd: tmpRepoPathA })
        await execa("git", ["commit", "-m", "update submodules"], { cwd: tmpRepoPathA })

        await handler.updateRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        // Path to submodule inside cloned source
        const submoduleFullPath = join(clonePath, basename(tmpRepoPathB))

        expect(await getCommitMsg(submoduleFullPath)).to.eql("update repo B")
        expect(await getCommitMsg(clonePath)).to.eql("update submodules")

        // Update repo A again to test that we can successfully update the clone after updating submodules
        await commit("update repo A again", tmpRepoPathA)

        await handler.updateRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(await getCommitMsg(clonePath)).to.eql("update repo A again")
      })
    })
  })
})

describe("git", () => {
  describe("getCommitIdFromRefList", () => {
    it("should get the commit id from a list of commit ids and refs", () => {
      const refList = ["abcde	ref/heads/master", "1234	ref/heads/master", "foobar	ref/heads/master"]
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
    it("should get the commit id from a list of commit ids without refs", () => {
      const refList = ["abcde", "1234	ref/heads/master", "foobar	ref/heads/master"]
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
    it("should get the commit id from a single commit id / ref pair", () => {
      const refList = ["abcde	ref/heads/master"]
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
    it("should get the commit id from single commit id without a ref", () => {
      const refList = ["abcde"]
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
  })

  describe("parseGitUrl", () => {
    it("should return the url part and the hash part from a github url", () => {
      const url = "https://github.com/org/repo.git#branch"
      expect(parseGitUrl(url)).to.eql({ repositoryUrl: "https://github.com/org/repo.git", hash: "branch" })
    })
    it("should throw a configuration error if the hash part is missing", async () => {
      const url = "https://github.com/org/repo.git"
      await expectError(() => parseGitUrl(url), "configuration")
    })
  })
})
