/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
import { CloudApiError, InternalError, TimeoutError } from "../exceptions.js"
import type { AuthToken } from "../cloud/common.js"
import { AuthRedirectServer, getAuthRedirectConfigLegacy, saveAuthToken } from "../cloud/api-legacy/auth.js"
import type { EventBus } from "../events/events.js"
import { getCloudDomain, useLegacyCloud } from "../cloud/util.js"
import { gardenEnv } from "../constants.js"
import type { ProjectConfig } from "../config/project.js"
import { deline } from "../util/string.js"
import fsExtra from "fs-extra"
const { readFile, writeFile } = fsExtra
import { relative } from "path"
import { findProjectConfigOrPrintInstructions } from "./helpers.js"
import { styles } from "../logger/styles.js"
import { GardenCloudApi } from "../cloud/api/api.js"
import { GardenCloudApiLegacy } from "../cloud/api-legacy/api.js"
import { getAuthRedirectConfig } from "../cloud/api/auth.js"
import type { AuthRedirectConfig } from "../cloud/common.js"

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
    const cloudDomain = await getCloudDomain(projectConfig)
    const { id: projectId, organizationId: configOrganizationId } = projectConfig || {}

    let cloudApi: GardenCloudApiLegacy | GardenCloudApi | undefined

    // First, see if we're already logged in.
    try {
      // NOTE: The Cloud API is missing from the `Garden` class for commands
      // with `noProject = true` so we initialize it here.
      if ((await useLegacyCloud(projectConfig)) && projectId) {
        cloudApi = await GardenCloudApiLegacy.factory({
          log,
          cloudDomain,
          skipLogging: true,
          globalConfigStore,
          projectId,
        })
      } else if (configOrganizationId || projectId) {
        cloudApi = await GardenCloudApi.factory({
          log,
          cloudDomain,
          skipLogging: true,
          globalConfigStore,
          organizationId: configOrganizationId,
          legacyProjectId: projectId,
        })
      }

      if (cloudApi) {
        log.success({ msg: `You're already logged in to ${cloudDomain}.` })

        // If we have a cloud API with resolved org ID, update the config
        if (cloudApi instanceof GardenCloudApi && projectId) {
          await updateProjectConfigWithResolvedOrgId({
            log,
            projectConfig,
            organizationId: cloudApi.organizationId,
            legacyProjectId: projectId,
            hadConflict: !!(configOrganizationId && configOrganizationId !== cloudApi.organizationId),
          })
        }

        cloudApi.close()
        // If successful, we are already logged in.
        return {}
      }
    } catch (err) {
      if (!(err instanceof CloudApiError) || (err.responseStatusCode === 401 && gardenEnv.GARDEN_AUTH_TOKEN)) {
        throw err
      }
    }

    // Otherwise, we still need to log in.

    // Don't pass organizationId to login URL - let user choose, then resolve from project ID after
    const authRedirectConfig = (await useLegacyCloud(projectConfig))
      ? getAuthRedirectConfigLegacy(cloudDomain)
      : getAuthRedirectConfig({ cloudDomain })

    log.info({ msg: `Logging in to ${cloudDomain}...` })
    const tokenResponse = await login({ log, authRedirectConfig, events: garden.events, cloudDomain })
    await saveAuthToken({
      log,
      globalConfigStore,
      tokenResponse,
      domain: cloudDomain,
    })
    log.success({ msg: `\nSuccessfully logged in to ${cloudDomain}.\n`, showDuration: false })

    // After login, resolve the org ID from legacy project ID using the new token
    // This ensures we use the correct org even if the user selected their personal org during login
    const orgIdToApply = await getOrganizationIdToApply({
      projectId,
      projectConfig,
      cloudDomain,
      tokenResponse,
      log,
    })

    if (orgIdToApply) {
      await updateProjectConfigWithResolvedOrgId({
        log,
        projectConfig,
        organizationId: orgIdToApply,
        legacyProjectId: projectId,
        hadConflict: !!(
          configOrganizationId &&
          configOrganizationId !== orgIdToApply &&
          projectId &&
          tokenResponse.organizationId !== orgIdToApply
        ),
      })
    }

    return {}
  }
}

