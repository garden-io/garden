/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { SortedStreamIntersection } from "../../../../src/util/streams.js"
import { expect } from "chai"
import { splitStream } from "../../../../src/util/streams.js"
import { expectFuzzyMatch } from "../../../helpers.js"

describe("SortedStreamIntersection", () => {
  const comparator = (a: Buffer, b: Buffer) => a.toString().localeCompare(b.toString())

  it("returns all values if passed a single stream", (done) => {
    const a = splitStream()
    const stream = new SortedStreamIntersection([a], comparator)
    const output: string[] = []
    stream.on("data", (v) => output.push(v.toString()))
    stream.on("end", () => {
      expect(output).to.eql(["a", "b", "c"])
      done()
    })
    a.write("a\nb\nc\n")
    a.end()
  })

  it("returns all values if passed identical streams", (done) => {
    const a = splitStream()
    const b = splitStream()
    const stream = new SortedStreamIntersection([a, b], comparator)
    const output: string[] = []
    stream.on("data", (v) => output.push(v.toString()))
    stream.on("end", () => {
      expect(output).to.eql(["a", "b", "c"])
      done()
    })
    a.write("a\nb\n")
    b.write("a\n")
    a.write("c\n")
    b.write("b\nc\n")
    a.end()
    b.end()
  })

  it("returns the intersection of two streams", (done) => {
    const a = splitStream()
    const b = splitStream()

    const stream = new SortedStreamIntersection([a, b], comparator)
    const output: string[] = []
    stream.on("data", (v) => output.push(v.toString()))
    stream.on("end", () => {
      expect(output).to.eql(["b", "c"])
      done()
    })

    a.write("a\nb\n")
    b.write("b\n")
    a.write("c\n")
    b.write("c\nd\n")
    a.end()
    b.end()
  })

  it("returns the intersection of three streams", (done) => {
    const a = splitStream()
    const b = splitStream()
    const c = splitStream()

    const stream = new SortedStreamIntersection([a, b, c], comparator)
    const output: string[] = []
    stream.on("data", (v) => output.push(v.toString()))
    stream.on("end", () => {
      expect(output).to.eql(["c", "d"])
      done()
    })

    a.write("a\nb\nc\nd\n")
    b.write("b\nc\nd\ne\n")
    c.write("c\nd\ne\nf\n")
    a.end()
    b.end()
    c.end()
  })

  it("throws if passed a non-sorted stream", (done) => {
    const a = splitStream()
    const b = splitStream()

    const stream = new SortedStreamIntersection([a, b], comparator)
    stream.on("data", () => {})
    stream.on("error", (err) => {
      expectFuzzyMatch(err.message, "Received unordered stream")
      done()
    })

    a.write("a\nb\nc\nd\ne\n")
    b.write("b\nd\nc\n")
    a.end()
    b.end()
  })
})
