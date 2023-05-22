/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import codenamize = require("@codenamize/codenamize")
import { platform, release } from "os"
import ci = require("ci-info")
import { uniq } from "lodash"
import { Analytics } from "@segment/analytics-node"
import { AnalyticsGlobalConfig } from "../config-store/global"
import { getPackageVersion, getDurationMsec } from "../util/util"
import { SEGMENT_PROD_API_KEY, SEGMENT_DEV_API_KEY, gardenEnv } from "../constants"
import { Log } from "../logger/log-entry"
import hasha = require("hasha")
import { Garden } from "../garden"
import { AnalyticsCommandResult, AnalyticsEventType } from "./analytics-types"
import dedent from "dedent"
import { getGitHubUrl } from "../docs/common"
import { Profile } from "../util/profiling"
import { ModuleConfig } from "../config/module"
import { UserResult } from "@garden-io/platform-api-types"
import { uuidv4 } from "../util/random"
import { GardenBaseError } from "../exceptions"
import { ActionConfigMap } from "../actions/types"
import { actionKinds } from "../actions/types"

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
function getIsRecurringUser(firstRunAt?: Date, latestRunAt?: Date) {
  if (!firstRunAt || !latestRunAt) {
    return false
  }

  const msInHour = 60 * 60 * 1000
  const t1 = firstRunAt.getTime()
  const t2 = latestRunAt.getTime()
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
  actionsCount: number
  buildActionCount: number
  testActionCount: number
  deployActionCount: number
  runActionCount: number
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
  firstRunAt?: Date
  latestRunAt?: Date
  isRecurringUser: boolean
}

interface EventBase {
  type: AnalyticsEventType
  properties: PropertiesBase
}

interface CommandEvent extends EventBase {
  type: "Run Command"
  properties: PropertiesBase & {
    name: string
  }
}

interface CommandResultEvent extends EventBase {
  type: "Command Result"
  properties: PropertiesBase & {
    name: string
    durationMsec: number
    result: AnalyticsCommandResult
    errors: string[] // list of GardenBaseError types
    exitCode?: number
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
    firstRunAt?: Date
    latestRunAt?: Date
    isRecurringUser: boolean
  }
}

type AnalyticsEvent = CommandEvent | CommandResultEvent

export interface SegmentEvent {
  userId?: string
  anonymousId?: string
  event: AnalyticsEventType
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
  public segment: Analytics
  private log: Log
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
  private anonymousUserId: string
  private cloudUserId?: string
  private cloudCustomerName?: string
  private ciName: string | null
  private systemConfig: SystemInfo
  private isCI: boolean
  private sessionId: string
  protected garden: Garden
  private projectMetadata: ProjectMetadata
  public isEnabled: boolean
  private isRecurringUser: boolean

