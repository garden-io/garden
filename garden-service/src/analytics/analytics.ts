/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as prompts from "prompts"
import dedent = require("dedent")
import * as uuidv4 from "uuid/v4"
const md5 = require("md5")
import segmentClient = require("analytics-node")
import { platform, release } from "os"
const ci = require("ci-info")

import {
  globalConfigKeys,
  AnalyticsGlobalConfig,
  GlobalConfigStore,
  LocalConfigStore,
  AnalyticsLocalConfig,
  localConfigKeys,
} from "../config-store"
import { getPackageVersion } from "../util/util"
import { Garden } from "../garden"

const API_KEY = "D3DUZ3lBSDO3krnuIO7eYDdtlDAjooKW"

export type AnalyticsType = "COMMAND" | "TASK" | "DASHBOARD"

export interface SystemInfo {
  gardenVersion: string
  platform: string
  platformVersion: string
}

export interface AnalyticsEventProperties {
  name: string
  projectId: string
  system: SystemInfo
}

export interface AnalyticsTaskEventProperties extends AnalyticsEventProperties {
  taskName: string
}
export interface AnalyticsAPIEventProperties extends AnalyticsEventProperties {
  path: string
  command: string
  parameters: object
}
export interface APIRequestBody {
  command: string
  parameters: object
}

export interface AnalyticsEvent {
  type: AnalyticsType,
  properties: AnalyticsEventProperties,
}

export interface SegmentEvent {
  userId: string
  event: AnalyticsType
  properties: AnalyticsEventProperties
}

export class Analytics {
  private garden: Garden
  private segment: any
  private globalConfig: AnalyticsGlobalConfig
  private localConfig: AnalyticsLocalConfig
  private globalConfigStore: GlobalConfigStore
  private localConfigStore: LocalConfigStore
  private systemConfig: SystemInfo

  constructor(garden: Garden) {
    this.garden = garden
    this.segment = new segmentClient(API_KEY, { flushAt: 1 })
    this.globalConfigStore = garden.globalConfigStore
    this.localConfigStore = garden.configStore
    this.globalConfig = {
      userId: "",
      firstRun: true,
      optedIn: false,

    }
    this.systemConfig = {
      platform: platform(),
      platformVersion: release(),
      gardenVersion: getPackageVersion().toString(),
    }
  }

  async init() {
    if (!ci.isCI) {
      const globalConf = await this.globalConfigStore.get()
      const localConf = await this.localConfigStore.get()
      this.globalConfig = {
        ...this.globalConfig,
        ...globalConf.analytics,
      }
      this.localConfig = {
        ...localConf.analytics,
      }

      if (this.globalConfig.firstRun) {
        await this.toggleAnalytics()
      }
    }
    return this
  }

  hasOptedIn(): boolean {
    return this.globalConfig.optedIn || false
  }

  private async track(event: AnalyticsEvent) {
    if (this.segment && this.hasOptedIn()) {
      const segmentEvent: SegmentEvent = {
        userId: this.globalConfig.userId,
        event: event.type,
        properties: {
          ...event.properties,
        },
      }

      const trackToRemote = (eventToTrack: SegmentEvent) => {
        return new Promise(
          (resolve, reject) => {
            this.segment.track(eventToTrack, function(error) {
              if (error) { reject(error) }
              resolve(true)
            })
          })
      }

      return await trackToRemote(segmentEvent)
    }
    return false
  }

  async trackCommand(commandName: string) {
    if (this.segment && this.hasOptedIn()) {
      return await this.track({
        type: "COMMAND",
        properties: {
          name: commandName,
          projectId: this.localConfig.projectId,
          system: this.systemConfig,
        },
      })
    }
    return false
  }

  async trackTask(taskName: string, taskType: string) {
    if (this.segment && this.hasOptedIn()) {
      const properties: AnalyticsTaskEventProperties = {
        name: taskName,
        taskName: md5(taskType),
        projectId: this.localConfig.projectId,
        system: this.systemConfig,
      }

      return await this.track({
        type: "TASK",
        properties,
      })
    }
    return false
  }

  async trackAPI(method: string, path: string, body: APIRequestBody) {
    if (this.segment && this.hasOptedIn()) {
      const properties: AnalyticsAPIEventProperties = {
        name: `${method} request`,
        path,
        ...body,
        projectId: this.localConfig.projectId,
        system: this.systemConfig,
      }

      return await this.track({
        type: "DASHBOARD",
        properties,
      })
    }
    return false
  }

  async toggleAnalytics(customMessage?: string) {

    const defaultMessage = dedent`
      Thanks for installing garden! We work hard to provide you the best experience we can
      and it would help us a lot if we could collect some anonymous analytics while you use garden.

      Are you ok with us collecting anonymized data about your cli usage?
    `
    const { optedIn } = await prompts({
      type: "confirm",
      name: "optedIn",
      message: customMessage || defaultMessage,
      initial: true,
    })

    this.globalConfig.optedIn = optedIn
    this.globalConfig.firstRun = false
    this.globalConfig.userId = uuidv4()
    this.localConfig.projectId = md5(this.garden.projectName)

    await this.globalConfigStore.set([globalConfigKeys.analytics], this.globalConfig)
    await this.localConfigStore.set([localConfigKeys.analytics], this.localConfig)

    if (this.segment && this.globalConfig.optedIn) {
      this.segment.identify({
        userId: this.globalConfig.userId,
        traits: {
          platform: platform(),
          platformVersion: release(),
          gardenVersion: getPackageVersion(),
        },
      })
    }
  }
}
