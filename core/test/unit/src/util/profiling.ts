/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Profiler, Profile, profile, profileAsync } from "../../../../src/util/profiling.js"
import { expect } from "chai"

describe("profiling", () => {
  let profiler: Profiler

  beforeEach(() => {
    profiler = new Profiler(true)
  })

  describe("Profile", () => {
    it("should collect timing on a basic class method", () => {
      @Profile(profiler)
      class TestClass {
        someMethod() {
          return 123
        }
      }

      const instance = new TestClass()

      const value = instance.someMethod()
      expect(value).to.equal(123)

      const profiling = profiler.getData()
      const invocations = profiling["TestClass#someMethod"]

      expect(invocations).to.exist
      expect(invocations.length).to.equal(1)
    })

    it("should collect timing on an async class method", async () => {
      @Profile(profiler)
      class TestClass {
        async someMethod() {
          return 123
        }
      }

      const instance = new TestClass()

      const value = await instance.someMethod()
      expect(value).to.equal(123)

      const profiling = profiler.getData()
      const invocations = profiling["TestClass#someMethod"]

      expect(invocations).to.exist
      expect(invocations.length).to.equal(1)
    })
  })

  describe("profile", () => {
    it("should collect timing on a function call", () => {
      const func = profile(function fn() {
        return 123
      }, profiler)

      const value = func()
      expect(value).to.equal(123)

      const profiling = profiler.getData()
      const invocations = profiling["fn"]

      expect(invocations).to.exist
      expect(invocations.length).to.equal(1)
    })
  })

  describe("profile", () => {
    it("should collect timing on an async function call", async () => {
      const func = profileAsync(async function fn() {
        return 123
      }, profiler)

      const value = await func()
      expect(value).to.equal(123)

      const profiling = profiler.getData()
      const invocations = profiling["fn"]

      expect(invocations).to.exist
      expect(invocations.length).to.equal(1)
    })
  })

  describe("reportProfiling", () => {
    it("should return a profiling summary", async () => {
      @Profile(profiler)
      class TestClass {
        someMethod() {
          return 123
        }
        async asyncMethod() {
          return 123
        }
      }

      const instance = new TestClass()

      for (let i = 0; i < 10; i++) {
        instance.someMethod()
        await instance.asyncMethod()
      }

      profiler.report()
    })
  })
})
