/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import codenamize = require("@codenamize/codenamize")
import { platform, release } from "os"
import ci = require("ci-info")
import { isEmpty, uniq } from "lodash"
import { globalConfigKeys, AnalyticsGlobalConfig } from "../config-store"
import { getPackageVersion, uuidv4, sleep } from "../util/util"
import { SEGMENT_PROD_API_KEY, SEGMENT_DEV_API_KEY, gardenEnv } from "../constants"
import { LogEntry } from "../logger/log-entry"
import hasha = require("hasha")
import { Garden } from "../garden"
import { AnalyticsType } from "./analytics-types"
import dedent from "dedent"
import { getGitHubUrl } from "../docs/common"
import { Profile } from "../util/profiling"
import { ModuleConfig } from "../config/module"
import { UserResult } from "@garden-io/platform-api-types"

const API_KEY = process.env.ANALYTICS_DEV ? SEGMENT_DEV_API_KEY : SEGMENT_PROD_API_KEY
const CI_USER = "ci-user"

/**
 * Helper function for counting the number of tasks, tests, etc in module configs
 */
function countActions(moduleConfigs: ModuleConfig[], key: "tasks" | "services" | "tests") {
  return moduleConfigs.flatMap((c) => c.spec[key]).filter((spec) => !!spec).length
}

/**
 * Helper function for getting the anonymous user ID.
 * It reads the ID from config or creates a new one.
 *
 * Extracted to a dedicated function mostly for ease of testing.
 */
export function getAnonymousUserId({
  analyticsConfig,
  isCi,
}: {
  analyticsConfig?: AnalyticsGlobalConfig
  isCi: boolean
}) {
  if (analyticsConfig?.anonymousUserId) {
    return analyticsConfig.anonymousUserId
  } else if (isCi) {
    return CI_USER
  } else {
    return uuidv4()
  }
}

/**
 * A recurring user is a user that is using Garden again after 12 hours
 * or more since first run.
 */
function getIsRecurringUser(firstRunAt: string, latestRunAt: string) {
  const msInHour = 60 * 60 * 1000
  const t1 = new Date(firstRunAt).getTime()
  const t2 = new Date(latestRunAt).getTime()
  const hoursSinceFirstRun = Math.abs(t1 - t2) / msInHour
  return hoursSinceFirstRun > 12
}

interface CiInfo {
  isCi: boolean
  ciName: string | null
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

interface PropertiesBase {
  projectId: string
  projectIdV2: string
  projectName: string
  projectNameV2: string
  enterpriseProjectId?: string
  enterpriseProjectIdV2?: string
  enterpriseDomain?: string
  enterpriseDomainV2?: string
  isLoggedIn: boolean
  cloudUserId?: string
  customer?: string
  ciName: string | null
  system: SystemInfo
  isCI: boolean
  sessionId: string
  projectMetadata: ProjectMetadata
  firstRunAt: string
  latestRunAt: string
  isRecurringUser: boolean
}

interface EventBase {
  type: AnalyticsType
  properties: PropertiesBase
}

interface CommandEvent extends EventBase {
  type: AnalyticsType.COMMAND
  properties: PropertiesBase & {
    name: string
  }
}

interface ApiEvent extends EventBase {
  type: AnalyticsType.CALL_API
  properties: PropertiesBase & {
    path: string
    command: string
    name: string
  }
}

interface ConfigErrorEvent extends EventBase {
  type: AnalyticsType.MODULE_CONFIG_ERROR
  properties: PropertiesBase & {
    moduleName: string
    moduleType: string
  }
}

interface ProjectErrorEvent extends EventBase {
  type: AnalyticsType.PROJECT_CONFIG_ERROR
  properties: PropertiesBase & {
    fields: Array<string>
  }
}

interface ValidationErrorEvent extends EventBase {
  type: AnalyticsType.VALIDATION_ERROR
  properties: PropertiesBase & {
    fields: Array<string>
  }
}

interface IdentifyEvent {
  userId?: string
  anonymousId: string
  traits: {
    userIdV2: string
    customer?: string
    platform: string
    platformVersion: string
    gardenVersion: string
    isCI: boolean
    firstRunAt: string
    latestRunAt: string
    isRecurringUser: boolean
  }
}

interface ApiRequestBody {
  command: string
}

type AnalyticsEvent = CommandEvent | ApiEvent | ConfigErrorEvent | ProjectErrorEvent | ValidationErrorEvent

export interface SegmentEvent {
  userId?: string
  anonymousId?: string
  event: AnalyticsType
  properties: AnalyticsEvent["properties"]
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
 */
@Profile()
export class AnalyticsHandler {
  private static instance?: AnalyticsHandler
  private segment: any // TODO
  private log: LogEntry
  private analyticsConfig: AnalyticsGlobalConfig
  private projectId: string
  private projectName: string
  private projectIdV2: string
  private projectNameV2: string
  private enterpriseProjectId?: string
  private enterpriseDomain?: string
  private enterpriseProjectIdV2?: string
  private enterpriseDomainV2?: string
  private isLoggedIn: boolean
  private cloudUserId?: string
  private cloudCustomerName?: string
  private ciName: string | null
  private systemConfig: SystemInfo
  private isCI: boolean
  private sessionId: string
  private pendingEvents: Map<string, SegmentEvent>
  protected garden: Garden
  private projectMetadata: ProjectMetadata
  public isEnabled: boolean
  private isRecurringUser: boolean

