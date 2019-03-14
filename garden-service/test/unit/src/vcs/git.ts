import { expect } from "chai"
import dedent = require("dedent")
import * as tmp from "tmp-promise"
import { createFile, writeFile, realpath } from "fs-extra"
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

  describe("getDirtyFiles", () => {
    it("should work with no commits in repo", async () => {
      expect(await handler.getDirtyFiles(tmpPath)).to.eql([])
    })

    it("should return modified files as absolute paths", async () => {
      const path = resolve(tmpPath, "foo.txt")

      await createFile(path)
      await git("add", ".")
      await git("commit", "-m", "foo")

      expect(await handler.getDirtyFiles(tmpPath)).to.eql([])

      await writeFile(path, "my change")

      expect(await handler.getDirtyFiles(tmpPath)).to.eql([path])
    })

    it("should return untracked files as absolute paths", async () => {
      await createFile(join(tmpPath, "foo.txt"))

      expect(await handler.getDirtyFiles(tmpPath)).to.eql([
        resolve(tmpPath, "foo.txt"),
      ])
    })
  })
})

describe("git", () => {
  describe("getCommitIdFromRefList", () => {
    it("should get the commit id from a list of commit ids and refs", () => {
      const refList = dedent`
      abcde	ref/heads/master
      1234	ref/heads/master
      foobar	ref/heads/master
      `
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
    it("should get the commit id from a list of commit ids without refs", () => {
      const refList = dedent`
      abcde
      1234	ref/heads/master
      foobar	ref/heads/master
      `
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
    it("should get the commit id from a single commit id / ref pair", () => {
      const refList = "abcde	ref/heads/master"
      expect(getCommitIdFromRefList(refList)).to.equal("abcde")
    })
    it("should get the commit id from single commit id without a ref", () => {
      const refList = "abcde"
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
