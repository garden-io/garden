/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa = require("execa")
import { expect } from "chai"
import tmp from "tmp-promise"
import uuid from "uuid"
import { createFile, writeFile, realpath, mkdir, remove, symlink } from "fs-extra"
import { join, resolve, basename } from "path"

import { expectError, makeTestGardenA } from "../../../helpers"
import { getCommitIdFromRefList, parseGitUrl, GitHandler } from "../../../../src/vcs/git"
import { fixedExcludes } from "../../../../src/util/fs"
import { LogEntry } from "../../../../src/logger/log-entry"
import { hashRepoUrl } from "../../../../src/util/ext-source-util"

// Overriding this to make sure any ignorefile name is respected
const defaultIgnoreFilename = ".testignore"

async function getCommitMsg(repoPath: string) {
  const res = (await execa("git", ["log", "-1", "--pretty=%B"], { cwd: repoPath })).stdout
  return res.replace("\n", "")
}

async function commit(msg: string, repoPath: string) {
  // Ensure master contains changes when commiting
  const uniqueFilename = uuid.v4()
  const filePath = join(repoPath, `${uniqueFilename}.txt`)
  await createFile(filePath)
  await execa("git", ["add", filePath], { cwd: repoPath })
  await execa("git", ["commit", "-m", msg], { cwd: repoPath })
}

async function makeTempGitRepo(initCommitMsg: string = "test commit") {
  const tmpDir = await tmp.dir({ unsafeCleanup: true })
  const tmpPath = await realpath(tmpDir.path)
  await execa("git", ["init"], { cwd: tmpPath })

  await commit(initCommitMsg, tmpPath)

  return tmpDir
}

async function addToIgnore(tmpPath: string, pathToExclude: string, ignoreFilename = defaultIgnoreFilename) {
  const gardenignorePath = resolve(tmpPath, ignoreFilename)

  await createFile(gardenignorePath)
  await writeFile(gardenignorePath, pathToExclude)
}

