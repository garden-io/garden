/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

describe("ResolveActionTask", () => {
  describe("resolveStatusDependencies", () => {
    it("returns an empty list", async () => {
      throw "TODO"
    })
  })

  describe("resolveProcessDependencies", () => {
    it("returns nothing if no dependencies are defined or found", async () => {
      throw "TODO"
    })

    it("returns execute task for dependency with needsExecutedOutputs=true", async () => {
      throw "TODO"
    })

    it("returns resolve task for dependency with needsStaticOutputs=true", async () => {
      throw "TODO"
    })

    it("returns resolve task for dependency with explicit=true", async () => {
      throw "TODO"
    })

    it("returns no task for dependency with none of the above flags set to true", async () => {
      throw "TODO"
    })
  })

  describe("process", () => {
    it("resolves an action", async () => {
      throw "TODO"
    })

    it("resolves action variables", async () => {
      throw "TODO"
    })

    it("correctly merges action, project and CLI variables", async () => {
      throw "TODO"
    })

    it("throws if spec is invalid after resolution", async () => {
      throw "TODO"
    })

    it("resolves and validates static outputs", async () => {
      throw "TODO"
    })

    it("throws if static outputs don't match schema", async () => {
      throw "TODO"
    })

    it("applies default values from schemas to the resolved action spec", async () => {
      throw "TODO"
    })
  })
})
