/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import * as uuidv4 from "uuid/v4"
import md5 = require("md5")
import segmentClient = require("analytics-node")
import { platform, release } from "os"
import ci = require("ci-info")

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
import { Logger, getLogger } from "../logger/logger"
import inquirer = require("inquirer")
import { SEGMENT_PROD_API_KEY, SEGMENT_DEV_API_KEY } from "../constants"

const API_KEY = process.env.ANALYTICS_DEV ? SEGMENT_DEV_API_KEY : SEGMENT_PROD_API_KEY

export enum AnalyticsType {
  COMMAND = "Run Command",
  TASK = "Run Task",
  CALL_API = "Dashboard Api call",
}

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
export interface AnalyticsApiEventProperties extends AnalyticsEventProperties {
  path: string
  command: string
}
export interface ApiRequestBody {
  command: string
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
  private logger: Logger
  private globalConfig: AnalyticsGlobalConfig
  private localConfig: AnalyticsLocalConfig
  private globalConfigStore: GlobalConfigStore
  private localConfigStore: LocalConfigStore
  private systemConfig: SystemInfo

  constructor(garden: Garden) {
    // { flushAt: 1 } means the client will track events as soon as they are created
    // no batching is occurring: this will change once the daemon is implemented
    this.segment = new segmentClient(API_KEY, { flushAt: 1 })
    this.garden = garden
    this.logger = getLogger()
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
        this.logger.stop()
        this.localConfig.projectId = md5(this.garden.projectName)
        this.globalConfig = {
          firstRun: false,
          userId: uuidv4(),
          optedIn: await this.promptAnalytics(),
        }

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
    return this
  }

  hasOptedIn(): boolean {
    return this.globalConfig.optedIn || false
  }

  async setAnalyticsOptIn(isOptedIn: boolean) {
    this.globalConfig.optedIn = isOptedIn
    await this.globalConfigStore.set([globalConfigKeys.analytics, "optedIn"], isOptedIn)
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
    return this.track({
      type: AnalyticsType.COMMAND,
      properties: {
        name: commandName,
        projectId: this.localConfig.projectId,
        system: this.systemConfig,
      },
    })
  }

  async trackTask(taskName: string, taskType: string) {
    const properties: AnalyticsTaskEventProperties = {
      name: taskType,
      taskName: md5(taskName),
      projectId: this.localConfig.projectId,
      system: this.systemConfig,
    }

    return this.track({
      type: AnalyticsType.TASK,
      properties,
    })
  }

  async trackApi(method: string, path: string, body: ApiRequestBody) {
    const properties: AnalyticsApiEventProperties = {
      name: `${method} request`,
      path,
      command: body.command,
      projectId: this.localConfig.projectId,
      system: this.systemConfig,
    }

    return this.track({
      type: AnalyticsType.CALL_API,
      properties,
    })
  }

  private async promptAnalytics() {

    const defaultMessage = dedent`
      Thanks for installing Garden! We work hard to provide you the best experience we can
      and it would help us a lot if we could collect some anonymous analytics while you use Garden.
      Are you ok with us collecting anonymized data about your CLI usage?

    `
    const ans: any = await inquirer.prompt({
      name: "continue",
      message: defaultMessage,
    })

    return ans.continue.startsWith("y")

  }
}