describe("GitHandler", () => {
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string
  let git
  let handler: GitHandler
  let log: LogEntry

  beforeEach(async () => {
    const garden = await makeTestGardenA()
    log = garden.log
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    tmpPath = await realpath(tmpDir.path)
    handler = new GitHandler(tmpPath, [defaultIgnoreFilename])
    git = (<any>handler).gitCli(log, tmpPath)
    await git("init")
  })

  afterEach(async () => {
    await tmpDir.cleanup()
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

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([
        { path, hash },
      ])
    })

    it("should return the correct hash on a modified file", async () => {
      const path = resolve(tmpPath, "foo.txt")

      await createFile(path)
      await git("add", ".")
      await git("commit", "-m", "foo")

      await writeFile(path, "my change")
      const hash = "6e1ab2d7d26c1c66f27fea8c136e13c914e3f137"

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([
        { path, hash },
      ])
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

          expect(await handler.getFiles({ path: dirPath, log })).to.eql([
            { path: resolve(dirPath, "foo.txt"), hash },
          ])
        })
      })
    }

    it("should return untracked files in untracked directory", async () => {
      const dirPath = join(tmpPath, "dir")
      await mkdir(dirPath)
      await createFile(join(dirPath, "file.txt"))
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"

      expect(await handler.getFiles({ path: dirPath, log })).to.eql([
        { path: resolve(dirPath, "file.txt"), hash },
      ])
    })

    it("should work with tracked files with spaces in the name", async () => {
      const filePath = join(tmpPath, "my file.txt")
      await createFile(filePath)
      await git("add", filePath)
      await git("commit", "-m", "foo")
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([
        { path: resolve(tmpPath, "my file.txt"), hash },
      ])
    })

    it("should work with tracked+modified files with spaces in the name", async () => {
      const filePath = join(tmpPath, "my file.txt")
      await createFile(filePath)
      await git("add", filePath)
      await git("commit", "-m", "foo")

      await writeFile(filePath, "fooooo")

      const hash = "099673697c6cbf5c1a96c445ef3eab123740c778"

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([
        { path: resolve(tmpPath, "my file.txt"), hash },
      ])
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

      expect(await handler.getFiles({ path: tmpPath, log })).to.eql([
        { path: resolve(tmpPath, "my file.txt"), hash },
      ])
    })

    it("should filter out files that don't match the include filter, if specified", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)

      expect(await handler.getFiles({ path: tmpPath, include: [], log })).to.eql([])
    })

    it("should include files that match the include filter, if specified", async () => {
      const path = resolve(tmpPath, "foo.txt")
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
      await createFile(path)

      expect(await handler.getFiles({ path: tmpPath, include: ["foo.*"], exclude: [], log })).to.eql([
        { path, hash },
      ])
    })

    it("should filter out files that match the exclude filter, if specified", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)

      expect(await handler.getFiles({ path: tmpPath, include: [], exclude: ["foo.*"], log })).to.eql([])
    })

    it("should respect include and exclude patterns, if both are specified", async () => {
      const dir = resolve(tmpPath, "module-a")
      const pathA = resolve(dir, "yes.txt")
      const pathB = resolve(tmpPath, "no.txt")
      const pathC = resolve(dir, "yes.pass")
      await mkdir(dir)
      await createFile(pathA)
      await createFile(pathB)
      await createFile(pathC)

      const files = (await handler.getFiles({ path: tmpPath, include: ["module-a/**/*"], exclude: ["**/*.txt"], log }))
        .map(f => f.path)

      expect(files).to.eql([pathC])
    })

    it("should exclude untracked files that are listed in ignore file", async () => {
      const name = "foo.txt"
      const path = resolve(tmpPath, name)
      await createFile(path)
      await addToIgnore(tmpPath, name)

      const files = (await handler.getFiles({ path: tmpPath, exclude: [], log }))
        .filter(f => !f.path.includes(defaultIgnoreFilename))

      expect(files).to.eql([])
    })

    it("should exclude tracked files that are listed in ignore file", async () => {
      const name = "foo.txt"
      const path = resolve(tmpPath, name)
      await createFile(path)
      await addToIgnore(tmpPath, name)

      await git("add", path)
      await git("commit", "-m", "foo")

      const files = (await handler.getFiles({ path: tmpPath, exclude: [], log }))
        .filter(f => !f.path.includes(defaultIgnoreFilename))

      expect(files).to.eql([])
    })

    it("should correctly handle multiple ignore files", async () => {
      const nameA = "foo.txt"
      const nameB = "boo.txt"
      const pathA = resolve(tmpPath, nameA)
      const pathB = resolve(tmpPath, nameB)
      await createFile(pathA)
      await createFile(pathB)

      await addToIgnore(tmpPath, nameA)
      await addToIgnore(tmpPath, nameB, ".testignore2")

      // We only add path A, to check if untracked files work okay
      await git("add", pathA)
      await git("commit", "-m", "foo")

      const _handler = new GitHandler(tmpPath, [defaultIgnoreFilename, ".testignore2"])

      const files = (await _handler.getFiles({ path: tmpPath, exclude: [], log }))
        .filter(f => !f.path.includes(defaultIgnoreFilename))

      expect(files).to.eql([])
    })

    it("should exclude files that are exclude by default", async () => {
      for (const exclude of fixedExcludes) {
        const name = "foo.txt"
        const updatedExclude = exclude.replace("**", "a-folder").replace("*", "-a-value/sisis")
        const path = resolve(join(tmpPath, updatedExclude), name)
        await createFile(path)
      }

      const files = (await handler.getFiles({ path: tmpPath, exclude: [...fixedExcludes], log }))
        .filter(f => !f.path.includes(defaultIgnoreFilename))

      expect(files).to.eql([])
    })

    it("should exclude an untracked symlink to a directory", async () => {
      const tmpDir2 = await tmp.dir({ unsafeCleanup: true })
      const tmpPathB = await realpath(tmpDir2.path)

      const name = "a-symlink-to-a-directory"
      const path = resolve(tmpPath, name)

      await symlink(tmpPathB, path)

      const files = (await handler.getFiles({ path: tmpPath, exclude: [], log }))
        .filter(f => !f.path.includes(defaultIgnoreFilename))

      expect(files).to.eql([])
    })
  })

  describe("hashObject", () => {
    it("should return the same result as `git hash-object` for a file", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)

      const expected = (await git("hash-object", path))[0]

      expect(await handler.hashObject(path)).to.equal(expected)
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
      tmpRepoA = await makeTempGitRepo("test commit A")
      tmpRepoPathA = await realpath(tmpRepoA.path)
      repositoryUrlA = `file://${tmpRepoPathA}#master`

      tmpRepoB = await makeTempGitRepo("test commit B")
      tmpRepoPathB = await realpath(tmpRepoB.path)

      const hash = hashRepoUrl(repositoryUrlA)
      clonePath = join(tmpPath, "sources", "module", `foo--${hash}`)
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
        expect(res).to.eql(join(tmpPath, "sources", "project", `foo--${hash}`))
      })
      it("should not error if source already cloned", async () => {
        await handler.ensureRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(await handler.ensureRemoteSource({
          url: repositoryUrlA,
          name: "foo",
          sourceType: "module",
          log,
        })).to.not.throw
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
        clonePath = join(tmpPath, "sources", "project", `foo--${hash}`)

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
      const refList = [
        "abcde	ref/heads/master",
        "1234	ref/heads/master",
        "foobar	ref/heads/master",
      ]
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
    it("should get the commit id from a list of commit ids without refs", () => {
      const refList = [
        "abcde",
        "1234	ref/heads/master",
        "foobar	ref/heads/master",
      ]
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
