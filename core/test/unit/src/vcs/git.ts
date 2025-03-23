/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { execa } from "execa"
import { expect } from "chai"
import { afterEach, beforeEach } from "mocha"
import type tmp from "tmp-promise"
import fsExtra from "fs-extra"
import { basename, dirname, join, relative, resolve } from "path"

import {
  expectError,
  getDataDir,
  makeTempDir,
  makeTestGarden,
  makeTestGardenA,
  type TestGarden,
} from "../../../helpers.js"
import {
  type AbstractGitHandler,
  explainGitError,
  getCommitIdFromRefList,
  GitCli,
  hashObject,
  parseGitUrl,
} from "../../../../src/vcs/git.js"
import { GitRepoHandler } from "../../../../src/vcs/git-repo.js"
import { GitSubTreeHandler } from "../../../../src/vcs/git-sub-tree.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import { hashRepoUrl } from "../../../../src/util/ext-source-util.js"
import { dedent, deline } from "../../../../src/util/string.js"
import { uuidv4 } from "../../../../src/util/random.js"
import type { VcsHandlerParams } from "../../../../src/vcs/vcs.js"
import { repoRoot } from "../../../../src/util/testing.js"
import { ChildProcessError, GardenError, RuntimeError } from "../../../../src/exceptions.js"
import type { GitScanMode } from "../../../../src/constants.js"
import type { Garden } from "../../../../src/index.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"

const { createFile, ensureSymlink, lstat, mkdir, mkdirp, realpath, remove, rename, symlink, writeFile } = fsExtra

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

async function addToIgnore(tmpPath: string, pathToExclude: string, ignoreFilename = defaultIgnoreFilename) {
  const gardenignorePath = resolve(tmpPath, ignoreFilename)

  await createFile(gardenignorePath)
  await writeFile(gardenignorePath, pathToExclude)
}

async function getGitHash(git: GitCli, path: string) {
  return (await git.exec("hash-object", path))[0]
}

type GitHandlerCls = new (params: VcsHandlerParams) => AbstractGitHandler

function getGitHandlerCls(gitScanMode: GitScanMode): GitHandlerCls {
  switch (gitScanMode) {
    case "repo":
      return GitRepoHandler
    case "subtree":
      return GitSubTreeHandler
    default:
      return gitScanMode satisfies never
  }
}

