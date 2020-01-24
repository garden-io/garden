/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { makeDummyGarden } from "../../../../src/cli/cli"
import { getDataDir } from "../../../helpers"

describe("cli", () => {
  describe("makeDummyGarden", () => {
    it("should initialise and resolve config graph in a directory with no project", async () => {
      const garden = await makeDummyGarden("./foobarbas", {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(await dg.getModules()).to.not.throw
    })
    it("should initialise and resolve config graph in a project with invalid config", async () => {
      const root = getDataDir("test-project-invalid-config")
      const garden = await makeDummyGarden(root, {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(await dg.getModules()).to.not.throw
    })
    it("should initialise and resolve config graph in a project with template strings", async () => {
      const root = getDataDir("test-project-templated")
      const garden = await makeDummyGarden(root, {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(await dg.getModules()).to.not.throw
    })
  })
})
