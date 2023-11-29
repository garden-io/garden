/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { execa } from "execa"
import { expect } from "chai"
import tmp from "tmp-promise"
import fsExtra from "fs-extra"
import { basename, join, relative, resolve } from "path"

import type { TestGarden } from "../../../helpers.js"
import { expectError, makeTestGardenA } from "../../../helpers.js"
import type { GitCli } from "../../../../src/vcs/git.js"
import { explainGitError, getCommitIdFromRefList, GitHandler, parseGitUrl } from "../../../../src/vcs/git.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import { hashRepoUrl } from "../../../../src/util/ext-source-util.js"
import { dedent, deline } from "../../../../src/util/string.js"
import { uuidv4 } from "../../../../src/util/random.js"
import type { VcsHandlerParams } from "../../../../src/vcs/vcs.js"
import { repoRoot } from "../../../../src/util/testing.js"
import { ChildProcessError, GardenError, RuntimeError } from "../../../../src/exceptions.js"

const { createFile, ensureSymlink, lstat, mkdir, mkdirp, realpath, remove, symlink, writeFile } = fsExtra

// Overriding this to make sure any ignorefile name is respected
export const defaultIgnoreFilename = ".testignore"

async function getCommitMsg(repoPath: string) {
  const res = (await execa("git", ["log", "-1", "--pretty=%B"], { cwd: repoPath })).stdout
  return res.replace("\n", "")
}

async function commit(msg: string, repoPath: string) {
  // Ensure main contains changes when committing
  const uniqueFilename = `${uuidv4()}.txt`
  const filePath = join(repoPath, uniqueFilename)
  await createFile(filePath)
  await execa("git", ["add", filePath], { cwd: repoPath })
  await execa("git", ["commit", "-m", msg], { cwd: repoPath })
  const commitSHA = (await execa("git", ["rev-parse", "HEAD"], { cwd: repoPath })).stdout
  return { uniqueFilename, commitSHA }
}

async function createGitTag(tag: string, message: string, repoPath: string) {
  await execa("git", ["tag", "-a", tag, "-m", message], { cwd: repoPath })
}

export async function makeTempGitRepo() {
  const tmpDir = await tmp.dir({ unsafeCleanup: true })
  const tmpPath = await realpath(tmpDir.path)
  await execa("git", ["init", "--initial-branch=main"], { cwd: tmpPath })

  return tmpDir
}

async function addToIgnore(tmpPath: string, pathToExclude: string, ignoreFilename = defaultIgnoreFilename) {
  const gardenignorePath = resolve(tmpPath, ignoreFilename)

  await createFile(gardenignorePath)
  await writeFile(gardenignorePath, pathToExclude)
}

async function getGitHash(git: GitCli, path: string) {
  return (await git("hash-object", path))[0]
}

