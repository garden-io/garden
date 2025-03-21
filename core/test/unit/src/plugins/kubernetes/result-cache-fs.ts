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
import {
  FILESYSTEM_CACHE_EXPIRY_DAYS,
  SimpleLocalFileSystemCacheStorage,
} from "../../../../../src/plugins/kubernetes/results-cache-fs.js"
import type { ResultContainer } from "../../../../../src/plugins/kubernetes/results-cache-base.js"
import { currentResultSchemaVersion } from "../../../../../src/plugins/kubernetes/results-cache-base.js"
import type { JsonObject } from "type-fest"

type Payload = {
  pos: number
  data: string
}

function makePayload(pos: number): Payload {
  return { pos, data: `data${pos}` }
}

function makeExpectedValue(payload: Payload): ResultContainer<JsonObject> {
  return {
    found: true,
    result: payload,
  }
}

const notFound: ResultContainer<JsonObject> = {
  found: false,
  notFoundReason: "Not found",
}

describe("SimpleLocalFileSystemCacheStorage", () => {
  let tmpDir: DirectoryResult
  let cache: SimpleLocalFileSystemCacheStorage<Payload>

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    const tmpDirPath = tmpDir.path
    const cachePath = join(tmpDirPath, ".fs-cache")
    cache = new SimpleLocalFileSystemCacheStorage<Payload>({
      cacheDir: cachePath,
      schemaVersion: currentResultSchemaVersion,
      cacheExpiryDays: FILESYSTEM_CACHE_EXPIRY_DAYS,
    })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  it("should return the notFoundReason if no value found for key", async () => {
    const key = "this-key-does-not-exist"
    const value = await cache.get(key)
    expect(value).to.eql(notFound)
  })

  it("should store value and return it", async () => {
    const pos = 1
    const key = `file-${pos}`
    const payload = makePayload(pos)
    const expectedValue = makeExpectedValue(payload)

    const storedValue = await cache.put(key, payload)
    expect(storedValue).to.be.not.undefined
    expect(storedValue).to.eql(payload)

    const returnedValue = await cache.get(key)
    expect(returnedValue).to.be.not.undefined
    expect(returnedValue).to.eql(expectedValue)
  })

  it("should delete the value by key", async () => {
    const pos = 1
    const key = `file-${pos}`
    const payload = makePayload(pos)
    const expectedValue = makeExpectedValue(payload)

    const storedValue = await cache.put(key, payload)
    expect(storedValue).to.be.not.undefined
    expect(storedValue).to.eql(payload)

    const returnedValue = await cache.get(key)
    expect(returnedValue).to.be.not.undefined
    expect(returnedValue).to.eql(expectedValue)

    await cache.remove(key)

    const valueAgain = await cache.get(key)
    expect(valueAgain).to.eql(notFound)

    // no error should be thrown if delete by non-existing key
    await cache.remove(key)
  })

  it("should overwrite the existing value", async () => {
    const key = `filename`
    const payload1 = makePayload(1)
    const payload2 = makePayload(2)

    await cache.put(key, payload1)
    await cache.put(key, payload2)

    const cachedValue = await cache.get(key)
    expect(cachedValue).to.be.not.undefined
    const expectedValue2 = makeExpectedValue(payload2)
    expect(cachedValue).to.eql(expectedValue2)
  })
})
