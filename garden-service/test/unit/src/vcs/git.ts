import { expect } from "chai"
import * as tmp from "tmp-promise"
import { createFile, writeFile, realpath, mkdir } from "fs-extra"
import { join, resolve } from "path"

import { expectError } from "../../../helpers"
import { getCommitIdFromRefList, parseGitUrl, GitHandler } from "../../../../src/vcs/git"

describe("GitHandler", () => {
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string
  let git
  let handler: GitHandler

  beforeEach(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    tmpPath = await realpath(tmpDir.path)
    handler = new GitHandler(tmpPath)
    git = (<any>handler).gitCli(tmpPath)
    await git("init")
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  describe("getFiles", () => {
    it("should work with no commits in repo", async () => {
      expect(await handler.getFiles(tmpPath)).to.eql([])
    })

    it("should return tracked files as absolute paths with hash", async () => {
      const path = resolve(tmpPath, "foo.txt")

      await createFile(path)
      await writeFile(path, "my change")
      await git("add", ".")
      await git("commit", "-m", "foo")

      const hash = "6e1ab2d7d26c1c66f27fea8c136e13c914e3f137"

      expect(await handler.getFiles(tmpPath)).to.eql([
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

      expect(await handler.getFiles(tmpPath)).to.eql([
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
          const beforeHash = (await handler.getFiles(dirPath))[0].hash

          await writeFile(filePath, "ch-ch-ch-ch-changes")
          const afterHash = (await handler.getFiles(dirPath))[0].hash

          expect(beforeHash).to.not.eql(afterHash)
        })

        it("should return untracked files as absolute paths with hash", async () => {
          const dirPath = pathFn(tmpPath)
          await createFile(join(dirPath, "foo.txt"))
          const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"

          expect(await handler.getFiles(dirPath)).to.eql([
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

      expect(await handler.getFiles(dirPath)).to.eql([
        { path: resolve(dirPath, "file.txt"), hash },
      ])
    })

    it("should filter out files that don't match the include filter, if specified", async () => {
      const path = resolve(tmpPath, "foo.txt")
      await createFile(path)

      expect(await handler.getFiles(tmpPath, [])).to.eql([])
    })

    it("should include files that match the include filter, if specified", async () => {
      const path = resolve(tmpPath, "foo.txt")
      const hash = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
      await createFile(path)

      expect(await handler.getFiles(tmpPath, ["foo.*"])).to.eql([
        { path, hash },
      ])
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