  private constructor({
    garden,
    log,
    analyticsConfig,
    anonymousUserId,
    moduleConfigs,
    actionConfigs,
    cloudUser,
    isEnabled,
    ciInfo,
  }: {
    garden: Garden
    log: Log
    analyticsConfig: AnalyticsGlobalConfig
    anonymousUserId: string
    moduleConfigs: ModuleConfig[]
    actionConfigs: ActionConfigMap
    isEnabled: boolean
    cloudUser?: UserResult
    ciInfo: CiInfo
  }) {
    this.segment = new Analytics({ writeKey: API_KEY, maxEventsInBatch: 5, flushInterval: 3000 })
    this.log = log
    this.isEnabled = isEnabled
    this.garden = garden
    this.sessionId = garden.sessionId
    this.anonymousUserId = anonymousUserId
    this.isLoggedIn = garden.isLoggedIn()

    this.analyticsConfig = analyticsConfig

    let actionsCount = 0
    const countByActionKind: { [key: string]: number } = {}

    for (const kind of actionKinds) {
      countByActionKind[kind] = 0

      for (const name in actionConfigs[kind]) {
        countByActionKind[kind] = countByActionKind[kind] + 1
        actionsCount++
      }
    }

    this.projectMetadata = {
      modulesCount: moduleConfigs.length,
      moduleTypes: uniq(moduleConfigs.map((c) => c.type)),
      tasksCount: countActions(moduleConfigs, "tasks"),
      servicesCount: countActions(moduleConfigs, "services"),
      testsCount: countActions(moduleConfigs, "tests"),
      actionsCount,
      buildActionCount: countByActionKind["Build"],
      testActionCount: countByActionKind["Test"],
      deployActionCount: countByActionKind["Deploy"],
      runActionCount: countByActionKind["Run"],
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

    const enterpriseDomain = this.garden.cloudDomain
    if (enterpriseDomain) {
      this.enterpriseDomain = AnalyticsHandler.hash(enterpriseDomain)
      this.enterpriseDomainV2 = AnalyticsHandler.hashV2(enterpriseDomain)
    }

    if (cloudUser) {
      this.cloudUserId = AnalyticsHandler.makeCloudUserId(cloudUser)
      this.cloudCustomerName = cloudUser.organization.name
    }

    this.isRecurringUser = getIsRecurringUser(analyticsConfig.firstRunAt, analyticsConfig.latestRunAt)
  }

  static async init(garden: Garden, log: Log) {
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
  static async factory({ garden, log, ciInfo }: { garden: Garden; log: Log; ciInfo: CiInfo }) {
    const currentAnalyticsConfig = await garden.globalConfigStore.get("analytics")
    const isFirstRun = !currentAnalyticsConfig.firstRunAt
    const moduleConfigs = await garden.getRawModuleConfigs()
    const actionConfigs = await garden.getRawActionConfigs()

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
      log.info(msg)
    }

    const anonymousUserId = getAnonymousUserId({ analyticsConfig: currentAnalyticsConfig, isCi: ciInfo.isCi })

    let isEnabled: boolean
    // The order of preference is important here, hence the awkward if statements.
    if (gardenEnv.GARDEN_DISABLE_ANALYTICS) {
      isEnabled = false
    } else if (cloudUser) {
      isEnabled = true
    } else if (currentAnalyticsConfig?.optedOut === true) {
      isEnabled = false
    } else {
      isEnabled = true
    }

    const now = new Date()

    const firstRunAt = currentAnalyticsConfig?.firstRunAt || now
    const latestRunAt = now

    const analyticsConfig: AnalyticsGlobalConfig = {
      anonymousUserId,
      firstRunAt,
      latestRunAt,
      optedOut: currentAnalyticsConfig?.optedOut,
      cloudVersion: currentAnalyticsConfig?.cloudVersion,
      cloudProfileEnabled: !!cloudUser,
    }

    await garden.globalConfigStore.set("analytics", analyticsConfig)

    const analyticsHandler = new AnalyticsHandler({
      garden,
      log,
      analyticsConfig,
      moduleConfigs,
      actionConfigs,
      cloudUser,
      isEnabled,
      ciInfo,
      anonymousUserId,
    })

    await analyticsHandler.identify({
      userId: analyticsHandler.cloudUserId,
      anonymousId: anonymousUserId,
      traits: {
        userIdV2: AnalyticsHandler.hashV2(anonymousUserId),
        customer: cloudUser?.organization.name,
        platform: platform(),
        platformVersion: release(),
        gardenVersion: getPackageVersion(),
        isCI: ciInfo.isCi,
        firstRunAt: analyticsConfig.firstRunAt,
        latestRunAt: analyticsConfig.latestRunAt,
        isRecurringUser: analyticsHandler.isRecurringUser,
      },
    })

    return analyticsHandler
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
   * It sets the optedOut property in the globalConfigStore.
   * This is the property checked to decide if an event should be tracked or not.
   */
  async setAnalyticsOptOut(isOptedOut: boolean) {
    this.analyticsConfig.optedOut = isOptedOut
    await this.garden.globalConfigStore.set("analytics", "optedOut", isOptedOut)
  }

  /**
   * The actual segment track method. Returns immediately with undefined
   * when the analytics is not enabled.
   */
  private async track(event: AnalyticsEvent): Promise<AnalyticsEvent | undefined> {
    if (!this.segment || !this.isEnabled) {
      return
    }

    const segmentEvent = {
      userId: this.cloudUserId,
      anonymousId: this.anonymousUserId,
      event: event.type,
      properties: {
        ...this.getBasicAnalyticsProperties(),
        ...event.properties,
      },
    }

    this.log.silly(dedent`Tracking ${segmentEvent.event} event.
    Payload:
      ${JSON.stringify(segmentEvent)}
    `)

    return new Promise<AnalyticsEvent>((resolve, reject) =>
      this.segment.track(segmentEvent, (err) => {
        if (err) {
          this.log?.debug(`Error sending ${segmentEvent.event} tracking event: ${err}`)
          reject(err)
        }

        resolve(event)
      })
    )
  }

  /**
   * Internal method that calls segment identify. Returns immediately with undefined
   * when the analytics is not enabled.
   */
  private async identify(event: IdentifyEvent): Promise<IdentifyEvent | undefined> {
    if (!this.segment || !this.isEnabled) {
      return
    }

    return new Promise<IdentifyEvent>((resolve, reject) => {
      this.segment.identify(event, (err) => {
        if (err) {
          this.log?.debug(`Error sending identify event: ${err}`)
          reject(err)
        }

        resolve(event)
      })
    })
  }

  /**
   * Tracks a command run.
   *
   * @param {string} commandName The name of the command, e.g. deploy, test, ...
   */
  async trackCommand(commandName: string): Promise<AnalyticsEvent | undefined> {
    return await this.track({
      type: "Run Command",
      properties: {
        name: commandName,
        ...this.getBasicAnalyticsProperties(),
      },
    })
  }

  /**
   * Track a command result.
   *
   * @param {string} commandName The name of the command, e.g. deploy, test, ...
   * @param {GardenBaseError} errors List of garden base errors
   * @param {Date} startTime The time when the command was started, used to calculate duration
   * @param {number} exitCode Optional value of the exit code resulting from a command error
   */
  async trackCommandResult(commandName: string, errors: GardenBaseError[], startTime: Date, exitCode?: number) {
    const result: AnalyticsCommandResult = errors.length > 0 ? "failure" : "success"

    const durationMsec = getDurationMsec(startTime, new Date())

    return await this.track({
      type: "Command Result",
      properties: {
        name: commandName,
        durationMsec,
        result,
        errors: errors.map((e) => e.type),
        exitCode,
        ...this.getBasicAnalyticsProperties(),
      },
    })
  }

  /**
   * Flushes the event queue and shuts down the internal segment instance.
   *
   * This should only be used once and during shutdown. After the call, no
   * more analytic events will be tracked. Re-instantiate the AnalyticsHandler
   * to accept new events.
   */
  async shutdown() {
    this.log?.silly("Analytics close and flush all remaining events")

    try {
      await this.segment.closeAndFlush({ timeout: 2000 })
    } catch (err) {
      this.log?.debug(`Error flushing analytics: ${err}`)
    }
  }
}
