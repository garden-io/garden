/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import uuidv4 from "uuid/v4"
import segmentClient = require("analytics-node")
import { platform, release } from "os"
import ci = require("ci-info")
import { flatten } from "lodash"
import { globalConfigKeys, AnalyticsGlobalConfig, GlobalConfigStore } from "../config-store"
import { getPackageVersion } from "../util/util"
import { SEGMENT_PROD_API_KEY, SEGMENT_DEV_API_KEY } from "../constants"
import { LogEntry } from "../logger/log-entry"
import hasha = require("hasha")
import uuid from "uuid"
import { Garden } from "../garden"
import { Events, EventName } from "../events"
import { AnalyticsType } from "./analytics-types"
import dedent from "dedent"

const API_KEY = process.env.ANALYTICS_DEV ? SEGMENT_DEV_API_KEY : SEGMENT_PROD_API_KEY

export interface SystemInfo {
  gardenVersion: string
  platform: string
  platformVersion: string
}

// Note that we pluralise the entity names in the count fields (e.g. modulesCount, tasksCount).
// This is for consistency for when we add fields like modules, tasks, etc.
interface ProjectMetadata {
  modulesCount: number
  tasksCount: number
  servicesCount: number
  testsCount: number
  moduleTypes: string[]
}

export interface AnalyticsEventProperties {
  projectId: string
  projectName: string
  system: SystemInfo
  isCI: boolean
  sessionId: string
  projectMetadata: ProjectMetadata
}

export interface AnalyticsCommandEventProperties extends AnalyticsEventProperties {
  name: string
}

export interface AnalyticsTaskEventProperties extends AnalyticsEventProperties {
  batchId: string
  taskType: string
  taskName: string
  taskStatus: string
}
export interface AnalyticsApiEventProperties extends AnalyticsEventProperties {
  path: string
  command: string
  name: string
}

export interface AnalyticsConfigErrorProperties extends AnalyticsEventProperties {
  moduleType: string
}

export interface AnalyticsProjectErrorProperties extends AnalyticsEventProperties {
  fields: Array<string>
}

export interface AnalyticsValidationErrorProperties extends AnalyticsEventProperties {
  fields: Array<string>
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

type SupportedEvents = Events["taskPending"] | Events["taskProcessing"] | Events["taskComplete"] | Events["taskError"]

/**
 * A Segment client wrapper with utility functionalities global config and info,
 * prompt for opt-in/opt-out and wrappers for single events.
 *
 * Initalization:
 * const analyticsClient = await AnalyticsHanlder.init(garden: Garden, log: LogEntry)
 * analyticsClient.trackCommand(commandName)
 *
 * Subsequent usage:
 * const analyticsClient = AnalyticsHanlder.getInstance()
 * analyticsClient.trackCommand(commandName)
 *
 * @export
 * @class AnalyticsHandler
 */
export class AnalyticsHandler {
  private static instance: AnalyticsHandler
  private segment: any
  private log: LogEntry
  private globalConfig: AnalyticsGlobalConfig
  private globalConfigStore: GlobalConfigStore
  private projectId = ""
  private projectName = ""
  private systemConfig: SystemInfo
  private isCI = ci.isCI
  private sessionId = uuid.v4()
  protected garden: Garden
  private projectMetadata: ProjectMetadata

  private constructor(garden: Garden, log: LogEntry) {
    this.segment = new segmentClient(API_KEY, { flushAt: 20, flushInterval: 300 })
    this.log = log
    this.garden = garden
    this.globalConfigStore = new GlobalConfigStore()
    this.globalConfig = {
      userId: "",
      firstRun: true,
      optedIn: false,
      showOptInMessage: true,
    }

    this.systemConfig = {
      platform: platform(),
      platformVersion: release(),
      gardenVersion: getPackageVersion().toString(),
    }
  }

  static async init(garden: Garden, log: LogEntry) {
    if (!AnalyticsHandler.instance) {
      AnalyticsHandler.instance = await new AnalyticsHandler(garden, log).factory()
    } else {
      /**
       * This init is called from within the do while loop in the cli
       * If the instance is already present it means a restart happened and we need to
       * refresh the garden instance and event listeners.
       */
      await AnalyticsHandler.refreshGarden(garden)
    }
    return AnalyticsHandler.instance
  }

  static getInstance(): AnalyticsHandler {
    if (!AnalyticsHandler.instance) {
      throw Error("Analytics not initialized. Init first")
    }
    return AnalyticsHandler.instance
  }

