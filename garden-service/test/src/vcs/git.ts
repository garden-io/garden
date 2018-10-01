import { expect } from "chai"
import dedent = require("dedent")

import { expectError } from "../../helpers"
import { getCommitIdFromRefList, parseGitUrl } from "../../../src/vcs/git"

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
