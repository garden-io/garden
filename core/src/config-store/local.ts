/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { joi } from "../config/common"
import { ConfigStore } from "./base"
import { z } from "zod"
import { readFile } from "fs-extra"
import { safeLoad } from "js-yaml"
import { keyBy } from "lodash"

export const legacyLocalConfigFilename = "local-config.yml"
export const localConfigFilename = "local-config.json"

const linkedSourceSchema = z.object({
  name: z.string().describe("The name of the linked source."),
  path: z.string().describe("The local directory path of the linked repo clone."),
})

export type LinkedSource = z.infer<typeof linkedSourceSchema>

const analyticsSchema = z.object({
  projectId: z.string().optional(),
})

const localSchema = z.object({
  analytics: analyticsSchema,

  linkedModuleSources: z.record(linkedSourceSchema),
  linkedProjectSources: z.record(linkedSourceSchema),

  warnings: z.record(
    z.object({
      hidden: z.boolean().optional().describe("Whether the warning has been hidden by the user."),
      lastShown: z.coerce.date().optional().describe("When the warning was last shown."),
    })
  ),
})

export type LocalConfig = z.infer<typeof localSchema>
export type AnalyticsLocalConfig = LocalConfig["analytics"]

// TODO: we should not be passing this to provider actions
export const configStoreSchema = () =>
  joi.object().description("Helper class for managing local configuration for plugins.")

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
      const parsed: any = safeLoad(legacyData.toString())
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
