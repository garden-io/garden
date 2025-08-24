/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import { printEmoji, printHeader } from "../../logger/util.js"
import { dedent, renderTable } from "../../util/string.js"
import { styles } from "../../logger/styles.js"
import { findProjectConfigOrPrintInstructions } from "../helpers.js"
import { getCloudDomain } from "../../cloud/util.js"
import { gardenBackendFactory } from "../../cloud/backend-factory.js"
import { GardenCloudBackend } from "../../cloud/legacy/backend-garden.js"
import { flatten } from "lodash-es"
import { ConfigurationError } from "../../exceptions.js"
import { noApiMsg } from "../cloud/helpers.js"

const variablesListOpts = {}

type Opts = typeof variablesListOpts

export class VariablesListCommand extends Command<{}, Opts> {
  name = "list"
  help = "List variables"
  emoji = "✔️"

  override description = dedent`
    List all variables...
  `

  // override noProject = true
  override options = variablesListOpts

  override printHeader({ log }) {
    printHeader(log, "List variables", "✔️")
  }

  async action({ garden, log }: CommandParams<{}, Opts>): Promise<CommandResult> {
    const cmdLog = log.createLog({ name: "garden", showDuration: true })

    cmdLog.info("Listing variables...")

    // const projectConfig = await findProjectConfigOrPrintInstructions(log, garden.projectRoot)
    // const globalConfigStore = garden.globalConfigStore
    // const cloudDomain = getCloudDomain(projectConfig)
    // const { id: projectId, organizationId } = projectConfig || {}
    // const gardenBackend = gardenBackendFactory(projectConfig, { cloudDomain, projectId, organizationId })

    if (garden.cloudApi) {
      throw new Error(`This command is not available on legacy instances of Garden Cloud`)
    }
    if (!garden.cloudApiV2) {
      throw new ConfigurationError({ message: noApiMsg("list", "variables") })
    }

    const api = garden.cloudApiV2

    const partial = true

    cmdLog.info("Resolving config")
    const config = await garden.dumpConfig({
      log,
      includeDisabled: false,
      resolveGraph: !partial,
      resolveProviders: !partial,
      resolveWorkflows: !partial,
    })

    const localVars = Object.entries(config.variables || {}).map(([key, val]) => {
      return {
        name: key,
        value: val,
        source: "local",
      }
    })

    // TODO: Read var lists from project config
    const varLists = await api.api.variableList.list.query({ organizationId: api.organizationId })

    if (varLists.length === 0) {
      cmdLog.info("No variables list found. Aborting.")
    }

    const remoteVars = flatten(
      await Promise.all(
        varLists.map(async (l) => {
          const variables = await api.api.variableList.listVariables.query({
            organizationId: api.organizationId,
            variableListId: l.id,
          })
          return variables.items.map((v) => ({
            ...v,
            variableListId: l.id,
          }))
        })
      )
    )
      .sort((a, b) => a.variableListId.localeCompare(b.variableListId))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (remoteVars.length === 0) {
      cmdLog.info("No variables found")
      return {}
    }

    cmdLog.info(`Found ${remoteVars.length} variables`)

    type Vars = {
      name: string
      value: string
      source: string
    }

    const allVars: Vars[] = remoteVars.map((v) => {
      return {
        name: v.name,
        value: v.value,
        source: v.variableListId,
      }
    })
    allVars.push(...localVars)

    const heading = ["Name", "Value", "Source"].map((s) => styles.bold(s))
    const rows: string[][] = allVars.map((s) => {
      return [styles.highlight.bold(s.name), String(s.value), s.source]
    })

    log.info("")

    log.info(renderTable([heading].concat(rows)))

    log.info(styles.success("OK") + " " + printEmoji("✔️", log))

    return { result: allVars }
  }
}
