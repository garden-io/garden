/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { range } from "lodash-es"
import { EventBus } from "../../../src/events/events.js"
import { expect } from "chai"

describe("EventBus", () => {
  let events: EventBus
  const $context = { sessionId: "123456" }

  beforeEach(() => {
    events = new EventBus($context)
  })

  it("should send+receive events", (done) => {
    events.on("_test", (payload) => {
      expect(payload).to.eql({ $context, msg: "foo" })
      done()
    })
    events.emit("_test", { msg: "foo" })
  })

  describe("onAny", () => {
    it("should add listener for any supported event", (done) => {
      events.onAny((name, payload) => {
        expect(name).to.equal("_test")
        expect(payload).to.eql({ $context, msg: "foo" })
        done()
      })
      events.emit("_test", { msg: "foo" })
    })
  })

  describe("once", () => {
    it("should add a listener that only gets called once", (done) => {
      events.once("_test", (payload) => {
        expect(payload).to.eql({ $context, msg: "foo" })
        done()
      })
      events.emit("_test", { msg: "foo" })
      events.emit("_test", { msg: "bar" })
    })
  })

  describe("onKey", () => {
    it("should add a listener under the specified key", (done) => {
      const key = "gandalf"
      events.onKey(
        "_test",
        (payload) => {
          expect(payload).to.eql({ $context, msg: "foo" })
          expect(events["keyIndex"][key]["_test"].length).to.eql(1)
          done()
        },
        key
      )
      events.emit("_test", { msg: "foo" })
    })
  })

  describe("offKey", () => {
    it("should remove all listeners with the specified key and name", () => {
      const key = "gandalf"
      const otherKey = "blob"
      for (const _i of range(3)) {
        events.onKey("_test", () => {}, key)
        events.onKey("_restart", () => {}, key)

        events.onKey("_test", () => {}, otherKey)
        events.onKey("_restart", () => {}, otherKey)
      }
      expect(events.listenerCount()).to.eql(12)
      events.offKey("_test", key)
      expect(events.listenerCount()).to.eql(9)
      expect(events["keyIndex"][key]["_test"]).to.be.undefined

      // We expect the index for other key + name combinations to be the same.
      expect(events["keyIndex"][key]["_restart"].length).to.eql(3)
      expect(events["keyIndex"][otherKey]["_test"].length).to.eql(3)
      expect(events["keyIndex"][otherKey]["_restart"].length).to.eql(3)
    })
  })

  describe("clearKey", () => {
    it("should remove all listeners with the specified key", () => {
      const key = "gandalf"
      const otherKey = "blob"
      for (const _i of range(3)) {
        events.onKey("_test", () => {}, key)
        events.onKey("_restart", () => {}, key)

        events.onKey("_test", () => {}, otherKey)
        events.onKey("_restart", () => {}, otherKey)
      }
      expect(events.listenerCount()).to.eql(12)
      events.clearKey(key)
      expect(events.listenerCount()).to.eql(6)
      expect(events["keyIndex"][key]).to.be.undefined

      // We expect the index for the other key to be the same.
      expect(events["keyIndex"][otherKey]["_test"].length).to.eql(3)
      expect(events["keyIndex"][otherKey]["_restart"].length).to.eql(3)
    })
  })
})
