/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent, renderTable } from "../../../util/string"
import { Command, CommandParams, CommandResult } from "../../base"
import { printHeader } from "../../../logger/util"
import { ConfigurationError } from "../../../exceptions"
import { noApiMsg, ProjectResult } from "../helpers"
import chalk from "chalk"
import { GetAllProjectsResponse, ListProjectsResponse } from "@garden-io/platform-api-types"

export class ProjectsListCommand extends Command<{}, {}> {
  name = "list"
  help = "List projects."
  description = dedent`
      List all projects from Garden Cloud.

      Examples:
          garden cloud projects list    # list all projects
    `

  printHeader({ headerLog }) {
    printHeader(headerLog, "List projects", "lock")
  }

  async action({ garden, log }: CommandParams<{}, {}>): Promise<CommandResult<ProjectResult[]>> {
    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError(noApiMsg("list", "projects"), {})
    }

    log.debug(`Fetching all projects`)
    const response = await api.get<GetAllProjectsResponse>(`/projects`)

    if (response.status === "error") {
      log.info("Failed when retrieving projects.")
      log.debug(`Attempt to retrieve projects failed with ${response.error}`)
      return { result: [] }
    }

    const projects: ListProjectsResponse[] = response.data

    log.info("")

    if (projects.length === 0) {
      log.info("No projects found in project.")
      return { result: [] }
    }

    const heading = ["Name", "ID", "Environments", "Status", "Last Used At"].map((s) => chalk.bold(s))

    const rows: string[][] = projects.map((project) => {
      return [
        chalk.cyan.bold(project.name),
        String(project.uid),
        project.environments.map((e) => e.name).join(", "),
        project.status,
        project.environments
          .reduce((currentMaxDate, next) => {
            const nextDate = new Date(next.namespaceLastUpdatedAt || 0)
            return currentMaxDate > nextDate ? currentMaxDate : nextDate
          }, new Date(0))
          .toISOString(),
      ]
    })

    log.info(renderTable([heading].concat(rows)))

    const results: ProjectResult[] = projects.map((project) => {
      return {
        id: project.id,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        name: project.name,
        environments: project.environments.length,
      }
    })

    return { result: results }
  }
}
