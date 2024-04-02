/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { PathHashCache } from "../../../../src/vcs/path-hash-cache.js"
import { makeTempDir } from "../../../../src/util/fs.js"
import type { TempDirectory } from "../../../../src/util/fs.js"

describe("PathHashCache", () => {
  let cache: PathHashCache
  let tmpDir: TempDirectory

  beforeEach(async () => {
    tmpDir = await makeTempDir()
    cache = await PathHashCache.forGardenProject(tmpDir.path)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  it("set/store/get", async () => {
    const path = "./file.txt"
    const hash = "00000000"
    cache.setPathHash(path, hash)
    expect(cache.getPathHash(path)!).to.eql(hash)

    await cache.store("12345678")
    cache = await PathHashCache.forGardenProject(tmpDir.path)
    expect(cache.getPathHash(path)!).to.eql(hash)
  })
})
