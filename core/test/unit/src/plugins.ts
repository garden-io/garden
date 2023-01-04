/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

describe("loadAndResolvePlugins", () => {
  // TODO-G2: not implemented
  // it("throws if action type staticOutputsSchema and runtimeOutputsSchema have overlapping keys", async () => {
  //   throw "TODO"
  // })
  // it("throws if action type staticOutputsSchema allows unknown keys", async () => {
  //   throw "TODO"
  // })

  it("inherits created action type from base plugin", async () => {
    throw "TODO"
  })

  it("throws if redefining an action type created in base", async () => {
    throw "TODO"
  })

  it("inherits action type extension from base plugin", async () => {
    throw "TODO"
  })

  context("base is not configured", () => {
    it("pulls created action type from base", async () => {
      throw "TODO"
    })

    it("pulls action type extension from base if not defined in plugin", async () => {
      throw "TODO"
    })

    it("coalesces action type extension from base if both define one", async () => {
      throw "TODO"
    })
  })
})