  /**
   * A private initialization function which returns an initialized Analytics object, ready to be used.
   * This function will load the globalConfigStore and update it if needed.
   * The globalConfigStore contains info about optIn, first run, machine info, etc.,
   * This method always needs to be called after instantiation.
   *
   * @returns
   * @memberof AnalyticsHandler
   */
  private async factory() {
    const globalConf = await this.globalConfigStore.get()
    this.globalConfig = {
      ...this.globalConfig,
      ...globalConf.analytics,
    }

    const originName = await this.garden.vcs.getOriginName(this.log)
    this.projectName = hasha(this.garden.projectName, { algorithm: "sha256" })
    this.projectId = originName ? hasha(originName, { algorithm: "sha256" }) : this.projectName

    if (this.globalConfig.firstRun || this.globalConfig.showOptInMessage) {
      if (!this.isCI) {
        const msg = dedent`
          Thanks for installing Garden! We work hard to provide you with the best experience we can. We collect some anonymized usage data while you use Garden. If you'd like to know more about what we collect or if you'd like to opt out of telemetry, please read more at https://github.com/garden-io/garden/blob/master/README.md#Analytics
        `
        this.log.info({ symbol: "info", msg })
      }

      this.globalConfig = {
        firstRun: false,
        userId: this.globalConfig.userId || uuidv4(),
        optedIn: true,
        showOptInMessage: false,
      }

      await this.globalConfigStore.set([globalConfigKeys.analytics], this.globalConfig)

      if (this.segment && this.globalConfig.optedIn) {
        this.segment.identify({
          userId: this.globalConfig.userId,
          traits: {
            platform: platform(),
            platformVersion: release(),
            gardenVersion: getPackageVersion(),
            isCI: this.isCI,
          },
        })
      }
    }
    // Subscribe to the TaskGraph events
    this.garden.events.onAny((name, payload) => this.processEvent(name, payload))

    this.projectMetadata = await this.generateProjectMetadata()

    return this
  }

  /**
   * Handler used internally to process the TaskGraph events.
   */
  private async processEvent<T extends EventName>(name: T, payload: Events[T]) {
    if (AnalyticsHandler.isSupportedEvent(name, payload)) {
      await this.trackTask(payload.batchId, payload.name, payload.type, name)
    }
  }

  static async refreshGarden(garden: Garden) {
    AnalyticsHandler.instance.garden = garden
    AnalyticsHandler.instance.garden.events.onAny((name, payload) =>
      AnalyticsHandler.instance.processEvent(name, payload)
    )
  }

  /**
   * Typeguard to check wether we can process or not an event
   */
  static isSupportedEvent(name: EventName, _event: Events[EventName]): _event is SupportedEvents {
    const supportedEventsKeys = ["taskPending", "taskProcessing", "taskComplete", "taskError"]
    return supportedEventsKeys.includes(name)
  }

  /**
   * Used internally to check if a users has opted-in or not.
   */
  private hasOptedIn(): boolean {
    return this.globalConfig.optedIn || false
  }

  /**
   * Returns some Project metadata to be used on each event.
   *
   * eg. number of modules, types of modules, number of tests, etc.
   */
  private async generateProjectMetadata(): Promise<ProjectMetadata> {
    const configGraph = await this.garden.getConfigGraph(this.log)
    const modules = await configGraph.getModules()
    const moduleTypes = [...new Set(modules.map((m) => m.type))]

    const tasks = await configGraph.getTasks()
    const services = await configGraph.getServices()
    const tests = modules.map((m) => m.testConfigs)
    const testsCount = flatten(tests).length

    return {
      modulesCount: modules.length,
      moduleTypes,
      tasksCount: tasks.length,
      servicesCount: services.length,
      testsCount,
    }
  }

  /**
   * Returns some common metadata to be used on each event.
   */
  private getBasicAnalyticsProperties(): AnalyticsEventProperties {
    return {
      projectId: this.projectId,
      projectName: this.projectName,
      system: this.systemConfig,
      isCI: this.isCI,
      sessionId: this.sessionId,
      projectMetadata: this.projectMetadata,
    }
  }

