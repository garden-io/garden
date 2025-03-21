/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { printHeader } from "../logger/util.js"
import dedent from "dedent"
import type { Log } from "../logger/log-entry.js"
import { CloudApiError, ConfigurationError, GardenError, InternalError, isErrnoException, TimeoutError } from "../exceptions.js"
import type { AuthToken } from "../cloud/auth.js"
import { AuthRedirectServer, saveAuthToken } from "../cloud/auth.js"
import type { EventBus } from "../events/events.js"
import { getCloudDomain } from "../cloud/util.js"
import type { GardenBackend } from "../cloud/backend.js"
import { gardenBackendFactory } from "../cloud/backend.js"
import { gardenEnv } from "../constants.js"
import type { ProjectConfig } from "../config/project.js"
import type { Document, ParsedNode } from "yaml"
import { parseAllDocuments, Pair, YAMLMap, Scalar } from "yaml"
import { styles } from "../logger/styles.js"
import { deline } from "../util/string.js"
import fsExtra from "fs-extra"
const { readFile, writeFile } = fsExtra
import { relative } from "path"
import { findProjectConfigOrPrintInstructions } from "./helpers.js"

const loginTimeoutSec = 60 * 60 // 1 hour should be enough to sign up and choose/create an organization

export const loginOpts = {}

type Opts = typeof loginOpts

export class LoginCommand extends Command<{}, Opts> {
  name = "login"
  help = "Log in to Garden Cloud."

  /**
   * Since we're logging in, we don't want to resolve e.g. the project config (since it may use secrets, which are
   * only available after we've logged in).
   */
  override noProject = true

  override description = dedent`
    Logs you in to Garden Cloud. Subsequent commands will have access to cloud features.
  `

  override options = loginOpts

  override printHeader({ log }) {
    printHeader(log, "Login", "☁️")
  }

  async action({ garden, log }: CommandParams<{}, Opts>): Promise<CommandResult> {
    const projectConfig = await findProjectConfigOrPrintInstructions(log, garden.projectRoot)
    const globalConfigStore = garden.globalConfigStore
    const cloudDomain = getCloudDomain(projectConfig)
    const { id: projectId, organizationId } = projectConfig || {}
    const gardenBackend = gardenBackendFactory(projectConfig, { cloudDomain, projectId, organizationId })

    try {
      // NOTE: The Cloud API is missing from the `Garden` class for commands
      // with `noProject = true` so we initialize it here.
      const cloudApi = await gardenBackend.cloudApiFactory({
        log,
        cloudDomain,
        skipLogging: true,
        globalConfigStore,
        projectId: projectConfig?.id,
        organizationId: projectConfig?.organizationId,
      })
      if (cloudApi) {
        log.success({ msg: `You're already logged in to ${cloudDomain}.` })
        cloudApi.close()
        // If successful, we are already logged in.
        return {}
      }
    } catch (err) {
      if (!(err instanceof CloudApiError) || (err.responseStatusCode === 401 && gardenEnv.GARDEN_AUTH_TOKEN)) {
        throw err
      }
    }

    log.info({ msg: `Logging in to ${cloudDomain}...` })
    const tokenResponse = await login(log, gardenBackend, garden.events)
    await saveAuthToken({
      log,
      globalConfigStore,
      tokenResponse,
      domain: cloudDomain,
    })
    log.success({ msg: `Successfully logged in to ${cloudDomain}.`, showDuration: false })
    if (tokenResponse.organizationId) {
      await applyOrganizationId({ log, projectConfig, organizationId: tokenResponse.organizationId })
    }

    return {}
  }
}

export async function login(log: Log, gardenBackend: GardenBackend, events: EventBus): Promise<AuthToken> {
  // Start auth redirect server and wait for its redirect handler to receive the redirect and finish running.
  const server = new AuthRedirectServer({
    events,
    log,
    ...gardenBackend.getAuthRedirectConfig(),
  })

  log.debug(`Redirecting to ${gardenBackend.config.cloudDomain} login page...`)
  const response = await new Promise<AuthToken>(async (resolve, reject) => {
    // The server resolves the promise with the new auth token once it's received the redirect.
    await server.start()

    let timedOut = false

    const timeout = setTimeout(() => {
      timedOut = true
      reject(
        new TimeoutError({
          message: `Timed out after ${loginTimeoutSec} seconds, waiting for web login response.`,
        })
      )
    }, loginTimeoutSec * 1000)

    events.once("receivedToken", (tokenResponse: AuthToken) => {
      if (timedOut) {
        return
      }
      clearTimeout(timeout)
      log.info("Received client auth token.")
      resolve(tokenResponse)
    })
  })

  await server.close()
  if (!response) {
    throw new InternalError({ message: `Error: Did not receive an auth token after logging in.` })
  }

  return response
}

