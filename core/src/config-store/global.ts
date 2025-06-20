/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"

import { GARDEN_GLOBAL_PATH } from "../constants.js"
import { ConfigStore } from "./base.js"
import { z } from "zod"
import fsExtra from "fs-extra"
const { readFile } = fsExtra
import { load } from "js-yaml"
import cloneDeep from "fast-copy"
import { omit } from "lodash-es"

export const legacyGlobalConfigFilename = "global-config.yml"
export const globalConfigFilename = "global-config.json"
export const emptyGlobalConfig: GlobalConfig = {
  activeProcesses: {},
  analytics: {},
  aiPromptHistory: [],
  clientAuthTokens: {},
  versionCheck: {},
  requirementsCheck: {},
}

const activeProcessSchema = z.object({
  pid: z.number().int().describe("The PID of the process."),
  startedAt: z.coerce.date().describe("When the process was started."),
  arguments: z.array(z.string()).describe("The arguments the process was started with."),
  sessionId: z.string().nullable().describe("The sessionId associated with the process, if applicable."),
  projectRoot: z.string().nullable().describe("Which project root the process started in, if applicable."),
  projectName: z.string().nullable().describe("Which project name the process is running with, if applicable."),
  environmentName: z.string().nullable().describe("Which environment name the process is running with, if applicable."),
  namespace: z.string().nullable().describe("Which namespace name the process is running with, if applicable."),
  persistent: z.boolean().default(false).describe("Whether the process is persistent."),
  serverHost: z.string().url().nullable().describe("The base URL to reach the process server, if applicable."),
  serverAuthKey: z.string().nullable().describe("The auth key to the process server, if applicable."),
  command: z.string().describe("The command the process is running."),
})

const analyticsGlobalConfigSchema = z.object({
  firstRunAt: z.coerce.date().optional().describe("When the current user first used the CLI."),
  latestRunAt: z.coerce.date().optional().describe("When the current user last used the CLI."),
  anonymousUserId: z.string().optional().describe("A generated anonymous user ID."),
  userId: z.string().optional().describe("A canonical Garden Cloud user ID, if applicable."),
  optedOut: z.boolean().optional().describe("Whether the user has opted out of analytics or not."),
  cloudVersion: z.string().optional().describe("If applicable, which Garden Cloud version the user has last used."),
  cloudProfileEnabled: z.boolean().optional().describe("Whether the user has a Garden Cloud profile."),
})

const clientAuthTokenSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
  validity: z.coerce.date(),
})

const globalConfigSchema = z.object({
  // Note: Indexed on PID
  activeProcesses: z.record(z.string().describe("The process PID (as a string)"), activeProcessSchema),

  analytics: analyticsGlobalConfigSchema,

  // Note: Indexed on cloud domain
  clientAuthTokens: z.record(z.string().describe("The Garden Cloud domain"), clientAuthTokenSchema),

  aiPromptHistory: z.array(z.string()).describe("History of AI assistant prompts for CLI arrow navigation").default([]),

  versionCheck: z.object({
    lastRun: z.coerce.date().optional().describe("When the automatic version check was last run."),
  }),

  requirementsCheck: z.object({
    lastRunDateUNIX: z.number().optional().describe("UNIX timestamp of the last run of the runtime requirements check"),
    lastRunGardenVersion: z.string().optional().describe("The Garden CLI version at the time of last check."),
    passed: z.boolean().optional().describe("Whether the last check passed the requirements."),
  }),
})

export type GlobalConfig = z.infer<typeof globalConfigSchema>
export type AnalyticsGlobalConfig = GlobalConfig["analytics"]
export type ClientAuthToken = z.infer<typeof clientAuthTokenSchema>
export type GardenProcess = z.infer<typeof activeProcessSchema>

export class GlobalConfigStore extends ConfigStore<typeof globalConfigSchema> {
  override fileMode = 0o600
  schema = globalConfigSchema

  constructor(private configDir: string = GARDEN_GLOBAL_PATH) {
    super()
  }

  getConfigPath(): string {
    return join(this.configDir, globalConfigFilename)
  }

  protected async initConfig(migrate: boolean) {
    const config: GlobalConfig = cloneDeep(emptyGlobalConfig)

    if (!migrate) {
      return config
    }

    // Try to migrate part of the legacy config, if it's there
    try {
      const legacyData = await readFile(join(this.configDir, legacyGlobalConfigFilename))
      const parsed: any = load(legacyData.toString())

      if (parsed?.analytics) {
        config.analytics = {
          // Notes:
          // - optedIn is being flipped to optedOut (in accordance with out actual user flow)
          // - cloudVersion was never set in older versions, so it's left out
          ...omit(parsed.analytics, "optedIn", "cloudVersion"),
          optedOut: parsed.analytics.optedIn === false,
        }
      }
      if (parsed?.lastVersion) {
        config.versionCheck = parsed.versionCheck
      }
      if (parsed?.requirementsCheck) {
        config.requirementsCheck = parsed.requirementsCheck
      }

      return this.validate(config, "initializing")
    } catch {
      return cloneDeep(emptyGlobalConfig)
    }
  }
}
