/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent, deline } from "../../../util/string"
import { Command, CommandParams, CommandResult } from "../../base"
import { printHeader } from "../../../logger/util"
import { ConfigurationError, EnterpriseApiError } from "../../../exceptions"
import { ensureUserProfile, findConnectedProjectId, noApiMsg } from "../helpers"
import { GetAllProjectsResponse, ListProjectsResponse, UserResponse } from "@garden-io/platform-api-types"
import { CloudConnectedProject, LocalConfig, localConfigKeys } from "../../../config-store"

export class ProjectsConnectCommand extends Command<{}, {}> {
  name = "connect"
  help = "Connect a project."
  description = dedent`
      Connects the current Garden project with Garden Cloud. Uses the project name to find
      the corresponding project in Garden Cloud. Fails if there is no cloud project with a
      matching project name.

      Examples:
          garden cloud projects connect # connects the current project with Garden Cloud
    `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Connect a project", "lock")
  }

  async action({ garden, log }: CommandParams<{}, {}>): Promise<CommandResult> {
    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError(noApiMsg("connect", "projects"), {})
    }

    const profile: UserResponse = await ensureUserProfile(api)
    const organization: string = profile.organization.name

    // Check if this project is connected already
    const projectName = garden.projectName
    const localConfig: LocalConfig = await garden.configStore.get()

    if (localConfig) {
      const projectId: string | undefined = findConnectedProjectId(localConfig, organization, projectName)

      if (projectId) {
        log.info(
          `The current project ${organization}/${projectName} is already connected to Garden Cloud with id ${projectId}`
        )
        return { result: [] }
      }
    }

    log.debug(`Fetching all projects for ${organization}.`)
    const response = await api.get<GetAllProjectsResponse>(`/projects`)

    if (response.status === "error") {
      log.debug(`Attempt to retrieve projects failed with ${response.error}`)
      throw new EnterpriseApiError(`Failed to retrieve projects for the organization ${organization}`, {})
    }

    const projects: ListProjectsResponse[] = response.data

    if (projects.length === 0) {
      log.info("No projects found in organization.")
      return { result: [] }
    }

    // Fetch the name of the current garden project

    log.debug(`Trying to connect ${organization}/${projectName}.`)

    let project: ListProjectsResponse

    try {
      project = projects.find((p) => p.name === projectName)!
    } catch (error) {
      throw new EnterpriseApiError(
        deline`Could not find ${projectName} in ${organization}.
        Please use "garden cloud projects create" to create the project in Garden Cloud`,
        {}
      )
    }

    // Store the cloud connected project in the local config
    const connectedProjects: CloudConnectedProject[] = localConfig.cloud?.connectedProjects || []

    connectedProjects.push({
      organizationName: organization,
      projectName: project.name,
      projectId: project.uid,
    })

    await garden.configStore.set([localConfigKeys().cloud, "connectedProjects"], connectedProjects)

    log.info(`Connected Garden Cloud project ${organization}/${project.name}, ${project.uid}`)

    return {}
  }
}