export async function applyOrganizationId({
  log,
  projectConfig,
  organizationId,
}: {
  log: Log
  projectConfig: ProjectConfig | undefined
  organizationId: string
}) {
  if (projectConfig) {
    if (projectConfig.organizationId) {
      if (projectConfig.organizationId === organizationId) {
        log.debug("Project config already has a matching organizationId set, skipping.")
      } else {
        throw new InternalError({
          message: deline`
            The ${styles.highlight("organizationId")} received when logging in doesn't match the one in your project config.
            Expected ${organizationId}, but got ${styles.highlight(projectConfig.organizationId)}.
          `,
        })
      }
    } else {
      // XXX: WTF, we have projectConfig.path, projectConfig.internal.configFilePath and they are all undefined
      if (!projectConfig.configPath) {
        throw new InternalError({
          message: "Invalid state: The project configuration must have a config file path",
        })
      }
      await rewriteProjectConfigFile(log, projectConfig.configPath, organizationId)
    }
  } else {
    // TODO: Generate a project config, similarly to how it's done in the `create project` command (and set the
    // organizationId there). Use the name of the repo root dir as the project name.
  }
}

async function rewriteProjectConfigFile(log: Log, projectConfigPath: string, organizationId: string): Promise<void> {
  const relPath = relative(process.cwd(), projectConfigPath)
  // We reparse the file this way to avoid losing comments, field ordering etc. when writing it back after adding
  // the organizationId.
  const fileContent = (await readFile(projectConfigPath)).toString()
  try {
    const updatedFileContent = rewriteProjectConfigYaml(fileContent, projectConfigPath, organizationId)
    await writeFile(projectConfigPath, updatedFileContent)
    log.info(
      `Successfully connected your Garden Project with Garden Cloud! Make sure to commit the updated ${relPath} to source control.`
    )
  } catch (err) {
    // If the above fails for any reason, we log a helpful message to guide the user to setting the
    // organizationId in their project config manually.
    const relPath = relative(process.cwd(), projectConfigPath)
    log.debug(
      `An error occurred while automatically setting organizationId in project config at path ${relPath}: ${err instanceof Error ? err.stack : err}`
    )
    log.info(dedent`
        Please add the following field to your project config:

          kind: Project
          organizationId: ${organizationId} # <----
          ...
      `)
    return
  }
}

export function rewriteProjectConfigYaml(
  projectConfigYaml: string,
  projectConfigPath: string,
  organizationId: string
): string {
  const docsInFile = parseAllDocuments(projectConfigYaml)

  // We throw below if there isn't exactly one project config in the file, so we don't need
  // an array of indices here.
  let projectDocIndex: number = -1
  const projectConfigMatches = docsInFile.filter((doc, index) => {
    if (doc.contents instanceof YAMLMap) {
      const kind = doc.get("kind") as string
      if (kind === "Project") {
        projectDocIndex = index
        return true
      } else {
        return false
      }
    } else {
      return false
    }
  })
  if (projectConfigMatches.length === 0) {
    throw new ConfigurationError({
      message: `An error occurred while setting organizatiionId in project config: Project config not found at ${projectConfigPath}`,
    })
  }
  if (projectConfigMatches.length > 1) {
    throw new ConfigurationError({
      message: deline`
        An error occurred while setting organizatiionId in project config: Multiple project configs found
        at ${projectConfigPath}. Only one project config is allowed in a Garden project.
      `,
    })
  }
  const projectDoc = projectConfigMatches[0]
  // We go through a bit of extra effort here to insert the `organizationId` below the name field (since we don't want
  // it to appear in a visually ugly position).
  // TODO: If there is a comment below the name field in the project config, it will be lost during this process.
  // Probably a minor issue/limitation, but worth noting here.
  if (projectDoc.contents instanceof YAMLMap) {
    const map = projectDoc.contents
    // Create a new Pair for the organizationId key.

    // We need to cast to unknown because the node we create here doesn't have all the metadata that would be there
    // if it had been parsed from disk.
    const keyNode = projectDoc.createNode("organizationId") as unknown as ParsedNode
    const valueNode = projectDoc.createNode(organizationId) as unknown as ParsedNode
    const newPair = new Pair(keyNode, valueNode)

    // Find the index of the `name` field (i.e. the project name).
    const insertIndex = map.items.findIndex((item) => item.key instanceof Scalar && item.key.value === "name")

    // If found, insert after that key; if not, just add it at the end.
    if (insertIndex !== -1) {
      // Insert after the found index
      map.items.splice(insertIndex + 1, 0, newPair)
    } else {
      // Fallback: simply set it (which typically adds it at the end)
      projectDoc.set("organizationId", organizationId)
    }
  } else {
    throw new InternalError({
      message: "Unexpected YAML structure: Expected a map at the document root.",
    })
  }
  docsInFile[projectDocIndex] = projectDoc

  return docsInFile.map((doc: Document.Parsed<ParsedNode, true>) => doc.toString()).join("")
}
