/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import codenamize = require("@codenamize/codenamize")
import segmentClient = require("analytics-node")
import { platform, release } from "os"
import ci = require("ci-info")
import { uniq } from "lodash"
import { globalConfigKeys, AnalyticsGlobalConfig, GlobalConfigStore, GlobalConfig } from "../config-store"
import { getPackageVersion, uuidv4, sleep } from "../util/util"
import { SEGMENT_PROD_API_KEY, SEGMENT_DEV_API_KEY, gardenEnv } from "../constants"
import { LogEntry } from "../logger/log-entry"
import hasha = require("hasha")
import { Garden } from "../garden"
import { AnalyticsType } from "./analytics-types"
import dedent from "dedent"
import { getGitHubUrl } from "../docs/common"
import { Profile } from "../util/profiling"

const API_KEY = process.env.ANALYTICS_DEV ? SEGMENT_DEV_API_KEY : SEGMENT_PROD_API_KEY

const CI_USER = "ci-user"
const UNKNOWN = "unkown"

/**
 * Returns userId from global config if set and if not in CI.
 */
export function getUserId(globalConfig: GlobalConfig) {
  if (ci.isCI) {
    return CI_USER
  } else {
    return globalConfig.analytics?.userId || UNKNOWN
  }
}

interface SystemInfo {
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

interface AnalyticsEventProperties {
  projectId: string
  projectIdV2: string
  projectName: string
  projectNameV2: string
  enterpriseProjectId?: string
  enterpriseProjectIdV2?: string
  enterpriseDomain?: string
  enterpriseDomainV2?: string
  isLoggedIn: boolean
  ciName: string | null
  system: SystemInfo
  isCI: boolean
  sessionId: string
  projectMetadata: ProjectMetadata
}

interface AnalyticsCommandEventProperties extends AnalyticsEventProperties {
  name: string
}

interface AnalyticsApiEventProperties extends AnalyticsEventProperties {
  path: string
  command: string
  name: string
}

interface AnalyticsConfigErrorProperties extends AnalyticsEventProperties {
  moduleType: string
}

interface AnalyticsProjectErrorProperties extends AnalyticsEventProperties {
  fields: Array<string>
}

interface AnalyticsValidationErrorProperties extends AnalyticsEventProperties {
  fields: Array<string>
}

interface ApiRequestBody {
  command: string
}

interface AnalyticsEvent {
  type: AnalyticsType
  properties: AnalyticsEventProperties
}

export interface SegmentEvent {
  userId: string
  event: AnalyticsType
  properties: AnalyticsEventProperties
}

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
@Profile()
export class AnalyticsHandler {
  private static instance?: AnalyticsHandler
  private segment: any
  private log: LogEntry
  private analyticsConfig: AnalyticsGlobalConfig
  private globalConfigStore: GlobalConfigStore
  private projectId = ""
  private projectName = ""
  private projectIdV2 = ""
  private projectNameV2 = ""
  private enterpriseProjectId?: string
  private enterpriseDomain?: string
  private enterpriseProjectIdV2?: string
  private enterpriseDomainV2?: string
  private isLoggedIn: boolean
  private ciName = ci.name
  private systemConfig: SystemInfo
  private isCI = ci.isCI
  private sessionId: string
  private pendingEvents: Map<string, SegmentEvent>
  protected garden: Garden
  private projectMetadata: ProjectMetadata

