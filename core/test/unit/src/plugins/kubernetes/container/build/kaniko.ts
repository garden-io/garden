/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  kanikoBuildFailed,
  getKanikoFlags,
  DEFAULT_KANIKO_FLAGS,
} from "../../../../../../../src/plugins/kubernetes/container/build/kaniko"
import { expect } from "chai"

describe("kaniko build", () => {
  it("should return as successful when immutable tag already exists in destination", () => {
    const errorMessage = `error pushing image: failed to push to destination dockerhub.com/garden/backend:v-1234567: TAG_INVALID: The image tag "v-1234567" already exists in the "garden/backend" repository and cannot be overwritten because the repository is immutable.`

    expect(
      kanikoBuildFailed({
        moduleName: "foo",
        command: [],
        version: "",
        startedAt: new Date(),
        completedAt: new Date(),
        success: false,
        log: errorMessage,
      })
    ).to.be.false
  })

  it("should return as failure when other error messages are present", () => {
    const errorMessage = `error uploading layer to cache: failed to push to destination dockerhub.com/garden/backend:v-1234567: TAG_INVALID: The image tag "v-1234567" already exists in the "garden / backend" repository and cannot be overwritten because the repository is immutable.`

    expect(
      kanikoBuildFailed({
        moduleName: "foo",
        command: [],
        version: "",
        startedAt: new Date(),
        completedAt: new Date(),
        success: false,
        log: errorMessage,
      })
    ).to.be.true
  })

  it("should return as success when the build succeeded", () => {
    expect(
      kanikoBuildFailed({
        moduleName: "foo",
        command: [],
        version: "",
        startedAt: new Date(),
        completedAt: new Date(),
        success: true,
        log: "",
      })
    ).to.be.false
  })

  describe("getKanikoFlags", () => {
    it("should only keep all declarations of each flag + the defaults", () => {
      expect(getKanikoFlags(["--here=first", "--here=again"])).to.deep.equal([
        "--here=first",
        "--here=again",
        "--cache=true",
      ])
    })
    it("should allow overriding default flags", () => {
      const overridenFlags = DEFAULT_KANIKO_FLAGS.map((f) => f + "cat")
      expect(getKanikoFlags(overridenFlags)).to.deep.equal(overridenFlags)
    })

    it("should allow toggles", () => {
      expect(getKanikoFlags(["--myToggle"])).to.deep.equal(["--myToggle", "--cache=true"])
    })

    it("should throw if a flag is malformed", () => {
      expect(() => getKanikoFlags(["--here=first", "-my-flag"])).to.throw(/Invalid format for a kaniko flag/)
    })

    it("should return --cache=true when extraFlags is empty", () => {
      expect(getKanikoFlags([])).to.deep.equal(DEFAULT_KANIKO_FLAGS)
      expect(getKanikoFlags()).to.deep.equal(DEFAULT_KANIKO_FLAGS)
    })

    it("should merge multiple flags if top level flags are provided", () => {
      expect(getKanikoFlags(["--myToggle"], ["--cat=fast"])).to.deep.equal(["--myToggle", "--cat=fast", "--cache=true"])
    })

    it("should make leftmost flags win", () => {
      expect(getKanikoFlags(["--cat=slow"], ["--cat=fast"])).to.deep.equal(["--cat=slow", "--cache=true"])
    })
  })
})