  /**
   * It sets the optedIn property in the globalConfigStore.
   * This is the property checked to decide if an event should be tracked or not.
   *
   * @param {boolean} isOptedIn
   * @memberof AnalyticsHandler
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
   * @memberof AnalyticsHandler
   */
  private async track(event: AnalyticsEvent) {
    if (this.segment && this.hasOptedIn()) {
      const segmentEvent: SegmentEvent = {
        userId: this.globalConfig.userId || "unknown",
        event: event.type,
        properties: {
          ...this.getBasicAnalyticsProperties(),
          ...event.properties,
        },
      }

      // NOTE: We need to wrap the track method in a Promise because of the race condition
      // when tracking flushing the first event. See: https://github.com/segmentio/analytics-node/issues/219
      const trackToRemote = (eventToTrack: SegmentEvent) => {
        return new Promise((resolve) => {
          this.segment.track(eventToTrack, (err) => {
            if (err && this.log) {
              this.log.debug(`Error sending tracking event: ${err}`)
            }
            resolve(true)
          })
        })
      }

      return await trackToRemote(segmentEvent)
    }
    return false
  }

  /**
   * Tracks a Command.
   *
   * @param {string} commandName The name of the command
   * @returns
   * @memberof AnalyticsHandler
   */
  trackCommand(commandName: string) {
    return this.track({
      type: AnalyticsType.COMMAND,
      properties: <AnalyticsCommandEventProperties>{
        name: commandName,
        ...this.getBasicAnalyticsProperties(),
      },
    })
  }

  /**
   * Tracks a Garden Task. The taskName is hashed since it could contain sensitive information
   *
   * @param {string} batchId An id representing the current TaskGraph execution batch
   * @param {string} taskName The name of the Task. Usually in the format '<taskType>.<moduleName>'
   * @param {string} taskType The type of the Task
   * @param {string} taskStatus the status of the task: "taskPending", "taskProcessing", "taskComplete" or "taskError"
   * @returns
   * @memberof AnalyticsHandler
   */
  trackTask(batchId: string, taskName: string, taskType: string, taskStatus: string) {
    const hashedTaskName = hasha(taskName, { algorithm: "sha256" })
    const properties: AnalyticsTaskEventProperties = {
      batchId,
      taskName: hashedTaskName,
      taskType,
      ...this.getBasicAnalyticsProperties(),
      taskStatus,
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
   * @memberof AnalyticsHandler
   */
  trackApi(method: string, path: string, body: ApiRequestBody) {
    const properties: AnalyticsApiEventProperties = {
      name: `${method} request`,
      path,
      command: body.command,
      ...this.getBasicAnalyticsProperties(),
    }

    return this.track({
      type: AnalyticsType.CALL_API,
      properties,
    })
  }

  /**
   *  Tracks a Garden Module configuration error
   *
   * @param {string} moduleType The type of the module causing the configuration error
   * @returns
   * @memberof AnalyticsHandler
   */
  trackModuleConfigError(name: string, moduleType: string) {
    const moduleName = hasha(name, { algorithm: "sha256" })
    return this.track(<AnalyticsEvent>{
      type: AnalyticsType.MODULE_CONFIG_ERROR,
      properties: <AnalyticsConfigErrorProperties>{
        ...this.getBasicAnalyticsProperties(),
        moduleName,
        moduleType,
      },
    })
  }

  /**
   *  Tracks a Project configuration error
   *
   * @param {Array<string>} fields The fields containing the errors
   * @returns
   * @memberof AnalyticsHandler
   */
  trackProjectConfigError(fields: Array<string>) {
    return this.track({
      type: AnalyticsType.PROJECT_CONFIG_ERROR,
      properties: <AnalyticsProjectErrorProperties>{
        ...this.getBasicAnalyticsProperties(),
        fields,
      },
    })
  }

  /**
   *  Tracks a generic configuration error
   *
   * @param {Array<string>} fields The fields containing the errors
   * @returns
   * @memberof AnalyticsHandler
   */
  trackConfigValidationError(fields: Array<string>) {
    return this.track({
      type: AnalyticsType.VALIDATION_ERROR,
      properties: <AnalyticsValidationErrorProperties>{
        ...this.getBasicAnalyticsProperties(),
        fields,
      },
    })
  }

  /**
   *  Make sure the Segment client flushes the events queue
   *
   * @returns
   * @memberof AnalyticsHandler
   */
  flush() {
    return new Promise((resolve) =>
      this.segment.flush((err, _data) => {
        if (err && this.log) {
          this.log.debug(`Error flushing analytics: ${err}`)
        }
        resolve()
      })
    )
  }
}
