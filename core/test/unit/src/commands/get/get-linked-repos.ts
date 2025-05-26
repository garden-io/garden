/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import type { TestGarden } from "../../../../helpers.js"
import {
  resetLocalConfig,
  getDataDir,
  withDefaultGlobalOpts,
  makeExtModuleSourcesGarden,
  makeExtProjectSourcesGarden,
  makeExtActionSourcesGarden,
} from "../../../../helpers.js"
import { LinkSourceCommand } from "../../../../../src/commands/link/source.js"
import { LinkModuleCommand } from "../../../../../src/commands/link/module.js"
import { GetLinkedReposCommand } from "../../../../../src/commands/get/get-linked-repos.js"
import { LinkActionCommand } from "../../../../../src/commands/link/action.js"

describe("GetLinkedReposCommand", () => {
  let garden: TestGarden

  afterEach(async () => {
    await resetLocalConfig(garden.gardenDirPath)
  })

  it("should list all linked project sources in the project", async () => {
    garden = await makeExtProjectSourcesGarden()
    const log = garden.log
    const sourcesDir = getDataDir("test-project", "local-project-sources")
    const linkSourceCmd = new LinkSourceCommand()
    const sourceNames = ["source-a", "source-b", "source-c"]
    for (const sourceName of sourceNames) {
      await linkSourceCmd.action({
        garden,
        log,
        args: { source: sourceName, path: join(sourcesDir, sourceName) },
        opts: withDefaultGlobalOpts({}),
      })
    }

    const getLinkedReposCommand = new GetLinkedReposCommand()
    const results = await getLinkedReposCommand.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    const expected = sourceNames.map((name) => {
      return { name, path: join(sourcesDir, name) }
    })

    expect(results.result).to.eql(expected)
  })

  it("should list all linked actions in the project", async () => {
    garden = await makeExtActionSourcesGarden()
    const log = garden.log
    const sourcesDir = getDataDir("test-projects", "local-action-sources")
    const linkModuleCmd = new LinkActionCommand()
    const sourceKeys = ["build.a", "build.b"]
    for (const key of sourceKeys) {
      await linkModuleCmd.action({
        garden,
        log,
        args: { action: key, path: join(sourcesDir, key) },
        opts: withDefaultGlobalOpts({}),
      })
    }

    const getLinkedReposCommand = new GetLinkedReposCommand()
    const results = await getLinkedReposCommand.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    const expected = sourceKeys.map((name) => {
      return { name, path: join(sourcesDir, name) }
    })

    expect(results.result).to.eql(expected)
  })

  it("should list all linked modules in the project", async () => {
    garden = await makeExtModuleSourcesGarden()
    const log = garden.log
    const sourcesDir = getDataDir("test-projects", "local-module-sources")
    const linkModuleCmd = new LinkModuleCommand()
    const sourceNames = ["module-a", "module-b", "module-c"]
    for (const moduleName of sourceNames) {
      await linkModuleCmd.action({
        garden,
        log,
        args: { module: moduleName, path: join(sourcesDir, moduleName) },
        opts: withDefaultGlobalOpts({}),
      })
    }

    const getLinkedReposCommand = new GetLinkedReposCommand()
    const results = await getLinkedReposCommand.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    const expected = sourceNames.map((name) => {
      return { name, path: join(sourcesDir, name) }
    })

    expect(results.result).to.eql(expected)
  })
})
