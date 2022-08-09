/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { describe } from "mocha"
import { expectError } from "../../../../src/util/testing"
import { validateInstall } from "../../../../src/util/validateInstall"
import { gitVersionRegex } from "../../../../src/vcs/vcs"

describe("validateInstall", () => {
  it("should validate a binary version", async () => {
    await validateInstall({
      minVersion: "1.0.0",
      name: "git",
      versionCommand: { cmd: "git", args: ["--version"] },
      versionRegex: gitVersionRegex,
    })
  })
  it("should throw if a version is too old", async () => {
    await expectError(
      () =>
        validateInstall({
          minVersion: "100.0.0", // <--
          name: "git",
          versionCommand: { cmd: "git", args: ["--version"] },
          versionRegex: gitVersionRegex,
        }),
      (err) => expect(err.message).to.include("version is too old")
    )
  })
  it("should throw if binary is not installed", async () => {
    await expectError(
      () =>
        validateInstall({
          minVersion: "1.0.0",
          name: "non existing thing",
          versionCommand: { cmd: "this-binary-does-not-exist", args: ["--version"] }, // <--
          versionRegex: gitVersionRegex,
        }),
      (err) => expect(err.message).to.include("is installed and on your PATH")
    )
  })
  it("should include name in error message", async () => {
    await expectError(
      () =>
        validateInstall({
          minVersion: "1.0.0",
          name: "name-of-the-thing",
          versionCommand: { cmd: "this-binary-does-not-exist", args: ["--version"] }, // <--
          versionRegex: gitVersionRegex,
        }),
      (err) => expect(err.message).to.include("Could not find name-of-the-thing binary.")
    )
  })
})
