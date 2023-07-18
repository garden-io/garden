/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenCli, GardenCliParams } from "../../src/cli/cli"
import type { GardenOpts } from "../../src/garden"
import { makeTestGarden } from "../helpers"
import { FakeCloudApi } from "./api"

export class TestGardenCli extends GardenCli {
  constructor(params: GardenCliParams = {}) {
    super({ cloudApiFactory: FakeCloudApi.factory, ...params })
  }

  override async getGarden(workingDir: string, opts: GardenOpts) {
    return makeTestGarden(workingDir, opts)
  }
}