export async function login({
  log,
  events,
  authRedirectConfig,
  cloudDomain,
}: {
  log: Log
  events: EventBus
  authRedirectConfig: AuthRedirectConfig
  cloudDomain: string
}): Promise<AuthToken> {
  // Start auth redirect server and wait for its redirect handler to receive the redirect and finish running.
  const server = new AuthRedirectServer({
    events,
    log,
    ...authRedirectConfig,
  })

  log.debug(`Redirecting to ${cloudDomain} login page...`)
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
      log.debug("Received client auth token.")
      resolve(tokenResponse)
    })
  })

  await server.close()
  if (!response) {
    throw new InternalError({ message: `Error: Did not receive an auth token after logging in.` })
  }

  return response
}

/**
 * Resolves the organization ID from a legacy project ID after login.
 * If the user selected a different organization during login, logs an informative message.
 * Returns the resolved organization ID, or falls back to the token response if resolution fails.
 */
async function resolveOrganizationIdAfterLogin({
  projectId,
  cloudDomain,
  tokenResponse,
  log,
}: {
  projectId: string
  cloudDomain: string
  tokenResponse: AuthToken
  log: Log
}): Promise<string | undefined> {
  try {
    const resolvedOrgId = await GardenCloudApi.getDefaultOrganizationIdForLegacyProject(
      cloudDomain,
      tokenResponse.token,
      projectId
    )
    if (resolvedOrgId) {
      // Check if user selected wrong org during login
      if (tokenResponse.organizationId && tokenResponse.organizationId !== resolvedOrgId) {
        log.info({
          msg: styles.secondary(dedent`
            Note: You selected organization ${tokenResponse.organizationId} during login, but this project
            belongs to organization ${resolvedOrgId}. Using the correct organization for this project.
          `),
        })
      }
      return resolvedOrgId
    } else {
      // Couldn't resolve from legacy project ID, fall back to token response
      return tokenResponse.organizationId
    }
  } catch (error) {
    log.debug(`Could not resolve organization ID from legacy project ID: ${error}`)
    return tokenResponse.organizationId
  }
}

/**
 * Determines the organization ID to apply after login.
 * If a legacy project ID exists and we're not using legacy cloud, resolves the org ID from the project ID.
 * Otherwise, falls back to the organization ID from the token response.
 */
async function getOrganizationIdToApply({
  projectId,
  projectConfig,
  cloudDomain,
  tokenResponse,
  log,
}: {
  projectId: string | undefined
  projectConfig: ProjectConfig | undefined
  cloudDomain: string
  tokenResponse: AuthToken
  log: Log
}): Promise<string | undefined> {
  if (projectId && projectConfig && !(await useLegacyCloud(projectConfig))) {
    // Resolve using the newly obtained token
    return await resolveOrganizationIdAfterLogin({
      projectId,
      cloudDomain,
      tokenResponse,
      log,
    })
  } else {
    // No legacy project ID, use the org from token response
    return tokenResponse.organizationId
  }
}
export async function updateProjectConfigWithResolvedOrgId({
  log,
  projectConfig,
  organizationId,
  legacyProjectId,
  hadConflict,
}: {
  log: Log
  projectConfig: ProjectConfig | undefined
  organizationId: string
  legacyProjectId: string | undefined
  hadConflict: boolean
}) {
  if (!projectConfig) {
    // TODO: Generate a project config, similarly to how it's done in the `create project` command (and set the
    // organizationId there). Use the name of the repo root dir as the project name.
    return
  }

  if (!projectConfig.configPath) {
    throw new InternalError({
      message: "Invalid state: The project configuration must have a config file path",
    })
  }

  const currentOrgId = projectConfig.organizationId
  const hasLegacyFields = !!legacyProjectId

  // Skip if organizationId is already correct and there are no legacy fields relating to the old API to comment out
  if (currentOrgId === organizationId && !hasLegacyFields) {
    log.debug("Project config already has the correct organizationId and no legacy fields, skipping.")
    return
  }

  if (hadConflict) {
    log.info({
      msg: dedent`
        Organization ID conflict was detected and resolved. Your project configuration will be updated
        to use the correct organizationId (${organizationId}) associated with your legacy project.
      `,
    })
  } else if (currentOrgId && currentOrgId !== organizationId) {
    log.info({
      msg: dedent`
        Updating project configuration with the correct organizationId (${organizationId}).
      `,
    })
  }

  await setOrganizationIdInFile({
    log,
    projectConfigPath: projectConfig.configPath,
    organizationId,
    isInsert: !currentOrgId,
    commentOutLegacyFields: hasLegacyFields,
  })
}