export const commonGitHandlerTests = (handlerCls: new (params: VcsHandlerParams) => GitHandler) => {
  let garden: TestGarden
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string
  let git: GitCli
  let handler: GitHandler
  let log: Log

  beforeEach(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    tmpDir = await makeTempGitRepo()
    tmpPath = await realpath(tmpDir.path)
    handler = new handlerCls({
      garden,
      projectRoot: tmpPath,
      gardenDirPath: join(tmpPath, ".garden"),
      ignoreFile: defaultIgnoreFilename,
      cache: garden.treeCache,
    })
    /*
     It is critical to override the handler here. Otherwise, the garden instance will always use a handler
     that depends on the env variable `GARDEN_GIT_SCAN_MODE`.
     That can cause inconsistent behaviour is some test scenarios.

     This is a quickfix.

     TODO: consider passing in the necessary Garden params to create the vcs handler of a proper type
           inside Garden constructor. After that, the handler can be retrieved from `garden.vcs`.
     */
    garden.vcs = handler
    git = handler.gitCli(log, tmpPath)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  describe("getFiles", () => {
    context("git working tree", () => {
      it("should work with no commits in repo", async () => {
        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([])
      })

      it("should return tracked files as absolute paths with hash", async () => {
        const path = resolve(tmpPath, "foo.txt")

        await createFile(path)
        await writeFile(path, "my change")
        await git("add", ".")
        await git("commit", "-m", "foo")

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })

      it("should return the correct hash on a modified file", async () => {
        const path = resolve(tmpPath, "foo.txt")

        await createFile(path)
        await git("add", ".")
        await git("commit", "-m", "foo")

        await writeFile(path, "my change")

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
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

            await handler.writeFile(log, filePath, "my change")
            const beforeHash = (await handler.getFiles({ path: dirPath, scanRoot: undefined, log }))[0].hash

            await handler.writeFile(log, filePath, "ch-ch-ch-ch-changes")
            const afterHash = (await handler.getFiles({ path: dirPath, scanRoot: undefined, log }))[0].hash

            expect(beforeHash).to.not.eql(afterHash)
          })

          it("should return untracked files as absolute paths with hash", async () => {
            const dirPath = pathFn(tmpPath)
            const path = join(dirPath, "foo.txt")
            await createFile(path)

            const hash = await getGitHash(git, path)

            expect(await handler.getFiles({ path: dirPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
          })
        })
      }

      it("should return untracked files in untracked directory", async () => {
        const dirPath = join(tmpPath, "dir")
        const path = join(dirPath, "file.txt")
        await mkdir(dirPath)
        await createFile(path)

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: dirPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })

      it("should work with tracked files with spaces in the name", async () => {
        const path = join(tmpPath, "my file.txt")
        await createFile(path)
        await git("add", path)
        await git("commit", "-m", "foo")

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })

      it("should work with tracked+modified files with spaces in the name", async () => {
        const path = join(tmpPath, "my file.txt")
        await createFile(path)
        await git("add", path)
        await git("commit", "-m", "foo")

        await writeFile(path, "fooooo")

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })

      it("should gracefully skip files that are deleted after having been committed", async () => {
        const filePath = join(tmpPath, "my file.txt")
        await createFile(filePath)
        await git("add", filePath)
        await git("commit", "-m", "foo")

        await remove(filePath)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([])
      })

      it("should work with untracked files with spaces in the name", async () => {
        const path = join(tmpPath, "my file.txt")
        await createFile(path)

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })
    })

    context("include/exclude filters", () => {
      context("when only include filter is specified", () => {
        it("should return nothing if include: []", async () => {
          const path = resolve(tmpPath, "foo.txt")
          await createFile(path)

          expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, include: [], log })).to.eql([])
        })

        it("should filter out files that don't match the include filter", async () => {
          const path = resolve(tmpPath, "foo.txt")
          await createFile(path)

          expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, include: ["bar.*"], log })).to.eql([])
        })

        it("should include files that match the include filter", async () => {
          const path = resolve(tmpPath, "foo.txt")
          await createFile(path)
          const hash = await getGitHash(git, path)

          expect(
            await handler.getFiles({ path: tmpPath, scanRoot: undefined, include: ["foo.*"], exclude: [], log })
          ).to.eql([{ path, hash }])
        })

        it("should include a directory that's explicitly included by exact name", async () => {
          const subdirName = "subdir"
          const subdir = resolve(tmpPath, subdirName)
          await mkdir(subdir)
          const path = resolve(tmpPath, subdirName, "foo.txt")
          await createFile(path)
          const hash = await getGitHash(git, path)

          expect(
            await handler.getFiles({ path: tmpPath, scanRoot: undefined, include: [subdirName], exclude: [], log })
          ).to.eql([{ path, hash }])
        })

        it("should include hidden files that match the include filter", async () => {
          const path = resolve(tmpPath, ".foo")
          await createFile(path)
          const hash = await getGitHash(git, path)

          expect(
            await handler.getFiles({ path: tmpPath, scanRoot: undefined, include: ["*"], exclude: [], log })
          ).to.eql([{ path, hash }])
        })
      })

      context("when only exclude filter is specified", () => {
        it("should filter out files that match the exclude filter", async () => {
          const path = resolve(tmpPath, "foo.txt")
          await createFile(path)

          expect(
            await handler.getFiles({ path: tmpPath, scanRoot: undefined, include: [], exclude: ["foo.*"], log })
          ).to.eql([])
        })
      })

      context("when both include and exclude filters are specified", () => {
        it("should respect include and exclude filters", async () => {
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
              scanRoot: undefined,
            })
          ).map((f) => f.path)

          expect(files).to.eql([pathC])
        })
      })
    })

    context("ignore file", () => {
      it("should exclude untracked files that are listed in ignore file", async () => {
        const name = "foo.txt"
        const path = resolve(tmpPath, name)
        await createFile(path)
        await addToIgnore(tmpPath, name)

        const files = (await handler.getFiles({ path: tmpPath, scanRoot: undefined, exclude: [], log })).filter(
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

        const files = (await handler.getFiles({ path: tmpPath, scanRoot: undefined, exclude: [], log })).filter(
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

        const hash = await getGitHash(git, path)

        const _handler = new GitHandler({
          garden,
          projectRoot: tmpPath,
          gardenDirPath: join(tmpPath, ".garden"),
          ignoreFile: "",
          cache: garden.treeCache,
        })

        expect(await _handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })
    })

    context("symlinks", () => {
      it("should include a relative symlink within the path", async () => {
        const fileName = "foo"
        const filePath = resolve(tmpPath, fileName)
        const symlinkPath = resolve(tmpPath, "symlink")

        await createFile(filePath)
        await symlink(fileName, symlinkPath)

        const files = (await handler.getFiles({ path: tmpPath, scanRoot: undefined, exclude: [], log })).map(
          (f) => f.path
        )

        expect(files.sort()).to.eql([filePath, symlinkPath])
      })

      it("should exclude a relative symlink that points outside repo root", async () => {
        const subPath = resolve(tmpPath, "subdir")
        await mkdirp(subPath)

        const _git = handler.gitCli(log, subPath)
        await _git("init")

        const fileName = "foo"
        const filePath = resolve(tmpPath, fileName)
        const symlinkPath = resolve(subPath, "symlink")

        await createFile(filePath)
        await ensureSymlink(join("..", fileName), symlinkPath)

        const files = (await handler.getFiles({ path: subPath, scanRoot: undefined, exclude: [], log })).map(
          (f) => f.path
        )
        expect(files).to.eql([])
      })

      it("should exclude an absolute symlink that points inside the path", async () => {
        const fileName = "foo"
        const filePath = resolve(tmpPath, fileName)
        const symlinkPath = resolve(tmpPath, "symlink")

        await createFile(filePath)
        await symlink(filePath, symlinkPath)

        const files = (await handler.getFiles({ path: tmpPath, scanRoot: undefined, exclude: [], log })).map(
          (f) => f.path
        )
        expect(files).to.eql([filePath])
      })
    })

    context("gracefully aborts", () => {
      it("if given path doesn't exist", async () => {
        const path = resolve(tmpPath, "foo")

        const files = (await handler.getFiles({ path, scanRoot: undefined, exclude: [], log })).map((f) => f.path)
        expect(files).to.eql([])
      })

      it("if given path is not a directory", async () => {
        const path = resolve(tmpPath, "foo")
        await createFile(path)

        const files = (await handler.getFiles({ path, scanRoot: undefined, exclude: [], log })).map((f) => f.path)
        expect(files).to.eql([])
      })
    })

    context("large repo", () => {
      // TODO: should we track and anyhow validate the execution time here?
      it("does its thing in a reasonable amount of time", async () => {
        const scanRoot = join(repoRoot, "examples")
        const path = join(scanRoot, "demo-project")
        await handler.getFiles({ path, scanRoot, exclude: [], log })
      })
    })

    context("path contains a submodule", () => {
      let submodule: tmp.DirectoryResult
      let submodulePath: string
      let initFile: string

      beforeEach(async () => {
        submodule = await makeTempGitRepo()
        submodulePath = await realpath(submodule.path)
        initFile = (await commit("init", submodulePath)).uniqueFilename

        await execa(
          "git",
          ["-c", "protocol.file.allow=always", "submodule", "add", "--force", "--", submodulePath, "sub"],
          { cwd: tmpPath }
        )
        await execa("git", ["commit", "-m", "add submodule"], { cwd: tmpPath })
      })

      afterEach(async () => {
        await submodule.cleanup()
      })

      it("should include tracked files in submodules", async () => {
        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })
        const paths = files.map((f) => relative(tmpPath, f.path))

        expect(paths).to.eql([".gitmodules", join("sub", initFile)])
      })

      it("should work if submodule is not initialized and doesn't include any files", async () => {
        await execa("git", ["submodule", "deinit", "--all"], { cwd: tmpPath })
        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })
        const paths = files.map((f) => relative(tmpPath, f.path))

        expect(paths).to.eql([".gitmodules", "sub"])
      })

      it("should work if submodule is initialized but not updated", async () => {
        await execa("git", ["submodule", "deinit", "--all"], { cwd: tmpPath })
        await execa("git", ["submodule", "init"], { cwd: tmpPath })
        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })
        const paths = files.map((f) => relative(tmpPath, f.path))

        expect(paths).to.eql([".gitmodules", "sub"])
      })

      it("should include untracked files in submodules", async () => {
        const path = join(tmpPath, "sub", "x.txt")
        await createFile(path)

        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.eql([".gitmodules", join("sub", initFile), join("sub", "x.txt")])
      })

      it("should respect include filter when scanning a submodule", async () => {
        const path = join(tmpPath, "sub", "x.foo")
        await createFile(path)

        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log, include: ["**/*.txt"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.not.include(join("sub", path))
        expect(paths).to.include(join("sub", initFile))
      })

      it("should respect exclude filter when scanning a submodule", async () => {
        const path = join(tmpPath, "sub", "x.foo")
        await createFile(path)

        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log, exclude: ["sub/*.txt"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.eql([".gitmodules", join("sub", "x.foo")])
      })

      it("should respect include filter with ./ prefix when scanning a submodule", async () => {
        const path = join(tmpPath, "sub", "x.foo")
        await createFile(path)

        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log, include: ["./sub/*.txt"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.not.include(join("sub", path))
        expect(paths).to.include(join("sub", initFile))
      })

      it("should include the whole submodule contents when an include directly specifies its path", async () => {
        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log, include: ["sub"] })
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

        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log, include: ["sub/subdir"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.eql([relPath])
      })

      it("should include the whole submodule when a surrounding include matches it", async () => {
        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log, include: ["**/*"] })
        const paths = files.map((f) => relative(tmpPath, f.path)).sort()

        expect(paths).to.include(join("sub", initFile))
      })

      it("gracefully skips submodule if its path doesn't exist", async () => {
        const subPath = join(tmpPath, "sub")
        await remove(subPath)

        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })
        const paths = files.map((f) => relative(tmpPath, f.path))

        expect(paths).to.eql([".gitmodules"])
      })

      it("gracefully skips submodule if its path doesn't point to a directory", async () => {
        const subPath = join(tmpPath, "sub")
        await remove(subPath)
        await createFile(subPath)

        const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })
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
          initFileB = (await commit("init", submodulePathB)).uniqueFilename

          await execa("git", ["-c", "protocol.file.allow=always", "submodule", "add", submodulePathB, "sub-b"], {
            cwd: join(tmpPath, "sub"),
          })
          await execa("git", ["commit", "-m", "add submodule"], { cwd: join(tmpPath, "sub") })
        })

        afterEach(async () => {
          await submoduleB.cleanup()
        })

        it("should include tracked files in nested submodules", async () => {
          const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })
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

          const files = await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })
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

  describe("getPathInfo", () => {
    it("should return empty strings with no commits in repo", async () => {
      const path = tmpPath
      const { branch, commitHash } = await handler.getPathInfo(log, path)
      expect(branch).to.equal("")
      expect(commitHash).to.equal("")
    })

    it("should return the current branch name when there are commits in the repo", async () => {
      const path = tmpPath
      await commit("init", tmpPath)
      const { branch } = await handler.getPathInfo(log, path)
      expect(branch).to.equal("main")
    })

    it("should return empty strings when given a path outside of a repo", async () => {
      const path = tmpPath
      const { branch, commitHash, originUrl } = await handler.getPathInfo(log, path)
      expect(branch).to.equal("")
      expect(commitHash).to.equal("")
      expect(originUrl).to.equal("")
    })
  })

  describe("hashObject", () => {
    it("should return the same result as `git hash-object` for a file", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)
      await writeFile(path, "iogjeiojgeowigjewoijoeiw")
      const stats = await lstat(path)

      const expected = await getGitHash(git, path)

      const hash = await handler.hashObject(stats, path)
      expect(hash).to.equal(expected)
    })

    it("should return the same result as `git ls-files` for a file", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)
      await writeFile(path, "iogjeiojgeowigjewoijoeiw")
      const stats = await lstat(path)
      await git("add", path)

      const files = (await git("ls-files", "-s", path))[0]
      const expected = files.split(" ")[1]

      const hash = await handler.hashObject(stats, path)
      expect(hash).to.equal(expected)
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

      const hash = await handler.hashObject(stats, symlinkPath)
      expect(hash).to.equal(expected)
    })
  })

  describe("remote sources", () => {
    // Some git repo that we set as a remote source
    let tmpRepoA: tmp.DirectoryResult
    let tmpRepoPathA: string
    let repoUrl: string
    // Another git repo that we add as a submodule to tmpRepoA
    let tmpRepoB: tmp.DirectoryResult
    let tmpRepoPathB: string

    // The path to which Garden clones the remote source, i.e.: `.garden/sources/modules/my-remote-module--hash`
    let clonePath: string

    afterEach(async () => {
      await tmpRepoA.cleanup()
      await tmpRepoB.cleanup()
    })

    async function createRepo(repoUrlMethod: "commit" | "branch" | "tag", withSubmodule = false) {
      tmpRepoA = await makeTempGitRepo()
      tmpRepoPathA = await realpath(tmpRepoA.path)

      tmpRepoB = await makeTempGitRepo()
      tmpRepoPathB = await realpath(tmpRepoB.path)
      await commit("test commit B", tmpRepoPathB)

      if (withSubmodule) {
        // Add repo B as a submodule to repo A
        await execa("git", ["-c", "protocol.file.allow=always", "submodule", "add", tmpRepoPathB], {
          cwd: tmpRepoPathA,
        })
        await execa("git", ["commit", "-m", "add submodule"], { cwd: tmpRepoPathA })
      }
      const { commitSHA } = await commit("test commit A", tmpRepoPathA)
      const tag = "v1"
      await createGitTag(tag, "a cool release", tmpRepoPathA)

      switch (repoUrlMethod) {
        case "commit":
          repoUrl = `file://${tmpRepoPathA}#${commitSHA}`
          break
        case "branch":
          repoUrl = `file://${tmpRepoPathA}#main`
          break
        case "tag":
          repoUrl = `file://${tmpRepoPathA}#${tag}`
          break
      }

      const hash = hashRepoUrl(repoUrl)
      clonePath = join(tmpPath, ".garden", "sources", "module", `foo--${hash}`)
    }

    describe("ensureRemoteSource", () => {
      for (const repoUrlMethod of ["commit", "branch", "tag"] as const) {
        context(`from a ${repoUrlMethod}`, () => {
          it("should clone the remote source", async () => {
            await createRepo(repoUrlMethod)
            await handler.ensureRemoteSource({
              url: repoUrl,
              name: "foo",
              sourceType: "module",
              log,
            })

            expect(await getCommitMsg(clonePath)).to.eql("test commit A")
          })
          it("should return the correct remote source path for module sources", async () => {
            await createRepo(repoUrlMethod)
            const res = await handler.ensureRemoteSource({
              url: repoUrl,
              name: "foo",
              sourceType: "module",
              log,
            })

            expect(res).to.eql(clonePath)
          })
          it("should return the correct remote source path for project sources", async () => {
            await createRepo(repoUrlMethod)
            const res = await handler.ensureRemoteSource({
              url: repoUrl,
              name: "foo",
              sourceType: "project",
              log,
            })

            const hash = hashRepoUrl(repoUrl)
            expect(res).to.eql(join(tmpPath, ".garden", "sources", "project", `foo--${hash}`))
          })
          it("should not error if source already cloned", async () => {
            await createRepo(repoUrlMethod)
            await handler.ensureRemoteSource({
              url: repoUrl,
              name: "foo",
              sourceType: "module",
              log,
            })

            expect(
              await handler.ensureRemoteSource({
                url: repoUrl,
                name: "foo",
                sourceType: "module",
                log,
              })
            ).to.not.throw
          })
          it("should also clone submodules", async () => {
            await createRepo(repoUrlMethod, true)
            await handler.ensureRemoteSource({
              url: repoUrl,
              name: "foo",
              sourceType: "module",
              log,
            })

            // Path to submodule inside cloned source
            const submoduleFullPath = join(clonePath, basename(tmpRepoPathB))

            expect(await getCommitMsg(submoduleFullPath)).to.eql("test commit B")
            expect(await getCommitMsg(clonePath)).to.eql("test commit A")
          })
        })
      }
    })

    describe("updateRemoteSource", () => {
      beforeEach(async () => await createRepo("branch"))
      it("should work for remote module sources", async () => {
        await handler.updateRemoteSource({
          url: repoUrl,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(await getCommitMsg(clonePath)).to.eql("test commit A")
      })
      it("should work for remote project sources", async () => {
        await handler.updateRemoteSource({
          url: repoUrl,
          name: "foo",
          sourceType: "project",
          log,
        })

        const hash = hashRepoUrl(repoUrl)
        clonePath = join(tmpPath, ".garden", "sources", "project", `foo--${hash}`)

        expect(await getCommitMsg(clonePath)).to.eql("test commit A")
      })
      it("should update remote source", async () => {
        await handler.ensureRemoteSource({
          url: repoUrl,
          name: "foo",
          sourceType: "module",
          log,
        })

        await commit("new commit", tmpRepoPathA)

        await handler.updateRemoteSource({
          url: repoUrl,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(await getCommitMsg(clonePath)).to.eql("new commit")
      })

      it("should exit on `failOnPrompt` when updating a remote source and prompting for user input", async () => {
        await mkdirp(clonePath)
        await execa("git", ["init", "--initial-branch=main"], { cwd: clonePath })
        await execa("git", ["commit", "-m", "commit", "--allow-empty"], { cwd: clonePath })
        await execa("git", ["remote", "add", "origin", "https://fake@github.com/private/private.git"], {
          cwd: clonePath,
        })
        let error: unknown
        try {
          await handler.updateRemoteSource({
            url: repoUrl,
            name: "foo",
            sourceType: "module",
            log,
            failOnPrompt: true,
          })
        } catch (e) {
          error = e
        }
        if (!(error instanceof GardenError)) {
          expect.fail("Expected error to be an instance of GardenError")
        }
        expect(error?.message).to.contain("Invalid username or password.")
      })

      it("should update submodules", async () => {
        // Add repo B as a submodule to repo A
        await execa("git", ["-c", "protocol.file.allow=always", "submodule", "add", tmpRepoPathB], {
          cwd: tmpRepoPathA,
        })
        await execa("git", ["commit", "-m", "add submodule"], { cwd: tmpRepoPathA })

        await handler.ensureRemoteSource({
          url: repoUrl,
          name: "foo",
          sourceType: "module",
          log,
        })

        // Update repo B
        await commit("update repo B", tmpRepoPathB)

        // Update submodule in repo A
        await execa("git", ["-c", "protocol.file.allow=always", "submodule", "update", "--recursive", "--remote"], {
          cwd: tmpRepoPathA,
        })
        await execa("git", ["add", "."], { cwd: tmpRepoPathA })
        await execa("git", ["commit", "-m", "update submodules"], { cwd: tmpRepoPathA })

        await handler.updateRemoteSource({
          url: repoUrl,
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
          url: repoUrl,
          name: "foo",
          sourceType: "module",
          log,
        })

        expect(await getCommitMsg(clonePath)).to.eql("update repo A again")
      })
    })
  })
}

describe("GitHandler", () => {
  commonGitHandlerTests(GitHandler)
})

describe("git", () => {
  describe("getCommitIdFromRefList", () => {
    it("should get the commit id from a list of commit ids and refs", () => {
      const refList = ["abcde	ref/heads/main", "1234	ref/heads/main", "foobar	ref/heads/main"]
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
    it("should get the commit id from a list of commit ids without refs", () => {
      const refList = ["abcde", "1234	ref/heads/main", "foobar	ref/heads/main"]
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
    it("should get the commit id from a single commit id / ref pair", () => {
      const refList = ["abcde	ref/heads/main"]
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

  describe("explainGitError", () => {
    const path = "/tmp"

    function getChildProcessError(exitCode: number, stderr: string): ChildProcessError {
      return new ChildProcessError({
        cmd: "git",
        args: ["rev-parse", "--show-toplevel"],
        code: exitCode,
        output: stderr,
        stderr,
        stdout: "",
      })
    }

    context("on error code 128", () => {
      const exitCode = 128

      it("should throw a nice error when given a path outside of a repo", async () => {
        const stderr = "fatal: not a git repository (or any of the parent directories): .git"
        const gitError = getChildProcessError(exitCode, stderr)

        const explainedGitError = explainGitError(gitError, path)
        expect(explainedGitError).to.be.instanceof(RuntimeError)
        expect(explainedGitError.message).to.eql(deline`
          Path ${path} is not in a git repository root. Garden must be run from within a git repo.
          Please run \`git init\` if you're starting a new project and repository, or move the project to
          an existing repository, and try again.
        `)
      })

      it("should throw an original error with exit code 128 the rest cases", async () => {
        const stderr = `fatal: another git error with exit code ${exitCode}`
        const gitError = getChildProcessError(exitCode, stderr)

        const explainedGitError = explainGitError(gitError, path)
        expect(explainedGitError).to.be.instanceof(ChildProcessError)

        const castedExplainedGitError = explainedGitError as ChildProcessError
        expect(castedExplainedGitError.details.code).to.eql(exitCode)
        expect(castedExplainedGitError.message).to.eql(dedent`
          Command "git rev-parse --show-toplevel" failed with code ${exitCode}:

          ${stderr}
        `)
      })
    })

    it("should throw an original error when exit code is not 128", async () => {
      const exitCode = -1
      const stderr = "fatal: unexpected git error"
      const gitError = getChildProcessError(exitCode, stderr)

      const explainedGitError = explainGitError(gitError, path)
      expect(explainedGitError).to.be.instanceof(ChildProcessError)

      const castedExplainedGitError = explainedGitError as ChildProcessError
      expect(castedExplainedGitError.details.code).to.eql(exitCode)
      expect(castedExplainedGitError.message).to.eql(dedent`
          Command "git rev-parse --show-toplevel" failed with code ${exitCode}:

          ${stderr}
        `)
    })
  })
})
