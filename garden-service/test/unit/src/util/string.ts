/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { tailString, stripQuotes } from "../../../../src/util/string"

describe("tailString", () => {
  it("should return string unchanged if it's shorter than maxLength", () => {
    const str = "123456789"
    expect(tailString(str, 10)).to.equal(str)
  })

  it("should trim off first bytes if string is longer than maxLength", () => {
    const str = "1234567890"
    expect(tailString(str, 5)).to.equal("67890")
  })

  it("should trim until next newline if string is longer than maxLength and nextLine=true", () => {
    const str = "1234567\n890"
    expect(tailString(str, 5, true)).to.equal("890")
  })

  it("should trim the last line if it is longer than maxLength and nextLine=true", () => {
    const str = "123\n4567890"
    expect(tailString(str, 5, true)).to.equal("67890")
  })
})

describe("stripQuotes", () => {
  it("should strip double quotes from string", () => {
    expect(stripQuotes('"test"')).to.equal("test")
  })

  it("should strip single quotes from string", () => {
    expect(stripQuotes("'test'")).to.equal("test")
  })

  it("should pass through unquoted string", () => {
    expect(stripQuotes("test")).to.equal("test")
  })

  it("should not strip mismatched quotes", () => {
    expect(stripQuotes("'test\"")).to.equal("'test\"")
    expect(stripQuotes("\"test'")).to.equal("\"test'")
  })
})
