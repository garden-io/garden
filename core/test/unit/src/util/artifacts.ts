/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import tmp from "tmp-promise"
import fsExtra from "fs-extra"
const { realpath, writeFile } = fsExtra
import normalizePath from "normalize-path"
import { join } from "path"
import { getArtifactFileList, getArtifactKey } from "../../../../src/util/artifacts.js"
import { getRootLogger } from "../../../../src/logger/logger.js"

describe("artifacts", () => {
  describe("getArtifactKey", () => {
    it("should return the artifact key with format type.name.version", () => {
      expect(getArtifactKey("run", "task-name", "v-123456")).to.equal("run.task-name.v-123456")
      expect(getArtifactKey("test", "test-name", "v-123456")).to.equal("test.test-name.v-123456")
    })
  })

  describe("getArtifactFileList", () => {
    let tmpDir: tmp.DirectoryResult
    let artifactsPath: string
    const log = getRootLogger().createLog()

    beforeEach(async () => {
      tmpDir = await tmp.dir({ unsafeCleanup: true })
      artifactsPath = normalizePath(await realpath(tmpDir.path))
    })

    afterEach(async () => {
      await tmpDir.cleanup()
    })

    it("should read the artifact metadata file and return the files", async () => {
      const key = "task.foo-bar.v-12345"
      const metadataPath = join(artifactsPath, `.metadata.${key}.json`)
      const metadata = {
        key,
        files: ["/foo/bar.txt", "/bas/bar.txt"],
      }
      await writeFile(metadataPath, JSON.stringify(metadata))

      const files = await getArtifactFileList({
        key,
        artifactsPath,
        log,
      })

      expect(files).to.eql(["/foo/bar.txt", "/bas/bar.txt"])
    })
    it("should return an empty list if the metadata file is missing", async () => {
      const files = await getArtifactFileList({
        key: "",
        artifactsPath,
        log,
      })
      expect(files).to.eql([])
    })
    it("should return an empty list if it can't parse the metadata file", async () => {
      const key = "task.foo-bar.v-12345"
      const metadataPath = join(artifactsPath, `.metadata.${key}.json`)
      await writeFile(metadataPath, "BAD JSON")

      const files = await getArtifactFileList({
        key,
        artifactsPath,
        log,
      })
      expect(files).to.eql([])
    })
  })
})
