/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { joi } from "../config/common.js"
import { ConfigStore } from "./base.js"
import { z } from "zod"
import fsExtra from "fs-extra"
const { readFile } = fsExtra
import { load } from "js-yaml"
import { keyBy, memoize } from "lodash-es"

export const legacyLocalConfigFilename = "local-config.yml"
export const localConfigFilename = "local-config.json"

const linkedSourceSchema = z.object({
  name: z.string().describe("The name of the linked source."),
  path: z.string().describe("The local directory path of the linked repo clone."),
})

export type LinkedSource = z.infer<typeof linkedSourceSchema>

export interface LinkedSourceMap {
  [key: string]: LinkedSource
}

const analyticsSchema = z.object({
  projectId: z.string().optional(),
})

const localSchema = z.object({
  analytics: analyticsSchema,

  devCommandHistory: z.array(z.string()).default([]),
  defaultEnv: z.string().default("").describe("An environment override, set with the `set env` command."),

  linkedActionSources: z.record(linkedSourceSchema).default({}),
  linkedModuleSources: z.record(linkedSourceSchema).default({}),
  linkedProjectSources: z.record(linkedSourceSchema).default({}),

  warnings: z.record(
    z.object({
      hidden: z.boolean().optional().describe("Whether the warning has been hidden by the user."),
      lastShown: z.coerce.date().optional().describe("When the warning was last shown."),
    })
  ),
})

export type LocalConfig = z.infer<typeof localSchema>

// TODO: we should not be passing this to provider actions
export const configStoreSchema = memoize(() =>
  joi.object().description("Helper class for managing local configuration for plugins.")
)

export class LocalConfigStore extends ConfigStore<typeof localSchema> {
  schema = localSchema

  constructor(protected gardenDirPath: string) {
    super()
  }

  getConfigPath(): string {
    return join(this.gardenDirPath, localConfigFilename)
  }

  protected async initConfig(migrate: boolean) {
    let config: LocalConfig = {
      analytics: {},
      devCommandHistory: [],
      defaultEnv: "",
      linkedActionSources: {},
      linkedModuleSources: {},
      linkedProjectSources: {},
      warnings: {},
    }

    if (!migrate) {
      return config
    }

    // Try to migrate part of the legacy config, if it's there
    try {
      const legacyData = await readFile(join(this.gardenDirPath, legacyLocalConfigFilename))
      const parsed: any = load(legacyData.toString())
      if (parsed?.analytics?.projectId) {
        config.analytics.projectId = parsed?.analytics?.projectId
      }
      if (parsed?.linkedModuleSources) {
        config.linkedModuleSources = keyBy(parsed.linkedModuleSources, "name")
      }
      if (parsed?.linkedProjectSources) {
        config.linkedProjectSources = keyBy(parsed.linkedProjectSources, "name")
      }
      config = this.validate(config, "initializing")
    } catch {}

    return config
  }
}
