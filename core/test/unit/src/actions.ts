/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

describe("actionConfigsToGraph", () => {
  it("resolves actions in groups", async () => {
    throw "TODO"
  })

  it("resolves a Build action", async () => {
    throw "TODO"
  })

  it("resolves a Deploy action", async () => {
    throw "TODO"
  })

  it("resolves a Run action", async () => {
    throw "TODO"
  })

  it("resolves a Test action", async () => {
    throw "TODO"
  })

  it("adds dependencies from copyFrom on Build actions", async () => {
    throw "TODO"
  })

  it("adds build reference on runtime actions as dependency", async () => {
    throw "TODO"
  })

  it("adds implicit dependencies from template references in config", async () => {
    throw "TODO"
  })

  it("flags implicit dependency as needing execution if a non-static output is referenced", async () => {
    throw "TODO"
  })

  it("correctly sets compatibleTypes for an action", async () => {
    throw "TODO"
  })

  it("resolves variables for the action", async () => {
    throw "TODO"
  })

  it("resolves varfiles for the action", async () => {
    throw "TODO"
  })

  it("throws if an unknown action kind is given", async () => {
    throw "TODO"
  })

  it("throws if two actions with same key are given", async () => {
    throw "TODO"
  })
})
