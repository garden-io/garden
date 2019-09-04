/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import uuidv4 from "uuid/v4"
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
  CALL_API = "Call API",
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
  type: AnalyticsType
  properties: AnalyticsEventProperties
}

export interface SegmentEvent {
  userId: string
  event: AnalyticsType
  properties: AnalyticsEventProperties
}

/**
 * A Segment client wrapper with utility functionalities like local and global config and info,
 * prompt for opt-in/opt-out and wrappers for single events.
 *
 * Usage:
 *
 * const analyticsClient = await new Analytics(garden: Garden).init()
 * analyticsClient.trackCommand(commandName)
 *
 * @export
 * @class Analytics
 */
export class AnalyticsHandler {
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
    this.localConfig = {
      projectId: "",
    }
    this.systemConfig = {
      platform: platform(),
      platformVersion: release(),
      gardenVersion: getPackageVersion().toString(),
    }
  }

  /**
   * A factory function which returns an initialized Analytics object, ready to be used.
   * This function will load global and local config stores and update them if needed.
   * The globalConfigStore contains info about optIn, first run, machine info, etc., while
   * the localStore contains info about the project.
   * If the Analytics has never been initalized, this function will prompt the user to ask
   * permission for the collection of the data. This method always needs to be called after
   * instantiation.
   *
   * @returns
   * @memberof Analytics
   */
  async init() {
    if (ci.isCI) {
      return this
    }
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
    return this
  }

  hasOptedIn(): boolean {
    return this.globalConfig.optedIn || false
  }

  /**
   * It sets the optedIn property in the globalConfigStore.
   * This is the property checked to decide if an event should be tracked or not.
   *
   * @param {boolean} isOptedIn
   * @memberof Analytics
   */
  async setAnalyticsOptIn(isOptedIn: boolean) {
    this.globalConfig.optedIn = isOptedIn
    await this.globalConfigStore.set([globalConfigKeys.analytics, "optedIn"], isOptedIn)
  }

  /**
   * The actual segment track method.
   *
   * @private
   * @param {AnalyticsEvent} event The event to track
   * @returns
   * @memberof Analytics
   */
  private track(event: AnalyticsEvent) {
    if (this.segment && this.hasOptedIn() && !ci.isCI) {
      const segmentEvent: SegmentEvent = {
        userId: this.globalConfig.userId,
        event: event.type,
        properties: {
          ...event.properties,
        },
      }

      const trackToRemote = (eventToTrack: SegmentEvent) => {
        this.segment.track(eventToTrack, (err) => {
          if (err) {
            this.garden.log.debug(`Error sending tracking event: ${err}`)
          }
        })
      }

      return trackToRemote(segmentEvent)
    }
    return false
  }

  /**
   * Tracks a Command.
   *
   * @param {string} commandName The name of the command
   * @returns
   * @memberof Analytics
   */
  trackCommand(commandName: string) {
    return this.track({
      type: AnalyticsType.COMMAND,
      properties: {
        name: commandName,
        projectId: this.localConfig.projectId,
        system: this.systemConfig,
      },
    })
  }

  /**
   * Tracks a Garden Task. The taskName is hashed since it could contain sensitive information
   *
   * @param {string} taskName The name of the Task. Usually in the format '<taskType>.<moduleName>'
   * @param {string} taskType The type of the Task
   * @returns
   * @memberof Analytics
   */
  trackTask(taskName: string, taskType: string) {
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

  /**
   *  Tracks an Api call generated from within the Dashboard.
   *
   * @param {string} method The HTTP method of the request
   * @param {string} path The path of the request
   * @param {ApiRequestBody} body The body of the request.
   * NOTE: for privacy issues we only collect the 'command' from the body
   * @returns
   * @memberof Analytics
   */
  trackApi(method: string, path: string, body: ApiRequestBody) {
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

  /**
   * Prompts the user to ask to opt-in the analytics collection
   *
   * @private
   * @returns the user answer (boolean)
   * @memberof Analytics
   */
  private async promptAnalytics() {
    const defaultMessage = dedent`
      Thanks for installing Garden! We work hard to provide you with the best experience we can.
      It would help us a lot if we could collect some anonymous analytics while you use Garden.
      You can read more about what we collect at https://github.com/garden-io/garden/blob/master/README.md#Analytics

      Are you OK with us collecting anonymized data about your CLI usage? (Y/n)

    `
    const ans: any = await inquirer.prompt({
      name: "continue",
      message: defaultMessage,
    })

    return ans.continue.startsWith("y")
  }
}