  private constructor({
    garden,
    log,
    analyticsConfig,
    moduleConfigs,
    cloudUser,
    isEnabled,
    ciInfo,
  }: {
    garden: Garden
    log: LogEntry
    analyticsConfig: AnalyticsGlobalConfig
    moduleConfigs: ModuleConfig[]
    isEnabled: boolean
    cloudUser?: UserResult
    ciInfo: CiInfo
  }) {
    const segmentClient = require("analytics-node")
    this.segment = new segmentClient(API_KEY, { flushAt: 20, flushInterval: 300 })
    this.log = log
    this.isEnabled = isEnabled
    this.garden = garden
    this.sessionId = garden.sessionId
    this.isLoggedIn = !!garden.cloudApi
    // Events that are queued or flushed but the network response hasn't returned
    this.pendingEvents = new Map()

    this.analyticsConfig = analyticsConfig
    this.projectMetadata = {
      modulesCount: moduleConfigs.length,
      moduleTypes: uniq(moduleConfigs.map((c) => c.type)),
      tasksCount: countActions(moduleConfigs, "tasks"),
      servicesCount: countActions(moduleConfigs, "services"),
      testsCount: countActions(moduleConfigs, "tests"),
    }
    this.systemConfig = {
      platform: platform(),
      platformVersion: release(),
      gardenVersion: getPackageVersion().toString(),
    }

    this.isCI = ciInfo.isCi
    this.ciName = ciInfo.ciName

    const originName = this.garden.vcsInfo.originUrl

    const projectName = this.garden.projectName
    this.projectName = AnalyticsHandler.hash(projectName)
    this.projectNameV2 = AnalyticsHandler.hashV2(projectName)

    const projectId = originName || this.projectName
    this.projectId = AnalyticsHandler.hash(projectId)
    this.projectIdV2 = AnalyticsHandler.hashV2(projectId)

    // The enterprise project ID is the UID for this project in Garden Cloud that the user puts
    // in the project level Garden configuration. Not to be confused with the anonymized project ID we generate from
    // the project name for the purpose of analytics.
    const enterpriseProjectId = this.garden.projectId
    if (enterpriseProjectId) {
      this.enterpriseProjectId = AnalyticsHandler.hash(enterpriseProjectId)
      this.enterpriseProjectIdV2 = AnalyticsHandler.hashV2(enterpriseProjectId)
    }

    const enterpriseDomain = this.garden.enterpriseDomain
    if (enterpriseDomain) {
      this.enterpriseDomain = AnalyticsHandler.hash(enterpriseDomain)
      this.enterpriseDomainV2 = AnalyticsHandler.hashV2(enterpriseDomain)
    }

    if (cloudUser) {
      this.cloudUserId = AnalyticsHandler.makeCloudUserId(cloudUser)
      this.cloudCustomerName = cloudUser.organization.name
    }

    this.isRecurringUser = getIsRecurringUser(analyticsConfig.firstRunAt, analyticsConfig.latestRunAt)

    const userIdV2 = AnalyticsHandler.hashV2(analyticsConfig.anonymousUserId)
    this.identify({
      userId: this.cloudUserId,
      anonymousId: analyticsConfig.anonymousUserId,
      traits: {
        userIdV2,
        customer: cloudUser?.organization.name,
        platform: platform(),
        platformVersion: release(),
        gardenVersion: getPackageVersion(),
        isCI: ciInfo.isCi,
        firstRunAt: analyticsConfig.firstRunAt,
        latestRunAt: analyticsConfig.latestRunAt,
        isRecurringUser: this.isRecurringUser,
      },
    })
  }

