/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { kanikoBuildFailed } from "../../../../../../src/plugins/kubernetes/container/build"
import { expect } from "chai"

describe("kaniko build", () => {
  it("should return as successful when immutable tag already exists in destination", () => {
    const errorMessage = `error pushing image: failed to push to destination dockerhub.com/garden/backend:v-1234567: TAG_INVALID: The image tag 'v-1234567' already exists in the 'garden/backend' repository and cannot be overwritten because the repository is immutable.`

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
    const errorMessage = "error pushing"

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
})
