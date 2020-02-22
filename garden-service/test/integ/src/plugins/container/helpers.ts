/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"
import { expect } from "chai"
import { containerHelpers as helpers, dockerBin } from "../../../../../src/plugins/container/helpers"
import { getLogger } from "../../../../../src/logger/logger"

describe("containerHelpers", () => {
  describe("getDockerVersion", () => {
    it("should get the current docker version", async () => {
      const { client, server } = await helpers.getDockerVersion()
      expect(client).to.be.ok
      expect(server).to.be.ok
    })
  })

  describe("getDockerCliPath", () => {
    const orgEnv = { ...process.env }
    const log = getLogger().placeholder()

    afterEach(() => {
      process.env = orgEnv
    })

    it("should fetch the docker CLI if one is not installed", async () => {
      process.env.PATH = ""
      const cliPath = await helpers.getDockerCliPath(log)
      const binPath = await dockerBin.getPath(log)
      expect(cliPath).to.equal(binPath)
    })

    // Note: These assume the test environment has the docker CLI
    it("should use the docker CLI on PATH if it is up-to-date", async () => {
      td.replace(helpers, "getDockerVersion", async () => ({ client: "99.99", server: "99.99" }))
      const cliPath = await helpers.getDockerCliPath(log)
      expect(cliPath).to.equal("docker")
    })

    it("should fetch the docker CLI if an old one is currently on the PATH", async () => {
      td.replace(helpers, "getDockerVersion", async () => ({ client: "17.03", server: "99.99" }))
      const cliPath = await helpers.getDockerCliPath(log)
      const binPath = await dockerBin.getPath(log)
      expect(cliPath).to.equal(binPath)
    })
  })
})
