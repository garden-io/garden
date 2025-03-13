/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"

import type { DirectoryResult } from "tmp-promise"
import tmp from "tmp-promise"
import { SimpleFileSystemCache } from "../../../../../src/plugins/kubernetes/results-cache-fs.js"

interface Payload {
  pos: number
  data: string
}

function makePayload(pos: number): Payload {
  return { pos, data: `data${pos}` }
}

describe("SimpleFileSystemCache", () => {
  let tmpDir: DirectoryResult
  let cache: SimpleFileSystemCache<Payload>

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    const tmpDirPath = tmpDir.path
    const cachePath = join(tmpDirPath, ".fs-cache")
    cache = new SimpleFileSystemCache<Payload>(cachePath)
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  beforeEach(async () => {
    await cache.clear()
  })

  it("should return undefined if no value found for key", async () => {
    const key = "this-key-does-not-exist"
    const value = await cache.get(key)
    expect(value).to.be.undefined
  })

  it("should return undefined if no value found for key", async () => {
    const key = "this-key-does-not-exist"
    const value = await cache.get(key)
    expect(value).to.be.undefined
  })

  it("should store value and return it", async () => {
    const pos = 1
    const key = `file-${pos}`
    const value = makePayload(pos)

    const storedValue = await cache.put(key, value)
    expect(storedValue).to.be.not.undefined
    expect(storedValue).to.eql(value)

    const returnedValue = await cache.get(key)
    expect(returnedValue).to.be.not.undefined
    expect(returnedValue).to.eql(value)
  })

  it("should delete the value by key", async () => {
    const pos = 1
    const key = `file-${pos}`
    const value = makePayload(pos)

    const storedValue = await cache.put(key, value)
    expect(storedValue).to.be.not.undefined
    expect(storedValue).to.eql(value)

    let returnedValue = await cache.get(key)
    expect(returnedValue).to.be.not.undefined
    expect(returnedValue).to.eql(value)

    await cache.remove(key)

    returnedValue = await cache.get(key)
    expect(returnedValue).to.be.undefined

    // no error should be thrown if delete by non-existing key
    await cache.remove(key)
  })

  it("should overwrite the existing value", async () => {
    const key = `filename`
    const value1 = makePayload(1)
    const value2 = makePayload(2)

    await cache.put(key, value1)
    await cache.put(key, value2)

    const cachedValue = await cache.get(key)
    expect(cachedValue).to.be.not.undefined
    expect(cachedValue).to.eql(value2)
  })
})
