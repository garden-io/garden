/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenCliParams } from "../../src/cli/cli.js"
import { GardenCli } from "../../src/cli/cli.js"
import type { GardenOpts } from "../../src/garden.js"
import { makeTestGarden } from "../helpers.js"

export class TestGardenCli extends GardenCli {
  constructor(params: GardenCliParams = { initLogger: false }) {
    super(params)
  }

  override async getGarden(workingDir: string, opts: GardenOpts) {
    return makeTestGarden(workingDir, opts)
  }
}
