/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams } from "../base"
import { RuntimeError } from "../../exceptions"
import dedent from "dedent"
import { GardenPlugin } from "../../types/plugin/plugin"
import { findProjectConfig } from "../../config/base"
import { Garden, DummyGarden } from "../../garden"
import Bluebird from "bluebird"
import { PluginTool } from "../../util/ext-tools"
import { fromPairs, omit, uniqBy } from "lodash"
import { printHeader, printFooter } from "../../logger/util"
import { BooleanParameter } from "../../cli/params"

const fetchToolsOpts = {
  "all": new BooleanParameter({
    help: "Fetch all tools for registered plugins, instead of just ones in the current env/project.",
    required: false,
  }),
  "prefetch-only": new BooleanParameter({
    help: "(Internal) Fetch only tools marked with prefetch=true.",
    required: false,
    hidden: true,
  }),
}

type FetchToolsOpts = typeof fetchToolsOpts

export class FetchToolsCommand extends Command<{}, FetchToolsOpts> {
  name = "fetch-tools"
  help = "Pre-fetch plugin tools."
  cliOnly = true

  noProject = true

  description = dedent`
    Pre-fetch all the available tools for the configured providers in the current
    project/environment, or all registered providers if the --all parameter is
    specified.

    Examples:

        garden util fetch-tools        # fetch for just the current project/env
        garden util fetch-tools --all  # fetch for all registered providers
  `

  options = fetchToolsOpts

  async action({ garden, log, opts }: CommandParams<{}, FetchToolsOpts>) {
    let plugins: GardenPlugin[]

    if (opts.all) {
      plugins = Object.values(garden.registeredPlugins)
      printHeader(log, "Fetching tools for all registered providers", "hammer_and_wrench")
    } else {
      const projectRoot = findProjectConfig(garden.projectRoot)

      if (!projectRoot) {
        throw new RuntimeError(
          `Could not find project config in the current directory, or anywhere above. Please use the --all parameter if you'd like to fetch tools for all registered providers.`,
          { root: garden.projectRoot }
        )
      }

      if (garden instanceof DummyGarden) {
        garden = await Garden.factory(garden.projectRoot, { ...omit(garden.opts, "config"), log })
      }

      plugins = await garden.getPlugins()

      printHeader(log, "Fetching all tools for the current project and environment", "hammer_and_wrench")
    }

    let tools = plugins.flatMap((plugin) =>
      (plugin.tools || []).map((spec) => ({ plugin, tool: new PluginTool(spec) }))
    )

    if (opts["prefetch-only"]) {
      tools = tools.filter((spec) => spec.tool.spec.prefetch)
    }

    // No need to fetch the same tools multiple times, if they're used in multiple providers
    const deduplicated = uniqBy(tools, ({ tool }) => tool["versionPath"])

    const paths = fromPairs(
      await Bluebird.map(deduplicated, async ({ plugin, tool }) => {
        const fullName = `${plugin.name}.${tool.name}`
        const path = await tool.getPath(log)
        return [fullName, { type: tool.type, path }]
      })
    )

    printFooter(log)

    return { result: paths }
  }
}
