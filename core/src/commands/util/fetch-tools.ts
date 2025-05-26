/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams } from "../base.js"
import { Command } from "../base.js"
import { RuntimeError } from "../../exceptions.js"
import dedent from "dedent"
import type { GardenPluginSpec } from "../../plugin/plugin.js"
import { findProjectConfig } from "../../config/base.js"
import { Garden, DummyGarden } from "../../garden.js"
import { PluginTool } from "../../util/ext-tools.js"
import { fromPairs, omit, uniqBy } from "lodash-es"
import { printHeader, printFooter } from "../../logger/util.js"
import { BooleanParameter } from "../../cli/params.js"
import type { BaseProviderConfig, Provider } from "../../config/provider.js"

interface PluginConfigWithToolVersion extends BaseProviderConfig {
  version?: string
}
const fetchToolsOpts = {
  "all": new BooleanParameter({
    help: "Fetch all tools for registered plugins, instead of just ones in the current env/project.",
    required: false,
  }),
  "garden-image-build": new BooleanParameter({
    help: "(Internal) Fetch only tools marked with _includeInGardenImage=true.",
    required: false,
    hidden: true,
  }),
}

type FetchToolsOpts = typeof fetchToolsOpts

export class FetchToolsCommand extends Command<{}, FetchToolsOpts> {
  name = "fetch-tools"
  help = "Pre-fetch plugin tools."
  override cliOnly = true

  override noProject = true

  override description = dedent`
    Pre-fetch all the available tools for the configured providers in the current
    project/environment, or all registered providers if the --all parameter is
    specified.

    Examples:

        garden util fetch-tools        # fetch for just the current project/env
        garden util fetch-tools --all  # fetch for all registered providers
  `

  override options = fetchToolsOpts

  override printHeader() {}

  async action({ garden, log, opts }: CommandParams<{}, FetchToolsOpts>) {
    let plugins: GardenPluginSpec[]

    if (opts.all) {
      plugins = await garden.getAllPlugins()
      printHeader(log, "Fetching tools for all registered providers", "🛠️")
    } else {
      const projectRoot = await findProjectConfig({ log, path: garden.projectRoot })

      if (!projectRoot) {
        throw new RuntimeError({
          message: `Could not find a project configuration in the current directory, or anywhere above. Please use the --all parameter if you'd like to fetch tools for all registered providers.`,
        })
      }

      if (garden instanceof DummyGarden) {
        garden = await Garden.factory(garden.projectRoot, {
          ...omit(garden.opts, "config", "environmentString"),
          log,
          environmentString: opts.env,
        })
      }

      plugins = await garden.getConfiguredPlugins()

      printHeader(log, "Fetching all tools for the current project and environment", "🛠️")
    }

    let tools = plugins.flatMap((plugin) =>
      (plugin.tools || []).map((spec) => ({ plugin, tool: new PluginTool(spec) }))
    )

    if (opts["garden-image-build"]) {
      tools = tools.filter((spec) => !!spec.tool.spec._includeInGardenImage)
    }

    // No need to fetch the same tools multiple times, if they're used in multiple providers
    const deduplicated = uniqBy(tools, ({ tool }) => tool["versionPath"])

    const configuredProviders = garden
      .getUnresolvedProviderConfigs({ names: ["pulumi", "terraform"], allowMissing: true })
      .map((c) => c.name)

    const resolvedProviderConfigs: Provider<PluginConfigWithToolVersion>[] = []
    for (const providerName of configuredProviders) {
      resolvedProviderConfigs.push(
        await garden.resolveProvider<PluginConfigWithToolVersion>({ name: providerName, log })
      )
    }

    // If the version of the tool is configured on the provider,
    // download only that version of the tool.
    const toolsNeeded = deduplicated.filter((tool) => {
      const pluginToolVersion = resolvedProviderConfigs.find((p) => p.name === tool.plugin.name)?.config.version
      const pluginHasVersionConfigured = !!pluginToolVersion
      if (!pluginHasVersionConfigured) {
        return true
      } else {
        return pluginToolVersion === tool.tool.spec.version
      }
    })

    const paths = fromPairs(
      await Promise.all(
        toolsNeeded.map(async ({ plugin, tool }) => {
          const fullName = `${plugin.name}.${tool.name}`
          const path = await tool.ensurePath(log)
          return [fullName, { type: tool.type, path }]
        })
      )
    )

    printFooter(log)

    return { result: paths }
  }
}
