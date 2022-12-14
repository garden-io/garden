/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { Command, CommandParams, CommandResult } from "../../base"
import { printHeader } from "../../../logger/util"
import { ConfigurationError, EnterpriseApiError } from "../../../exceptions"
import { ensureUserProfile, noApiMsg } from "../helpers"
import {
  CreateProjectsForRepoRequest,
  CreateProjectsForRepoResponse,
  GetProfileResponse,
} from "@garden-io/platform-api-types"
import { CloudConnectedProject, LocalConfig, localConfigKeys } from "../../../config-store"

export class ProjectsCreateCommand extends Command<{}, {}> {
  name = "create"
  help = "Create a Garden Cloud project."
  description = dedent`
      Uses the current Garden project to create a new Garden Cloud project with the same name.
      If there are environments defined in the project config, they will also be created.
      This will fail when there is a project with the same name already. Run 'projects update'
      if there was a failure to create the environments. A created project automatically is
      connected in the local config.

      Examples:
          garden cloud projects create # create a new Garden Cloud project
    `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Create a project", "lock")
  }

  async action({ garden, log }: CommandParams<{}, {}>): Promise<CommandResult> {
    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError(noApiMsg("create", "projects"), {})
    }

    const profile: GetProfileResponse["data"] = await ensureUserProfile(api)
    const organization: string = profile.organization.name

    // `projects create` tries to first create a project with the given name.
    // This command can fail in a couple of ways:
    // If a project with the name already exists
    // If there is a network failure or
    const projectName = garden.projectName
    const repoRoot = await garden.getRepoRoot()

    const createRequest: CreateProjectsForRepoRequest = {
      name: projectName,
      repositoryUrl: repoRoot,
      relativeProjectRootPath: "",
      importFromVcsProvider: false,
    }

    log.debug(`Creating Garden Cloud project ${organization}/${projectName}.`)
    const response = await api.post<CreateProjectsForRepoResponse>(`/projects/`, { body: createRequest })

    if (response.status === "error") {
      log.debug(`Attempt to create a project failed with ${response.error}`)
      throw new EnterpriseApiError(`Failed to create the project ${organization}/${projectName}`, {})
    }

    const projects: CreateProjectsForRepoResponse["data"] = response.data
    const project = projects[0]

    log.debug(`Received a response from cloud ${JSON.stringify(project)}`)

    log.debug(`Creating Garden Cloud project ${organization}/${projectName}.`)

    // Store the new cloud project in the local config
    const localConfig: LocalConfig = await garden.configStore.get()

    const connectedProjects: CloudConnectedProject[] = localConfig.cloud?.connectedProjects || []

    connectedProjects.push({
      organizationName: organization,
      projectName: project.name,
      projectId: project.uid,
    })

    await garden.configStore.set([localConfigKeys().cloud, "connectedProjects"], connectedProjects)

    log.info(`Created Garden Cloud project ${organization}/${project.name}, ${project.uid}`)

    return {}
  }
}
