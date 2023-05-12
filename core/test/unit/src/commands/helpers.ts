/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { validateActionSearchResults } from "../../../../src/commands/helpers"
import { getRootLogger } from "../../../../src/logger/logger"
import { initTestLogger } from "../../../helpers"
import { expectError } from "../../../helpers"

describe("command helpers", () => {
  initTestLogger()
  const logger = getRootLogger()

  describe("validateActionSearchResults", () => {
    it("should throw if an action by exact name was not found", async () => {
      await expectError(
        () =>
          validateActionSearchResults({
            actionKind: "Build",
            actions: [{ name: "action-1" }],
            log: logger.createLog(),
            names: ["foo"],
            errData: {},
          }),
        { contains: 'action "foo" was not found' }
      )
    })

    it("should throw if an action by exact name was not found even if wildcards are specified", async () => {
      await expectError(
        () =>
          validateActionSearchResults({
            actionKind: "Build",
            actions: [{ name: "action-1" }],
            log: logger.createLog(),
            names: ["foo", "foo*"],
            errData: {},
          }),
        { contains: 'action "foo" was not found' }
      )
    })

    it("should contain action kind in error message", async () => {
      await expectError(
        () =>
          validateActionSearchResults({
            actionKind: "Build",
            actions: [{ name: "action-1" }],
            log: logger.createLog(),
            names: ["foo"],
            errData: {},
          }),
        { contains: "Build action" }
      )
    })

    it("should throw a warning if no actions are found using wildcards", async () => {
      await expectError(
        () =>
          validateActionSearchResults({
            actionKind: "Build",
            actions: [],
            log: logger.createLog(),
            names: ["foo*"],
            errData: {},
          }),
        { contains: "No Build actions were found" }
      )
    })

    it("should contain arguments in error message", async () => {
      await expectError(
        () =>
          validateActionSearchResults({
            actionKind: "Build",
            actions: [],
            log: logger.createLog(),
            names: ["foo*"],
            errData: {},
          }),
        { contains: "(matching argument(s) 'foo*')" }
      )
    })
  })
})