  static async init(garden: Garden, log: LogEntry) {
    if (!AnalyticsHandler.instance) {
      // We're passing this explictliy to that it's easier to overwrite and test
      // in actual CI.
      const ciInfo = {
        isCi: ci.isCI,
        ciName: ci.name,
      }
      AnalyticsHandler.instance = await AnalyticsHandler.factory({ garden, log, ciInfo })
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
   * A factory function that returns an instance of the Analytics class.
   *
   * Handles async work and calculates values that are set by the contructor itself.
   *
   * It also initializes the analytics config and updates the analytics data we store in local config.
   */
  static async factory({ garden, log, ciInfo }: { garden: Garden; log: LogEntry; ciInfo: CiInfo }) {
    const currentAnalyticsConfig = (await garden.globalConfigStore.get()).analytics
    const isFirstRun = isEmpty(currentAnalyticsConfig)
    const moduleConfigs = await garden.getRawModuleConfigs()

    let cloudUser: UserResult | undefined
    if (garden.cloudApi) {
      try {
        cloudUser = await garden.cloudApi?.getProfile()
      } catch (err) {
        log.debug(`Getting profile from API failed with error: ${err.message}`)
      }
    }

    if (isFirstRun && !ciInfo.isCi) {
      const gitHubUrl = getGitHubUrl("docs/misc/telemetry.md")
      const msg = dedent`
        Thanks for installing Garden! We work hard to provide you with the best experience we can. We collect some anonymized usage data while you use Garden. If you'd like to know more about what we collect or if you'd like to opt out of telemetry, please read more at ${gitHubUrl}
      `
      log.info({ symbol: "info", msg })
    }

    const anonymousUserId = getAnonymousUserId({ analyticsConfig: currentAnalyticsConfig, isCi: ciInfo.isCi })

    let isEnabled: boolean
    // The order of preference is important here, hence the awkward if statements.
    if (gardenEnv.GARDEN_DISABLE_ANALYTICS) {
      isEnabled = false
    } else if (cloudUser) {
      isEnabled = true
    } else if (currentAnalyticsConfig?.optedIn === false) {
      isEnabled = false
    } else {
      isEnabled = true
    }

    const now = new Date().toUTCString()

    const firstRunAt = currentAnalyticsConfig?.firstRunAt || now
    const latestRunAt = now

    const analyticsConfig: AnalyticsGlobalConfig = {
      anonymousUserId,
      firstRunAt,
      latestRunAt,
      optedIn: currentAnalyticsConfig?.optedIn === false ? false : true,
      cloudVersion: currentAnalyticsConfig?.cloudVersion || 0,
      cloudProfileEnabled: !!cloudUser,
    }

    await garden.globalConfigStore.set([globalConfigKeys.analytics], analyticsConfig)

    return new AnalyticsHandler({ garden, log, analyticsConfig, moduleConfigs, cloudUser, isEnabled, ciInfo })
  }

  /**
   * Prepend a human readable string to the hashed value to make anonymized IDs easier to recognise.
   * This readable string consists of two adjectives, followed by a noun.
   *
   * Also truncates the hash part to 32 char (from 128).
   *
   * Example: dysfunctional-graceful-request_433c84996726070996f369dfc00dd202
   */
  static hashV2(val: string) {
    const readable = codenamize({ seed: val, adjectiveCount: 2 })
    const hash = this.hash(val).slice(0, 32)
    return `${readable}_${hash}`
  }

  static hash(val: string) {
    return hasha(val, { algorithm: "sha512" })
  }

  static async refreshGarden(garden: Garden) {
    if (AnalyticsHandler.instance) {
      AnalyticsHandler.instance.garden = garden
    }
  }

  static makeCloudUserId(cloudUser: UserResult) {
    return `${cloudUser.organization.name}_${cloudUser.id}`
  }

  /**
   * Returns some common metadata to be used on each event.
   */
  private getBasicAnalyticsProperties(): PropertiesBase {
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
      customer: this.cloudCustomerName,
      system: this.systemConfig,
      isCI: this.isCI,
      sessionId: this.sessionId,
      projectMetadata: this.projectMetadata,
      firstRunAt: this.analyticsConfig.firstRunAt,
      latestRunAt: this.analyticsConfig.latestRunAt,
      isRecurringUser: this.isRecurringUser,
    }
  }

  /**
   * It sets the optedIn property in the globalConfigStore.
   * This is the property checked to decide if an event should be tracked or not.
   */
  async setAnalyticsOptIn(isOptedIn: boolean) {
    this.analyticsConfig.optedIn = isOptedIn
    await this.garden.globalConfigStore.set([globalConfigKeys.analytics, "optedIn"], isOptedIn)
  }

  /**
   * The actual segment track method.
   */
  private track(event: AnalyticsEvent) {
    if (!this.segment || !this.isEnabled) {
      return false
    }

    const segmentEvent: SegmentEvent = {
      userId: this.cloudUserId,
      anonymousId: this.analyticsConfig.anonymousUserId,
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

  private identify(event: IdentifyEvent) {
    if (!this.segment || !this.isEnabled) {
      return false
    }
    this.segment.identify(event)
    return event
  }

  /**
   * Tracks a Command.
   */
  trackCommand(commandName: string) {
    return this.track({
      type: AnalyticsType.COMMAND,
      properties: {
        name: commandName,
        ...this.getBasicAnalyticsProperties(),
      },
    })
  }

  /**
   * Tracks an Api call generated from within the Dashboard.
   *
   * NOTE: for privacy issues we only collect the 'command' from the body
   */
  trackApi(method: string, path: string, body: ApiRequestBody) {
    const properties = {
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
   * Tracks a Garden Module configuration error
   */
  trackModuleConfigError(name: string, moduleType: string) {
    const moduleName = hasha(name, { algorithm: "sha256" })
    return this.track({
      type: AnalyticsType.MODULE_CONFIG_ERROR,
      properties: {
        ...this.getBasicAnalyticsProperties(),
        moduleName,
        moduleType,
      },
    })
  }

  /**
   * Tracks a Project configuration error
   */
  trackProjectConfigError(fields: Array<string>) {
    return this.track({
      type: AnalyticsType.PROJECT_CONFIG_ERROR,
      properties: {
        ...this.getBasicAnalyticsProperties(),
        fields,
      },
    })
  }

  /**
   * Tracks a generic configuration error
   */
  trackConfigValidationError(fields: Array<string>) {
    return this.track({
      type: AnalyticsType.VALIDATION_ERROR,
      properties: {
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
   */
  async flush() {
    if (!this.isEnabled) {
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
      this.segment.flush((err: any, _data: any) => {
        if (err && this.log) {
          this.log.debug(`Error flushing analytics: ${err}`)
        }
        resolve({})
      })
    })
  }
}
