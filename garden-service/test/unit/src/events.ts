/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { EventBus } from "../../../src/events"
import { expect } from "chai"
import { getLogger } from "../../../src/logger/logger"

describe("EventBus", () => {
  let events: EventBus

  beforeEach(() => {
    events = new EventBus(getLogger().placeholder())
  })

  it("should send+receive events", (done) => {
    events.on("_test", (payload) => {
      expect(payload).to.equal("foo")
      done()
    })
    events.emit("_test", "foo")
  })

  describe("onAny", () => {
    it("should add listener for any supported event", (done) => {
      events.onAny((name, payload) => {
        expect(name).to.equal("_test")
        expect(payload).to.equal("foo")
        done()
      })
      events.emit("_test", "foo")
    })
  })

  describe("once", () => {
    it("should add a listener that only gets called once", (done) => {
      events.once("_test", (payload) => {
        expect(payload).to.equal("foo")
        done()
      })
      events.emit("_test", "foo")
      events.emit("_test", "bar")
    })
  })
})