const commonGitHandlerTests = (gitScanMode: GitScanMode) => {
  let garden: TestGarden
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string
  let git: GitCli
  let handler: AbstractGitHandler
  let log: Log

  const gitHandlerCls = getGitHandlerCls(gitScanMode)

  beforeEach(async () => {
    garden = await makeTestGardenA([], { gitScanMode })
    log = garden.log
    tmpDir = await makeTempDir({ git: true, initialCommit: false })
    tmpPath = await realpath(tmpDir.path)
    handler = new gitHandlerCls({
      garden,
      projectRoot: tmpPath,
      gardenDirPath: join(tmpPath, ".garden"),
      ignoreFile: defaultIgnoreFilename,
      cache: garden.treeCache,
    })
    git = new GitCli({ log, cwd: tmpPath })
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
        await git.exec("add", ".")
        await git.exec("commit", "-m", "foo")

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })

      it("should return the correct hash on a modified file", async () => {
        const path = resolve(tmpPath, "foo.txt")

        await createFile(path)
        await git.exec("add", ".")
        await git.exec("commit", "-m", "foo")

        await writeFile(path, "my change")

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })

      const dirContexts = [
        {
          ctx: "when called from repo root",
          pathFn: (tp: string): string => tp,
        },
        { ctx: "when called from project root", pathFn: (tp: string): string => resolve(tp, "somedir") },
      ]

      for (const { ctx, pathFn } of dirContexts) {
        context(ctx, () => {
          it("should return different hashes before and after a file is modified", async () => {
            const dirPath = pathFn(tmpPath)
            const filePath = resolve(tmpPath, "somedir", "foo.txt")

            await createFile(filePath)
            await writeFile(filePath, "original content")
            await git.exec("add", ".")
            await git.exec("commit", "-m", "foo")

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
        await git.exec("add", path)
        await git.exec("commit", "-m", "foo")

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })

      it("should work with tracked+modified files with spaces in the name", async () => {
        const path = join(tmpPath, "my file.txt")
        await createFile(path)
        await git.exec("add", path)
        await git.exec("commit", "-m", "foo")

        await writeFile(path, "fooooo")

        const hash = await getGitHash(git, path)

        expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, log })).to.eql([{ path, hash }])
      })

      it("should gracefully skip files that are deleted after having been committed", async () => {
        const filePath = join(tmpPath, "my file.txt")
        await createFile(filePath)
        await git.exec("add", filePath)
        await git.exec("commit", "-m", "foo")

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
        const excludeEmptyValues: [undefined, string[]] = [undefined, []]

        function renderExcludeEmptyValue(v: (typeof excludeEmptyValues)[number]): string {
          if (v === undefined) {
            return "undefined"
          }
          expect(v).to.eql([])
          return "an empty list"
        }

        // Include filter must behave equally when exclude is empty and undefined
        for (const exclude of excludeEmptyValues) {
          context(`when exclude is ${renderExcludeEmptyValue(exclude)}`, () => {
            it("should return nothing if include: []", async () => {
              const path = resolve(tmpPath, "foo.txt")
              await createFile(path)

              expect(await handler.getFiles({ path: tmpPath, scanRoot: undefined, include: [], exclude, log })).to.eql(
                []
              )
            })

            context("should filter out files that don't match the include filter", () => {
              it("when filename doesn't match the include filter", async () => {
                const path = resolve(tmpPath, "foo.txt")
                await createFile(path)

                expect(
                  await handler.getFiles({
                    path: tmpPath,
                    scanRoot: undefined,
                    include: ["bar.*"],
                    exclude,
                    log,
                  })
                ).to.eql([])
              })

              it("when file is in a sub-directory and filename matches the include filter", async () => {
                const subdirName = "subdir"
                const subdir = resolve(tmpPath, subdirName)
                await mkdir(subdir)
                const path = resolve(subdir, "foo.txt")
                await createFile(path)

                expect(
                  await handler.getFiles({
                    path: tmpPath,
                    scanRoot: undefined,
                    include: ["foo.*"],
                    exclude,
                    log,
                  })
                ).to.eql([])
              })
            })

            context("should include files that match the include filter", () => {
              it("when filename matches the include filter", async () => {
                const path = resolve(tmpPath, "foo.txt")
                await createFile(path)

                const files = (
                  await handler.getFiles({
                    path: tmpPath,
                    scanRoot: undefined,
                    include: ["foo.*"],
                    exclude,
                    log,
                  })
                ).map((p) => p.path)

                expect(files).to.eql([path])
              })

              it("when file is in a sub-directory matches the include filter with globs", async () => {
                const subdirName = "subdir"
                const subdir = resolve(tmpPath, subdirName)
                await mkdir(subdir)
                const path = resolve(subdir, "foo.txt")
                await createFile(path)

                const files = (
                  await handler.getFiles({
                    path: tmpPath,
                    scanRoot: undefined,
                    include: ["**/foo.*"],
                    exclude,
                    log,
                  })
                ).map((p) => p.path)

                expect(files).to.eql([path])
              })
            })

            context("should include a directory that match the include filter", () => {
              it("when directory is explicitly included by exact name", async () => {
                const subdirName = "subdir"
                const subdir = resolve(tmpPath, subdirName)
                await mkdir(subdir)
                const path = resolve(subdir, "foo.txt")
                await createFile(path)

                const files = (
                  await handler.getFiles({
                    path: tmpPath,
                    scanRoot: undefined,
                    include: [subdirName],
                    exclude,
                    log,
                  })
                ).map((p) => p.path)

                expect(files).to.eql([path])
              })

              context("when included directory is in a sub-directory", () => {
                // Here we  include the deepdir located at ./subdir/deepdir
                const testParams = [
                  {
                    name: "when directory is included by exact relative path",
                    inclusionBuilder: (subDirName: string, deepDirName: string) => join(subDirName, deepDirName),
                  },
                  {
                    name: "when directory is included by relative path with globs",
                    inclusionBuilder: (subDirName: string, deepDirName: string) =>
                      join(subDirName, deepDirName, "**", "*"),
                  },
                  {
                    name: "when directory is included by name with globs", // FIXME-GITREPOHANDLER: shouldn't just '**/deepdir' work well too?
                    inclusionBuilder: (_subDirName: string, deepDirName: string) => join("**", deepDirName, "**", "*"),
                  },
                ]

                for (const testParam of testParams) {
                  it(testParam.name, async () => {
                    const subdirName = "subdir"
                    const subdir = resolve(tmpPath, subdirName)
                    await mkdir(subdir)
                    const deepDirName = "deepdir"
                    const deepDir = resolve(subdir, deepDirName)
                    await mkdir(deepDir)
                    const path = resolve(deepDir, "foo.txt")
                    await createFile(path)

                    const include = [testParam.inclusionBuilder(subdirName, deepDirName)]
                    const files = (
                      await handler.getFiles({
                        path: tmpPath,
                        scanRoot: undefined,
                        include,
                        exclude,
                        log,
                      })
                    ).map((p) => p.path)

                    expect(files).to.eql([path])
                  })
                }
              })
            })

            it("should include hidden files that match the include filter", async () => {
              const path = resolve(tmpPath, ".foo")
              await createFile(path)

              const files = (
                await handler.getFiles({
                  path: tmpPath,
                  scanRoot: undefined,
                  include: ["*"],
                  exclude,
                  log,
                })
              ).map((p) => p.path)

              expect(files).to.eql([path])
            })
          })
        }
      })

      // When ONLY exclude filter is defined,
      // the exclusion paths with and without glob prefix **/ works in the same way.
      context("when only exclude filter is specified", () => {
        context("should filter out files that match the exclude filter", () => {
          const fooTxt = `foo.txt`
          const fooWildcard = `foo.*`

          let fooPath: string
          let barPath: string
          let dirPath: string
          let dirFooPath: string
          let dirBarPath: string

          const testParams = [
            {
              name: "by exact filename without globs",
              exclude: () => fooTxt,
              expectedFiles: () => (gitScanMode === "repo" ? [barPath, dirBarPath, dirFooPath] : [barPath, dirBarPath]),
            },
            {
              name: "by exact filename with prefix globs",
              exclude: () => join("**", fooTxt),
              expectedFiles: () => [barPath, dirBarPath],
            },
            {
              name: "by filename with wildcard extension without prefix globs",
              exclude: () => fooWildcard,
              expectedFiles: () => (gitScanMode === "repo" ? [barPath, dirBarPath, dirFooPath] : [barPath, dirBarPath]),
            },
            {
              name: "by filename with wildcard extension with prefix globs",
              exclude: () => join("**", fooWildcard),
              expectedFiles: () => [barPath, dirBarPath],
            },
          ]

          for (const testParam of testParams) {
            it(testParam.name, async () => {
              fooPath = resolve(tmpPath, "foo.txt")
              barPath = resolve(tmpPath, "bar.txt")
              // const notExcludedDirName = "dir"
              dirPath = resolve(tmpPath, "dir")
              dirFooPath = resolve(dirPath, "foo.txt")
              dirBarPath = resolve(dirPath, "bar.txt")

              // matches file exclusion pattern -> should be excluded
              await createFile(fooPath)

              // doesn't match file exclusion pattern -> should be included
              await createFile(barPath)
              await mkdir(dirPath)

              // matches exclusion pattern filename and located in non-excluded dir -> should be excluded
              await createFile(dirFooPath)

              // doesn't match file exclusion pattern -> should be included
              await createFile(dirBarPath)

              const files = (
                await handler.getFiles({
                  path: tmpPath,
                  scanRoot: undefined,
                  include: undefined,
                  exclude: [testParam.exclude()],
                  log,
                })
              )
                .map((p) => p.path)
                .sort()

              expect(files).to.eql(testParam.expectedFiles())
            })
          }
        })

        context("should filter directories that match the exclude filter", () => {
          context("should filter out any files from direct sub-directories that match the exclude filter", () => {
            let barPath: string
            let dirBarPath: string
            let excludedDirFooPath: string
            let excludedDirBarPath: string
            const testParams = [
              {
                name: "without globs",
                exclusionBuilder: (subDirName: string) => subDirName,
                expectedFiles: () => [barPath, dirBarPath],
              },
              {
                name: "with prefix globs",
                exclusionBuilder: (subDirName: string) => join("**", subDirName),
                expectedFiles: () =>
                  gitScanMode === "repo"
                    ? [barPath, dirBarPath, excludedDirBarPath, excludedDirFooPath]
                    : [barPath, dirBarPath],
              },
              {
                name: "with full globs",
                exclusionBuilder: (subDirName: string) => join("**", subDirName, "**", "*"),
                expectedFiles: () => [barPath, dirBarPath],
              },
              {
                name: "with redundant relative path",
                exclusionBuilder: (subDirName: string) => `./${subDirName}`,
                expectedFiles: () => [barPath, dirBarPath],
              },
            ]

            /*
              Dir structure:
              |- bar.txt // included
              |- dir // included
              |--- bar.txt
              |- excluded-dir // excluded direct sub-directory
              |-- foo.txt
              |-- bar.txt
              */
            for (const testParam of testParams) {
              it(testParam.name, async () => {
                // doesn't match file exclusion pattern -> should be included
                barPath = resolve(tmpPath, "bar.txt")

                const dirPath = resolve(tmpPath, "dir")
                await mkdir(dirPath)

                // doesn't match file exclusion pattern in non-excluded dir -> should be included
                dirBarPath = resolve(dirPath, "bar.txt")

                // both match directory exclusion pattern -> should be excluded despite the file exclusion pattern matching
                const excludedDirName = "excluded-dir"
                const excludedDirPath = resolve(tmpPath, excludedDirName)
                await mkdir(excludedDirPath)
                excludedDirFooPath = resolve(excludedDirPath, "foo.txt")
                excludedDirBarPath = resolve(excludedDirPath, "bar.txt")

                await createFile(barPath)
                await createFile(dirBarPath)
                await createFile(excludedDirFooPath)
                await createFile(excludedDirBarPath)

                const files = (
                  await handler.getFiles({
                    path: tmpPath,
                    scanRoot: undefined,
                    include: undefined, // when include: [], getFiles() always returns an empty result
                    exclude: [testParam.exclusionBuilder(excludedDirName)],
                    log,
                  })
                )
                  .map((p) => p.path)
                  .sort()

                expect(files).to.eql(testParam.expectedFiles())
              })
            }
          })

          context("should filter out all files from deep sub-directories that match the exclude filter", () => {
            let barPath: string
            let dirBarPath: string
            let excludedSubdirFooPath: string
            let excludedSubdirBarPath: string

            const testParams = [
              {
                name: "without globs",
                exclusionBuilder: (...subDirNames: string[]) => subDirNames.at(-1)!,
                expectedFiles: () =>
                  gitScanMode === "repo"
                    ? [barPath, dirBarPath, excludedSubdirBarPath, excludedSubdirFooPath]
                    : [barPath, dirBarPath],
              },
              {
                name: "with prefix globs",
                exclusionBuilder: (...subDirNames: string[]) => join("**", subDirNames.at(-1)!),
                expectedFiles: () =>
                  gitScanMode === "repo"
                    ? [barPath, dirBarPath, excludedSubdirBarPath, excludedSubdirFooPath]
                    : [barPath, dirBarPath],
              },
              {
                name: "with full globs",
                exclusionBuilder: (...subDirNames: string[]) => join("**", subDirNames.at(-1)!, "**", "*"),
                expectedFiles: () => [barPath, dirBarPath],
              },
              {
                name: "with redundant relative path",
                exclusionBuilder: (...subDirNames: string[]) => `./${subDirNames.join("/")}`,
                expectedFiles: () => [barPath, dirBarPath],
              },
            ]

            /*
              Dir structure:
              |- bar.txt // included
              |- dir // included
              |--- bar.txt
              |--- excluded-subdir // excluded deep sub-directory
              |----- foo.txt
              |----- bar.txt
              */
            for (const testParam of testParams) {
              it(testParam.name, async () => {
                // doesn't match file exclusion pattern -> should be included
                barPath = resolve(tmpPath, "bar.txt")

                const dirPath = resolve(tmpPath, "dir")
                await mkdir(dirPath)

                // doesn't match file exclusion pattern in non-excluded dir -> should be included
                dirBarPath = resolve(dirPath, "bar.txt")

                // both match directory exclusion pattern -> should be excluded despite the file exclusion pattern matching
                const excludedSubDirectoryPath = resolve(dirPath, "excluded-subdir")
                await mkdir(excludedSubDirectoryPath)
                excludedSubdirFooPath = resolve(excludedSubDirectoryPath, "foo.txt")
                excludedSubdirBarPath = resolve(excludedSubDirectoryPath, "bar.txt")

                await createFile(barPath)
                await createFile(dirBarPath)
                await createFile(excludedSubdirFooPath)
                await createFile(excludedSubdirBarPath)

                const files = (
                  await handler.getFiles({
                    path: tmpPath,
                    scanRoot: undefined,
                    include: undefined, // when include: [], getFiles() always returns an empty result
                    exclude: [testParam.exclusionBuilder("dir", "excluded-subdir")],
                    log,
                  })
                )
                  .map((p) => p.path)
                  .sort()

                expect(files).to.eql(testParam.expectedFiles())
              })
            }
          })
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

        it("should respect include and exclude filters with sub-directories", async () => {
          const moduleDir = resolve(tmpPath, "module-a")
          const pathA2 = resolve(moduleDir, "no.txt") // should be excluded
          const pathA3 = resolve(moduleDir, "yes.pass") // should be included
          const pathA1 = resolve(moduleDir, "foo.txt") // should be included
          const pathA4 = resolve(moduleDir, "yes.txt") // should pass

          const pathB1 = resolve(moduleDir, "excluded-dir/foo.txt") // should be excluded
          const pathB2 = resolve(moduleDir, "excluded-dir/no.txt") // should be excluded
          const pathB3 = resolve(moduleDir, "excluded-dir/yes.pass") // should be excluded
          const pathB4 = resolve(moduleDir, "excluded-dir/yes.txt") // should be excluded

          const pathC1 = resolve(moduleDir, "included-dir/foo.txt") // should be included
          const pathC2 = resolve(moduleDir, "included-dir/no.txt") // should be excluded
          const pathC3 = resolve(moduleDir, "included-dir/yes.pass") // should be included
          const pathC4 = resolve(moduleDir, "included-dir/yes.txt") // should be included

          await mkdir(moduleDir)
          await createFile(pathA1)
          await createFile(pathA2)
          await createFile(pathA3)
          await createFile(pathA4)
          await createFile(pathB1)
          await createFile(pathB2)
          await createFile(pathB3)
          await createFile(pathB4)
          await createFile(pathC1)
          await createFile(pathC2)
          await createFile(pathC3)
          await createFile(pathC4)

          const files = (
            await handler.getFiles({
              path: tmpPath,
              include: ["module-a/**/*"],
              exclude: ["**/no.txt", "module-a/excluded-dir/**/*"],
              log,
              scanRoot: undefined,
            })
          )
            .map((p) => p.path)
            .sort()

          const expectedFiles = [pathA1, pathA3, pathA4, pathC1, pathC3, pathC4].sort()
          expect(files).to.eql(expectedFiles)
        })
      })
    })

    context("ignore file", () => {
      it("should exclude untracked files that are listed in ignore file", async () => {
        const name = "foo.txt"
        const path = resolve(tmpPath, name)
        await createFile(path)
        await addToIgnore(tmpPath, name)

        const files = (
          await handler.getFiles({
            path: tmpPath,
            scanRoot: undefined,
            exclude: [],
            log,
          })
        ).filter((f) => !f.path.includes(defaultIgnoreFilename))

        expect(files).to.eql([])
      })

      it("should exclude tracked files that are listed in ignore file", async () => {
        const name = "foo.txt"
        const path = resolve(tmpPath, name)
        await createFile(path)
        await addToIgnore(tmpPath, name)

        await git.exec("add", path)
        await git.exec("commit", "-m", "foo")

        const files = (
          await handler.getFiles({
            path: tmpPath,
            scanRoot: undefined,
            exclude: [],
            log,
          })
        ).filter((f) => !f.path.includes(defaultIgnoreFilename))

        expect(files).to.eql([])
      })

      it("should work without ignore files", async () => {
        const path = resolve(tmpPath, "foo.txt")

        await createFile(path)
        await writeFile(path, "my change")
        await git.exec("add", ".")
        await git.exec("commit", "-m", "foo")

        const hash = await getGitHash(git, path)

        const _handler = new GitSubTreeHandler({
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

        const files = (
          await handler.getFiles({
            path: tmpPath,
            scanRoot: undefined,
            exclude: [],
            log,
          })
        ).map((f) => f.path)

        expect(files.sort()).to.eql([filePath, symlinkPath])
      })

      it("should include a relative symlink within the path even when target does not exist", async () => {
        const target = "does-not-exist"
        const symlinkPath = resolve(tmpPath, "symlink")

        await symlink(target, symlinkPath)

        const files = (
          await handler.getFiles({
            path: tmpPath,
            scanRoot: undefined,
            exclude: [],
            log,
          })
        ).map((f) => f.path)

        expect(files.sort()).to.eql([symlinkPath])
      })

      it("should exclude a relative symlink that points outside repo root", async () => {
        const subPath = resolve(tmpPath, "subdir")
        await mkdirp(subPath)

        const _git = new GitCli({ log, cwd: subPath })
        await _git.exec("init")

        const fileName = "foo"
        const filePath = resolve(tmpPath, fileName)
        const symlinkPath = resolve(subPath, "symlink")

        await createFile(filePath)
        await ensureSymlink(join("..", fileName), symlinkPath)

        const files = (
          await handler.getFiles({
            path: subPath,
            scanRoot: undefined,
            exclude: [],
            log,
          })
        ).map((f) => f.path)
        expect(files).to.eql([])
      })

      it("should exclude a relative symlink that points outside repo root even if it does not start with ..", async () => {
        const subPath = resolve(tmpPath, "subdir")
        await mkdirp(subPath)

        const _git = new GitCli({ log, cwd: subPath })
        await _git.exec("init")

        const fileName = "foo"
        const filePath = resolve(tmpPath, fileName)
        const symlinkPath = resolve(subPath, "symlink")

        await createFile(filePath)
        await ensureSymlink(join("hello", "..", "..", fileName), symlinkPath)

        const files = (
          await handler.getFiles({
            path: subPath,
            scanRoot: undefined,
            exclude: [],
            log,
          })
        ).map((f) => f.path)
        expect(files).to.eql([])
      })

      it("should exclude an absolute symlink that points inside the path", async () => {
        const fileName = "foo"
        const filePath = resolve(tmpPath, fileName)
        const symlinkPath = resolve(tmpPath, "symlink")

        await createFile(filePath)
        await symlink(filePath, symlinkPath)

        const files = (
          await handler.getFiles({
            path: tmpPath,
            scanRoot: undefined,
            exclude: [],
            log,
          })
        ).map((f) => f.path)
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

    if (gitScanMode === "repo") {
      context("action at project root that ignores a subdir containing another action", () => {
        let fooPath: string
        let ignoredFilePath: string
        let barPath: string
        let dirFooPath: string
        let dirSubdirFooPath: string
        let dirBarPath: string
        let dirIgnoredFilePath: string
        it("should respect includes/excludes for both the root-level and nested actions", async () => {
          // We don't actually need action configs to test this, but we do need to use the same VCS handler instance
          // for both `getFiles` calls to test the caching behavior of the `repo` scan mode.
          await mkdir(resolve(tmpPath, "dir"))
          fooPath = resolve(tmpPath, "foo.txt")
          ignoredFilePath = resolve(tmpPath, "ignored.txt")
          barPath = resolve(tmpPath, "bar.txt")
          dirFooPath = resolve(tmpPath, "dir", "foo.txt")
          dirSubdirFooPath = resolve(tmpPath, "dir", "subdir", "foo.txt")
          dirBarPath = resolve(tmpPath, "dir", "bar.txt")
          dirIgnoredFilePath = resolve(tmpPath, "dir", "ignored.txt")

          await createFile(fooPath)
          await createFile(ignoredFilePath)
          await createFile(barPath)
          await createFile(dirFooPath)
          await createFile(dirSubdirFooPath)
          await createFile(dirBarPath)
          await createFile(dirIgnoredFilePath)

          const rootFiles = (
            await handler.getFiles({
              path: tmpPath,
              scanRoot: undefined,
              exclude: ["dir", "ignored.txt"],
              log,
            })
          )
            .map((f) => f.path)
            .sort()

          const dirFiles = (
            await handler.getFiles({
              path: resolve(tmpPath, "dir"),
              scanRoot: undefined,
              exclude: ["ignored.txt"],
              log,
            })
          )
            .map((f) => f.path)
            .sort()

          expect(rootFiles).to.eql([barPath, fooPath])
          expect(dirFiles).to.eql([dirBarPath, dirFooPath, dirSubdirFooPath])
        })
      })
    }

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
        submodule = await makeTempDir({ git: true, initialCommit: false })
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
          submoduleB = await makeTempDir({ git: true, initialCommit: false })
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
      expect(await handler.getRepoRoot(log, tmpPath)).to.equal(tmpPath)
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
      const { branch, commitHash } = await handler.getPathInfo(log, tmpPath)
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
      const { branch, commitHash, originUrl } = await handler.getPathInfo(log, tmpPath)
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

      const hash = await hashObject(stats, path)
      expect(hash).to.equal(expected)
    })

    it("should return the same result as `git ls-files` for a file", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)
      await writeFile(path, "iogjeiojgeowigjewoijoeiw")
      const stats = await lstat(path)
      await git.exec("add", path)

      const files = (await git.exec("ls-files", "-s", path))[0]
      const expected = files.split(" ")[1]

      const hash = await hashObject(stats, path)
      expect(hash).to.equal(expected)
    })

    it("should return the same result as `git ls-files` for a symlink", async () => {
      const filePath = resolve(tmpPath, "foo")
      const symlinkPath = resolve(tmpPath, "bar")
      await createFile(filePath)
      await writeFile(filePath, "kfgjdslgjaslj")

      await symlink("foo", symlinkPath)
      await git.exec("add", symlinkPath)

      const stats = await lstat(symlinkPath)

      const files = (await git.exec("ls-files", "-s", symlinkPath))[0]
      const expected = files.split(" ")[1]

      const hash = await hashObject(stats, symlinkPath)
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
      tmpRepoA = await makeTempDir({ git: true, initialCommit: false })
      tmpRepoPathA = await realpath(tmpRepoA.path)

      tmpRepoB = await makeTempDir({ git: true, initialCommit: false })
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

// FIXME-GITREPOHANDLER: revisit these tests and disk-based configs,
//  inspect the scenarios when both include and exclude filters are defined.
const getTreeVersionTests = (gitScanMode: GitScanMode) => {
  const gitHandlerCls = getGitHandlerCls(gitScanMode)
  const projectRoot = getDataDir("test-projects", "include-exclude")

  let garden: Garden
  let log: Log
  let graph: ConfigGraph
  let handler: AbstractGitHandler

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { gitScanMode })
    log = garden.log
    graph = await garden.getConfigGraph({ log, emit: false })

    handler = new gitHandlerCls({
      garden,
      projectRoot: garden.projectRoot,
      gardenDirPath: garden.gardenDirPath,
      ignoreFile: garden.dotIgnoreFile,
      cache: garden.treeCache,
    })
  })

  describe("getTreeVersion", () => {
    context("include and exclude filters", () => {
      it("should respect the include field, if specified", async () => {
        const build = graph.getBuild("a")
        const buildConfig = build.getConfig()

        const version = await handler.getTreeVersion({
          log: garden.log,
          projectName: garden.projectName,
          config: buildConfig,
        })

        expect(version.files).to.eql([
          resolve(dirname(build.configPath()!), "somedir/yes.txt"),
          resolve(dirname(build.configPath()!), "yes.txt"),
        ])
      })

      it("should respect the exclude field, if specified", async () => {
        const build = graph.getBuild("b")
        const buildConfig = build.getConfig()

        const version = await handler.getTreeVersion({
          log: garden.log,
          projectName: garden.projectName,
          config: buildConfig,
        })

        expect(version.files).to.eql([resolve(dirname(build.configPath()!), "yes.txt")])
      })

      it("should respect both include and exclude fields, if specified", async () => {
        const build = graph.getBuild("b")
        const buildConfig = build.getConfig()

        const version = await handler.getTreeVersion({
          log: garden.log,
          projectName: garden.projectName,
          config: buildConfig,
        })

        expect(version.files).to.eql([resolve(dirname(build.configPath()!), "yes.txt")])
      })
    })

    // This group of tests requires cache invalidation after the first scan is completed.
    // Just to be sure that the further local file system modifications will be visible.
    // In the real-life scenarios, we do not expect any concurrent modifications to the local files
    // while Garden is not running in the dev console.
    // In the dev console mode, `GardenInstanceManager` takes responsibility for the cache invalidation.
    // Here, we imitate the repeated Garden command run with just rerun of the repo scan
    // instead of re-creating the whole Garden instance.
    // We just need to reset the caches between the repo scan executions.
    context("modifications to already scanned directories", () => {
      const filesToRemove: string[] = []

      afterEach(async () => {
        for (const f of filesToRemove) {
          await remove(f)
        }
        filesToRemove.length = 0
      })

      it("should update content hash when include is set and there's a change in the included files of an action", async () => {
        // This test project should not have multiple actions.
        // It tests the case when some new files are added to an included directory.
        const _projectRoot = getDataDir("test-projects", "include-files")
        const _garden = await makeTestGarden(_projectRoot)
        const _log = _garden.log
        const _graph = await _garden.getConfigGraph({ emit: false, log: _log })
        const buildConfig = _graph.getBuild("a").getConfig()
        const newFilePathBuildA = join(_garden.projectRoot, "build-a", "somedir", "foo")

        const version1 = await _garden.vcs.getTreeVersion({
          log: _garden.log,
          projectName: _garden.projectName,
          config: buildConfig,
        })

        // write new file to the included dir and clear the cache
        await writeFile(newFilePathBuildA, "abcd")
        filesToRemove.push(newFilePathBuildA)
        _garden.vcs.clearTreeCache()

        const version2 = await _garden.vcs.getTreeVersion({
          log: _garden.log,
          projectName: _garden.projectName,
          config: buildConfig,
          force: true,
        })
        expect(version1.contentHash).to.not.eql(version2.contentHash)
      })

      describe("should not update content hash for Deploy, when there's no change in included files of Build", async () => {
        async function runTest(gardenProjectRoot: string) {
          const _garden = await makeTestGarden(gardenProjectRoot)
          const _log = _garden.log
          const _graph = await _garden.getConfigGraph({ emit: false, log: _log })
          const buildConfig = _graph.getBuild("test-build").getConfig()
          const deployConfig = _graph.getDeploy("test-deploy").getConfig()
          const newFilePath = join(_garden.projectRoot, "foo")

          const buildVersion1 = await _garden.vcs.getTreeVersion({
            log: _garden.log,
            projectName: _garden.projectName,
            config: buildConfig,
          })

          const deployVersion1 = await _garden.vcs.getTreeVersion({
            log: _garden.log,
            projectName: _garden.projectName,
            config: deployConfig,
          })

          // write new file that should not be included and clear the cache
          await writeFile(newFilePath, "abcd")
          filesToRemove.push(newFilePath)
          _garden.vcs.clearTreeCache()

          const buildVersion2 = await _garden.vcs.getTreeVersion({
            log: _garden.log,
            projectName: _garden.projectName,
            config: buildConfig,
            force: true,
          })
          const deployVersion2 = await _garden.vcs.getTreeVersion({
            log: _garden.log,
            projectName: _garden.projectName,
            config: deployConfig,
            force: true,
          })

          expect(buildVersion1).to.eql(buildVersion2)
          expect(deployVersion1.contentHash).to.eql(deployVersion2.contentHash)
        }

        // The different project structure causes different Git repo roots in scanning mode and different caching behavior.

        it("with a flat project/action config", async () => {
          const _projectRoot = getDataDir("test-projects", "config-action-include-flat")
          await runTest(_projectRoot)
        })

        it("with a structured project/action config", async () => {
          const _projectRoot = getDataDir("test-projects", "config-action-include")
          await runTest(_projectRoot)
        })
      })

      it("should update content hash when a file is renamed", async () => {
        const _projectRoot = getDataDir("test-projects", "include-files")
        const _garden = await makeTestGarden(_projectRoot)
        const _log = _garden.log
        const _graph = await _garden.getConfigGraph({ emit: false, log: _log })
        const buildConfig = _graph.getBuild("a").getConfig()
        const newFilePathBuildA = join(_garden.projectRoot, "build-a", "somedir", "foo")
        const renamedFilePathBuildA = join(_garden.projectRoot, "build-a", "somedir", "bar")

        try {
          await writeFile(newFilePathBuildA, "abcd")
          const version1 = await _garden.vcs.getTreeVersion({
            log: _garden.log,
            projectName: _garden.projectName,
            config: buildConfig,
          })

          // rename file foo to bar and clear the cache
          await rename(newFilePathBuildA, renamedFilePathBuildA)
          _garden.vcs.clearTreeCache()

          const version2 = await _garden.vcs.getTreeVersion({
            log: _garden.log,
            projectName: _garden.projectName,
            config: buildConfig,
            force: true,
          })
          expect(version1.contentHash).to.not.eql(version2.contentHash)
        } finally {
          await remove(renamedFilePathBuildA)
        }
      })

      // FIXME: this duplicates the test case above; re-implement it properly
      it.skip("should not update content hash when the parent config's enclosing directory is renamed", async () => {
        const _projectRoot = getDataDir("test-projects", "include-exclude")
        const _garden = await makeTestGarden(_projectRoot)
        const _log = _garden.log
        const _graph = await _garden.getConfigGraph({ emit: false, log: _log })
        const buildConfig = _graph.getBuild("a").getConfig()
        const newFilePathBuildA = join(_garden.projectRoot, "build-a", "somedir", "foo")
        const renamedFilePathBuildA = join(_garden.projectRoot, "build-a", "somedir", "bar")

        try {
          await writeFile(newFilePathBuildA, "abcd")
          const version1 = await _garden.vcs.getTreeVersion({
            log: _garden.log,
            projectName: _garden.projectName,
            config: buildConfig,
          })

          // rename file foo to bar and clear the cache
          await rename(newFilePathBuildA, renamedFilePathBuildA)
          _garden.vcs.clearTreeCache()

          const version2 = await _garden.vcs.getTreeVersion({
            log: _garden.log,
            projectName: _garden.projectName,
            config: buildConfig,
            force: true,
          })
          expect(version1.contentHash).to.eql(version2.contentHash)
        } finally {
          await remove(renamedFilePathBuildA)
        }
      })
    })
  })
}

export function runGitHandlerTests(gitScanMode: GitScanMode) {
  commonGitHandlerTests(gitScanMode)
  getTreeVersionTests(gitScanMode)
}

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