// Deprecated: Use updateProjectConfigWithResolvedOrgId instead
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
            Expected ${organizationId} from the backend, but got ${projectConfig.organizationId}.
            Changing the organizationId only allowed to be performed manually to avoid that users leak data accidentally to foreign accounts.
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
      await setOrganizationIdInFile({
        log,
        projectConfigPath: projectConfig.configPath,
        organizationId,
        isInsert: true,
        commentOutLegacyFields: false,
      })
    }
  } else {
    // TODO: Generate a project config, similarly to how it's done in the `create project` command (and set the
    // organizationId there). Use the name of the repo root dir as the project name.
  }
}

/**
 * Replace an existing organizationId value using regex, preserving all other formatting.
 * This is used when the organizationId exists but has the wrong value.
 * Only matches top-level fields (no indentation).
 */
export function replaceOrganizationIdInYaml(yamlContent: string, newOrganizationId: string): string {
  // Match top-level organizationId: followed by the value (quoted or unquoted)
  // Handles: organizationId: value, organizationId: "value", organizationId: 'value'
  // Also preserves trailing whitespace and comments
  const regex = /^(organizationId:\s*)(['"]?)([^\s'"\n]+)\2(\s*(?:#.*)?)$/m
  return yamlContent.replace(regex, `$1$2${newOrganizationId}$2$4`)
}

/**
 * Insert a new organizationId field after the `name:` line using regex.
 * Only matches top-level `name:` field (no indentation).
 */
export function insertOrganizationIdInYaml(yamlContent: string, organizationId: string): string {
  // Match top-level name: line and insert organizationId after it
  const regex = /^(name:.*)$/m
  return yamlContent.replace(regex, `$1\norganizationId: ${organizationId}`)
}

/**
 * Comment out a top-level field in YAML using regex.
 * Transforms: `fieldName: value` → `# fieldName: value  # Legacy field, no longer needed`
 * Only matches top-level fields (no indentation).
 */
export function commentOutFieldInYaml(yamlContent: string, fieldName: string): string {
  const regex = new RegExp(`^(${fieldName}:.*)$`, "m")
  return yamlContent.replace(regex, `# $1  # Legacy field, no longer needed`)
}

/**
 * Update the organizationId in a project config file using regex operations.
 * Supports inserting new, replacing existing, and commenting out legacy fields.
 */
async function setOrganizationIdInFile({
  log,
  projectConfigPath,
  organizationId,
  isInsert,
  commentOutLegacyFields = false,
}: {
  log: Log
  projectConfigPath: string
  organizationId: string
  isInsert: boolean
  commentOutLegacyFields?: boolean
}): Promise<void> {
  const relPath = relative(process.cwd(), projectConfigPath)
  let content = (await readFile(projectConfigPath)).toString()
  const originalContent = content

  // Step 1: Insert or replace organizationId
  content = isInsert
    ? insertOrganizationIdInYaml(content, organizationId)
    : replaceOrganizationIdInYaml(content, organizationId)

  // Step 2: Comment out legacy fields if requested
  if (commentOutLegacyFields) {
    content = commentOutFieldInYaml(content, "id")
    content = commentOutFieldInYaml(content, "domain")
  }

  if (content === originalContent) {
    // Nothing changed - provide manual instructions
    log.warn(`Could not update organizationId in ${relPath}`)
    log.info(dedent`
      Please manually update your project configuration:

        kind: Project
        name: your-project
        organizationId: ${organizationId}  # <---- add this line
        ...
    `)
    return
  }

  await writeFile(projectConfigPath, content)

  const changes: string[] = []
  changes.push(`${styles.highlight("organizationId")} ${isInsert ? "added" : "updated"} to ${organizationId}`)
  if (commentOutLegacyFields) {
    changes.push(`legacy fields ${styles.highlight("id")} and ${styles.highlight("domain")} commented out`)
  }

  log.info(
    `
Your project configuration has been updated:
${changes.map((c) => `  - ${c}`).join("\n")}

Make sure to commit the updated ${styles.highlight(relPath)} to source control.
    `
  )
}
