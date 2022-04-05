/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import nock from "nock"
import { SecretsCreateCommand } from "../../../../../../src/commands/cloud/secrets/secrets-create"


import { makeTestGardenA, TestGarden, enableAnalytics, getDataDir, makeTestGarden } from "../../../../../helpers"

describe("AnalyticsHandler", () => {
  const remoteOriginUrl = "git@github.com:garden-io/garden.git"
  const host = "https://api.segment.io"
  const scope = nock(host)
  let garden: TestGarden

  beforeEach(async () => {
    garden = await makeTestGardenA()
  })

  afterEach(async () => {
  })

  after(async () => {
    nock.cleanAll()
  })

  describe("SecretsCreateCommand", () => {
    it("should do things", async () => {
      const command = new SecretsCreateCommand
    })
    })
})