  private constructor(garden: Garden, log: LogEntry) {
    this.segment = new segmentClient(API_KEY, { flushAt: 20, flushInterval: 300 })
    this.log = log
    this.garden = garden
    this.sessionId = garden.sessionId
    this.isLoggedIn = !!garden.enterpriseApi
    this.globalConfigStore = new GlobalConfigStore()
    // Events that are queued or flushed but the network response hasn't returned
    this.pendingEvents = new Map()
    this.analyticsConfig = {
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

  static clearInstance() {
    AnalyticsHandler.instance = undefined
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
    this.analyticsConfig = {
      ...this.analyticsConfig,
      ...globalConf.analytics,
    }

    const originName = await this.garden.vcs.getOriginName(this.log)

    const projectName = this.garden.projectName
    this.projectName = this.hash(projectName)
    this.projectNameV2 = this.hashV2(projectName)

    const projectId = originName || this.projectName
    this.projectId = this.hash(projectId)
    this.projectIdV2 = this.hashV2(projectId)

    // The enterprise project ID is the UID for this project in Garden Enterprise that the user puts
    // in the project level Garden configuration. Not to be confused with the anonymized project ID we generate from
    // the project name for the purpose of analytics.
    const enterpriseProjectId = this.garden.projectId
    if (enterpriseProjectId) {
      this.enterpriseProjectId = this.hash(enterpriseProjectId)
      this.enterpriseProjectIdV2 = this.hashV2(enterpriseProjectId)
    }
    const enterpriseDomain = this.garden.enterpriseDomain
    if (enterpriseDomain) {
      this.enterpriseDomain = this.hash(enterpriseDomain)
      this.enterpriseDomainV2 = this.hashV2(enterpriseDomain)
    }

    const gitHubUrl = getGitHubUrl("README.md#Analytics")
    if (this.analyticsConfig.firstRun || this.analyticsConfig.showOptInMessage) {
      const analyticsEnabled = this.analyticsEnabled()

      if (!this.isCI && analyticsEnabled) {
        const msg = dedent`
          Thanks for installing Garden! We work hard to provide you with the best experience we can. We collect some anonymized usage data while you use Garden. If you'd like to know more about what we collect or if you'd like to opt out of telemetry, please read more at ${gitHubUrl}
        `
        this.log.info({ symbol: "info", msg })
      }

      this.analyticsConfig = {
        firstRun: false,
        userId: this.analyticsConfig.userId || uuidv4(),
        optedIn: true,
        showOptInMessage: false,
      }

      await this.globalConfigStore.set([globalConfigKeys.analytics], this.analyticsConfig)

      if (this.segment && analyticsEnabled) {
        const userId = getUserId({ analytics: this.analyticsConfig })
        const userIdV2 = this.hashV2(userId)
        this.segment.identify({
          userId,
          traits: {
            userIdV2,
            platform: platform(),
            platformVersion: release(),
            gardenVersion: getPackageVersion(),
            isCI: this.isCI,
          },
        })
      }
    }

    this.projectMetadata = await this.generateProjectMetadata()

    return this
  }

  /**
   * Prepend a human readable string to the hashed value to make anonymized IDs easier to recognise.
   * This readable string consists of two adjectives, followed by a noun.
   *
   * Also truncates the hash part to 32 char (from 128).
   *
   * Example: dysfunctional-graceful-request_433c84996726070996f369dfc00dd202
   */
  public hashV2(val: string) {
    const readable = codenamize({ seed: val, adjectiveCount: 2 })
    const hash = this.hash(val).slice(0, 32)
    return `${readable}_${hash}`
  }

  public hash(val: string) {
    return hasha(val, { algorithm: "sha512" })
  }

  static async refreshGarden(garden: Garden) {
    if (AnalyticsHandler.instance) {
      AnalyticsHandler.instance.garden = garden
    }
  }

  /**
   * Used internally to check if a users has opted-in or not.
   */
  private analyticsEnabled(): boolean {
    if (gardenEnv.GARDEN_DISABLE_ANALYTICS) {
      return false
    }
    return this.analyticsConfig.optedIn || false
  }

  /**
   * Returns some Project metadata to be used on each event.
   *
   * eg. number of modules, types of modules, number of tests, etc.
   */
  private async generateProjectMetadata(): Promise<ProjectMetadata> {
    const moduleConfigs = await this.garden.getRawModuleConfigs()

    const count = (key: string) => moduleConfigs.flatMap((c) => c.spec[key]).filter((spec) => !!spec).length

    return {
      modulesCount: moduleConfigs.length,
      moduleTypes: uniq(moduleConfigs.map((c) => c.type)),
      tasksCount: count("tasks"),
      servicesCount: count("services"),
      testsCount: count("tests"),
    }
  }

  /**
   * Returns some common metadata to be used on each event.
   */
  private getBasicAnalyticsProperties(): AnalyticsEventProperties {
    return {
      projectId: this.projectId,
      projectIdV2: this.projectIdV2,
      projectName: this.projectName,
      projectNameV2: this.projectNameV2,
      enterpriseProjectId: this.enterpriseProjectId,
      enterpriseProjectIdV2: this.enterpriseProjectIdV2,
      enterpriseDomain: this.enterpriseDomain,
      enterpriseDomainV2: this.enterpriseDomainV2,
      isLoggedIn: this.isLoggedIn,
      ciName: this.ciName,
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
    this.analyticsConfig.optedIn = isOptedIn
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
  private track(event: AnalyticsEvent) {
    if (this.segment && this.analyticsEnabled()) {
      const segmentEvent: SegmentEvent = {
        userId: getUserId({ analytics: this.analyticsConfig }),
        event: event.type,
        properties: {
          ...this.getBasicAnalyticsProperties(),
          ...event.properties,
        },
      }

      const eventUid = uuidv4()
      this.pendingEvents.set(eventUid, segmentEvent)
      this.segment.track(segmentEvent, (err: any) => {
        this.pendingEvents.delete(eventUid)
        this.log.silly(dedent`Tracking ${segmentEvent.event} event.
          Payload:
            ${JSON.stringify(segmentEvent)}
        `)
        if (err && this.log) {
          this.log.debug(`Error sending ${segmentEvent.event} tracking event: ${err}`)
        }
      })
      return event
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
   * Flushes the event queue and waits if there are still pending events after flushing.
   * This can happen if Segment has already flushed, which means the queue is empty and segment.flush()
   * will return immediately.
   *
   * Waits for 2000 ms at most if there are still pending events.
   * That should be enough time for a network request to fire, even if we don't wait for the response.
   *
   * @returns
   * @memberof AnalyticsHandler
   */
  async flush() {
    if (!this.analyticsEnabled()) {
      return
    }

    // This is to handle an edge case where Segment flushes the events (e.g. at the interval) and
    // Garden exits at roughly the same time. When that happens, `segment.flush()` will return immediately since
    // the event queue is already empty. However, the network request might not have fired and the events are
    // dropped if Garden exits before the request gets the chance to. We therefore wait until
    // `pendingEvents.size === 0` or until we time out.
    const waitForPending = async (retry: number = 0) => {
      // Wait for 500 ms, for 3 retries at most, or a total of 2000 ms.
      await sleep(500)
      if (this.pendingEvents.size === 0 || retry >= 3) {
        if (this.pendingEvents.size > 0) {
          const pendingEvents = Array.from(this.pendingEvents.values())
            .map((event) => event.event)
            .join(", ")
          this.log.debug(`Timed out while waiting for events to flush: ${pendingEvents}`)
        }
        return
      } else {
        return waitForPending(retry + 1)
      }
    }

    await this.segmentFlush()

    if (this.pendingEvents.size === 0) {
      // We're done
      return
    } else {
      // There are still pending events that we're waiting for
      return waitForPending()
    }
  }

  private async segmentFlush() {
    return new Promise((resolve) => {
      this.segment.flush((err, _data) => {
        if (err && this.log) {
          this.log.debug(`Error flushing analytics: ${err}`)
        }
        resolve({})
      })
    })
  }
}
