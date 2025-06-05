/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { containerHelpers as helpers } from "../../../../../src/plugins/container/helpers.js"

describe("containerHelpers", () => {
  describe("getDockerVersion", () => {
    it("should get the current docker version", async () => {
      const { client, server } = await helpers.getDockerVersion()
      expect(client).to.be.ok
      expect(server).to.be.ok
    })
  })
})
