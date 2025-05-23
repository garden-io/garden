/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import codenamize from "@codenamize/codenamize"
import { platform, release } from "os"
import ci from "ci-info"
import { uniq } from "lodash-es"
import type { AnalyticsGlobalConfig } from "../config-store/global.js"
import { getDurationMsec, getPackageVersion } from "../util/util.js"
import { gardenEnv, SEGMENT_DEV_API_KEY, SEGMENT_PROD_API_KEY } from "../constants.js"
import type { Log } from "../logger/log-entry.js"
import { hashSync } from "hasha"
import type { Garden } from "../garden.js"
import type { AnalyticsCommandResult, AnalyticsEventType } from "./analytics-types.js"
import dedent from "dedent"
import { getGitHubUrl } from "../docs/common.js"
import { Profile } from "../util/profiling.js"
import type { ModuleConfig } from "../config/module.js"
import type { UserResult } from "@garden-io/platform-api-types"
import { uuidv4 } from "../util/random.js"
import type { GardenError, NodeJSErrnoException, StackTraceMetadata } from "../exceptions.js"
import type { ActionConfigMap } from "../actions/types.js"
import { getResultErrorProperties } from "./helpers.js"
import { Analytics } from "@segment/analytics-node"
import type { CloudProject } from "../cloud/api.js"
import type { UnresolvedProviderConfig } from "../config/project.js"

const CI_USER = "ci-user"

/**
 * Helper function for counting the number of tasks, tests, etc in module configs
 */
function countActionsFromModuleConfigs(moduleConfigs: ModuleConfig[], key: "tasks" | "services" | "tests") {
  return moduleConfigs.flatMap((c) => c.spec[key]).filter((spec) => !!spec).length
}

type CountResult = {
  countByActionKind: { [kind: string]: number }
  countByActionType: { [kind: string]: { [type: string]: number } }
  total: number
}

/**
 * Count actions in action config, returning total action count, action count by kind and action count
 * by type for each action kind.
 */
export function countActions(actionConfigs: ActionConfigMap): CountResult {
  return Object.entries(actionConfigs).reduce(
    (acc, [kind, configs]) => {
      acc.countByActionKind[kind] = 0
      acc.countByActionType[kind] = {}

      // Count all actions within this kind
      const kindCounts = Object.values(configs).reduce(
        (kindAcc, config) => {
          kindAcc.byKind++
          acc.total++

          const type = config.type
          kindAcc.byType[type] = (kindAcc.byType[type] || 0) + 1

          return kindAcc
        },
        { byKind: 0, byType: {} as { [type: string]: number } }
      )

      acc.countByActionKind[kind] = kindCounts.byKind
      acc.countByActionType[kind] = kindCounts.byType

      return acc
    },
    {
      total: 0,
      countByActionKind: {},
      countByActionType: {},
    } as CountResult
  )
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
}): string {
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
  runActionCount: number
  deployActionCount: number
  testActionCount: number
  buildActionCountByType: { [key: string]: number }
  runActionCountByType: { [key: string]: number }
  deployActionCountByType: { [key: string]: number }
  testActionCountByType: { [key: string]: number }
  providerNames: string[]
  actionTypes: string[]
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
  parentSessionId: string | undefined
  projectMetadata: ProjectMetadata
  firstRunAt?: Date
  latestRunAt?: Date
  isRecurringUser: boolean
  environmentName: string
}

interface EventBase {
  type: AnalyticsEventType
  properties: PropertiesBase
}

export interface CommandEvent extends EventBase {
  type: "Run Command"
  properties: PropertiesBase & {
    name: string
  }
}

interface ApiEvent extends EventBase {
  type: "Call API"
  properties: PropertiesBase & {
    path: string
    command: string
    name: string
  }
}

export type AnalyticsGardenErrorDetail = {
  /**
   * The error type will be used for rendering the error to json, and also for analytics.
   *
   * Corresponds to GardenError.type
   */
  errorType: string
  /**
   * The type of task, if the error was thrown as part of resolving or executing a node in the stack graph.
   *
   * Corresponds to GardenError.taskType
   */
  taskType?: string

  /**
   * If this error was caused by an underlying NodeJSErrnoException, this will be the code.
   */
  code?: NodeJSErrnoException["code"]

  stackTrace?: StackTraceMetadata
}

export type AnalyticsGardenError = {
  error: AnalyticsGardenErrorDetail
  wrapped?: AnalyticsGardenErrorDetail
  leaf?: AnalyticsGardenErrorDetail
}

export interface CommandResultEvent extends EventBase {
  type: "Command Result"
  properties: PropertiesBase & {
    name: string
    durationMsec: number
    result: AnalyticsCommandResult
    errors: string[] // list of GardenError types
    lastError?: AnalyticsGardenError
    exitCode?: number
  }
}

interface ConfigErrorEvent extends EventBase {
  type: "Module Configuration Error"
  properties: PropertiesBase & {
    moduleName: string
    moduleType: string
  }
}

interface ProjectErrorEvent extends EventBase {
  type: "Project Configuration Error"
  properties: PropertiesBase & {
    fields: Array<string>
  }
}

interface ValidationErrorEvent extends EventBase {
  type: "Validation Error"
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
    firstRunAt?: Date
    latestRunAt?: Date
    isRecurringUser: boolean
  }
}

interface ApiRequestBody {
  command: string
}

export type AnalyticsEvent =
  | CommandEvent
  | CommandResultEvent
  | ApiEvent
  | ConfigErrorEvent
  | ProjectErrorEvent
  | ValidationErrorEvent

export interface SegmentEvent {
  userId?: string
  anonymousId: string
  event: AnalyticsEventType
  properties: AnalyticsEvent["properties"]
}

const SEGMENT_HOST = "https://api.segment.io"

/**
 * A Segment client wrapper with utility functionalities global config and info,
 * prompt for opt-in/opt-out and wrappers for single events.
 *
 * Initalization:
 * const analyticsClient = await AnalyticsHandler.init(garden: Garden)
 * analyticsClient.trackCommand(commandName)
 *
 * Subsequent usage:
 * const analyticsClient = AnalyticsHandler.getInstance()
 * analyticsClient.trackCommand(commandName)
 */
@Profile()
export class AnalyticsHandler {
  private static instance?: AnalyticsHandler
  private segment: Analytics
  private log: Log
  private analyticsConfig: AnalyticsGlobalConfig
  private anonymousUserId: string
  private projectId: string
  private projectName: string
  private projectIdV2: string
  private projectNameV2: string
  private enterpriseProjectId?: string
  private enterpriseDomain?: string
  private enterpriseProjectIdV2?: string
  private enterpriseDomainV2?: string
  private cloudUserId?: string
  private cloudCustomerName?: string
  private ciName: string | null
  private systemConfig: SystemInfo
  private isCI: boolean
  private pendingEvents: Map<string, SegmentEvent>
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
    providerConfigs,
    cloudUser,
    cloudProject,
    isEnabled,
    ciInfo,
    host,
  }: {
    garden: Garden
    log: Log
    analyticsConfig: AnalyticsGlobalConfig
    anonymousUserId: string
    moduleConfigs: ModuleConfig[]
    actionConfigs: ActionConfigMap
    providerConfigs: UnresolvedProviderConfig[]
    isEnabled: boolean
    cloudUser?: UserResult
    cloudProject?: CloudProject
    ciInfo: CiInfo
    host?: string
  }) {
    const segmentApiKey = gardenEnv.ANALYTICS_DEV ? SEGMENT_DEV_API_KEY : SEGMENT_PROD_API_KEY

    this.segment = new Analytics({
      // We default to SEGMENT_HOST, but allow overriding for testing
      host: host || SEGMENT_HOST,
      writeKey: segmentApiKey,
      maxEventsInBatch: 20,
      flushInterval: 300,
    }).on("error", (err) => log.debug(`Segment client failed sending analytics ${err}`))

    this.log = log
    this.isEnabled = isEnabled
    this.garden = garden
    // Events that are queued or flushed but the network response hasn't returned
    this.pendingEvents = new Map()

    this.analyticsConfig = analyticsConfig

    const { countByActionKind, countByActionType, total } = countActions(actionConfigs)
    const actionTypes = [...new Set(Object.values(countByActionType).flatMap((kindTypes) => Object.keys(kindTypes)))]

    this.projectMetadata = {
      modulesCount: moduleConfigs.length,
      moduleTypes: uniq(moduleConfigs.map((c) => c.type)),
      tasksCount: countActionsFromModuleConfigs(moduleConfigs, "tasks"),
      servicesCount: countActionsFromModuleConfigs(moduleConfigs, "services"),
      testsCount: countActionsFromModuleConfigs(moduleConfigs, "tests"),
      actionsCount: total,
      buildActionCount: countByActionKind["Build"],
      runActionCount: countByActionKind["Run"],
      deployActionCount: countByActionKind["Deploy"],
      testActionCount: countByActionKind["Test"],
      buildActionCountByType: countByActionType["Build"],
      runActionCountByType: countByActionType["Run"],
      testActionCountByType: countByActionType["Test"],
      deployActionCountByType: countByActionType["Deploy"],
      providerNames: providerConfigs.map((c) => c.name),
      actionTypes,
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

    this.anonymousUserId = anonymousUserId
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

    this.cloudCustomerName = cloudProject?.organization.name || cloudUser?.organization?.name
    this.cloudUserId = cloudUser ? `${this.cloudCustomerName ?? "[no project]"}_${cloudUser.id}` : undefined

    this.isRecurringUser = getIsRecurringUser(analyticsConfig.firstRunAt, analyticsConfig.latestRunAt)

    const userIdV2 = AnalyticsHandler.hashV2(anonymousUserId)
    this.identify({
      userId: this.cloudUserId,
      anonymousId: anonymousUserId,
      traits: {
        userIdV2,
        customer: this.cloudCustomerName,
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

  static async init(garden: Garden) {
    // Ensure that we re-initialize the analytics metadata when switching projects
    if (!AnalyticsHandler.instance || AnalyticsHandler.instance.garden?.projectName !== garden.projectName) {
      // We're passing this explicitly to that it's easier to overwrite and test
      // in actual CI.
      const ciInfo = {
        isCi: ci.isCI,
        ciName: ci.name,
      }

      AnalyticsHandler.instance = await AnalyticsHandler.factory({ garden, ciInfo })
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
   * Handles async work and calculates values that are set by the constructor itself.
   *
   * It also initializes the analytics config and updates the analytics data we store in local config.
   */
  static async factory({ garden, ciInfo, host }: { garden: Garden; ciInfo: CiInfo; host?: string }) {
    const currentAnalyticsConfig = await garden.globalConfigStore.get("analytics")
    const isFirstRun = !currentAnalyticsConfig.firstRunAt
    const moduleConfigs = await garden.getRawModuleConfigs()
    const actionConfigs = await garden.getRawActionConfigs()
    const providerConfigs = await garden.getRawProviderConfigs()
    const log = garden.log

    let oldBackendCloudUser: UserResult | undefined
    let oldBackendCloudProject: CloudProject | undefined
    if (garden.isOldBackendAvailable()) {
      try {
        oldBackendCloudUser = await garden.cloudApi.getProfile()
      } catch (err) {
        log.debug(`Getting profile from API failed with error: ${err}`)
      }
      try {
        oldBackendCloudProject =
          garden.projectId === undefined ? undefined : await garden.cloudApi.getProjectById(garden.projectId)
      } catch (err) {
        log.debug(`Getting project from API failed with error: ${err}`)
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
    } else if (oldBackendCloudUser) {
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
      cloudProfileEnabled: isEnabled && !!oldBackendCloudUser,
    }

    await garden.globalConfigStore.set("analytics", analyticsConfig)

    return new AnalyticsHandler({
      host,
      garden,
      log,
      analyticsConfig,
      moduleConfigs,
      actionConfigs,
      providerConfigs,
      cloudUser: oldBackendCloudUser,
      cloudProject: oldBackendCloudProject,
      isEnabled,
      ciInfo,
      anonymousUserId,
    })
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
    return hashSync(val, { algorithm: "sha512" })
  }

  static async refreshGarden(garden: Garden) {
    if (AnalyticsHandler.instance) {
      AnalyticsHandler.instance.garden = garden
    }
  }

  /**
   * Returns some common metadata to be used on each event.
   */
  private getBasicAnalyticsProperties(parentSessionId: string | undefined = undefined): PropertiesBase {
    return {
      projectId: this.projectId,
      projectIdV2: this.projectIdV2,
      projectName: this.projectName,
      projectNameV2: this.projectNameV2,
      enterpriseProjectId: this.enterpriseProjectId,
      enterpriseProjectIdV2: this.enterpriseProjectIdV2,
      enterpriseDomain: this.enterpriseDomain,
      enterpriseDomainV2: this.enterpriseDomainV2,
      isLoggedIn: this.garden.isLoggedIn(),
      ciName: this.ciName,
      customer: this.cloudCustomerName,
      system: this.systemConfig,
      isCI: this.isCI,
      sessionId: this.garden.sessionId,
      // default to the sessionId since if not set we are the parent
      parentSessionId: parentSessionId || this.garden.sessionId,
      projectMetadata: this.projectMetadata,
      firstRunAt: this.analyticsConfig.firstRunAt,
      latestRunAt: this.analyticsConfig.latestRunAt,
      isRecurringUser: this.isRecurringUser,
      environmentName: this.garden.environmentName,
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
   * The actual segment track method.
   */
  private track(event: AnalyticsEvent, parentSessionId: string | undefined = undefined) {
    if (!this.segment || !this.isEnabled) {
      return false
    }

    const segmentEvent: SegmentEvent = {
      userId: this.cloudUserId,
      anonymousId: this.anonymousUserId,
      event: event.type,
      properties: {
        ...this.getBasicAnalyticsProperties(parentSessionId),
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
  trackCommand(commandName: string, parentSessionId?: string) {
    return this.track({
      type: "Run Command",
      properties: {
        name: commandName,
        ...this.getBasicAnalyticsProperties(parentSessionId),
      },
    })
  }

  /**
   * Track a command result.
   */
  trackCommandResult(
    commandName: string,
    errors: GardenError[],
    startTime: Date,
    exitCode?: number,
    parentSessionId?: string
  ) {
    const result: AnalyticsCommandResult = errors.length > 0 ? "failure" : "success"

    const durationMsec = getDurationMsec(startTime, new Date())

    let errorProperties

    try {
      errorProperties = getResultErrorProperties(errors)
    } catch (err) {
      this.log.debug(`Failed to extract command result error properties, ${err}`)
    }

    return this.track({
      type: "Command Result",
      properties: {
        ...errorProperties,
        result,
        name: commandName,
        durationMsec,
        exitCode,
        ...this.getBasicAnalyticsProperties(parentSessionId),
      },
    })
  }

  /**
   * Tracks an API call sent to the core server.
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
      type: "Call API",
      properties,
    })
  }

  /**
   * Tracks a Garden action configuration error
   */
  trackActionConfigError({
    kind,
    type,
    name,
    moduleName,
  }: {
    kind: string
    type: string
    name: string
    moduleName: string
  }) {
    return this.track(<ConfigErrorEvent>{
      type: "Module Configuration Error",
      properties: {
        ...this.getBasicAnalyticsProperties(),
        kind,
        moduleType: type,
        name: hashSync(name, { algorithm: "sha256" }),
        moduleName: hashSync(moduleName, { algorithm: "sha256" }),
      },
    })
  }

  /**
   *  Tracks a Garden Module configuration error
   *
   * @param {string} moduleType The type of the module causing the configuration error
   * @returns
   * @memberof AnalyticsHandler
   * Tracks a Garden Module configuration error
   */
  trackModuleConfigError(name: string, moduleType: string) {
    const moduleName = hashSync(name, { algorithm: "sha256" })
    return this.track({
      type: "Module Configuration Error",
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
      type: "Project Configuration Error",
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
      type: "Validation Error",
      properties: {
        ...this.getBasicAnalyticsProperties(),
        fields,
      },
    })
  }

  /**
   * Flushes the event queue and logs if there are still pending events after flushing.
   *
   * After that, new events can't be sent to segment anymore.
   *
   * Waits for 2000 ms at most if there are still pending events.
   * That should be enough time for a network request to fire, even if we don't wait for the response.
   */
  async closeAndFlush() {
    if (!this.isEnabled) {
      return
    }

    try {
      await this.segment.closeAndFlush({ timeout: 2000 })
    } catch (err) {
      this.log.debug(`Error flushing analytics: ${err}`)
    }

    if (this.pendingEvents.size > 0) {
      const pendingEvents = Array.from(this.pendingEvents.values())
        .map((event) => event.event)
        .join(", ")
      this.log.debug(`Timed out while waiting for events to flush: ${pendingEvents}`)
    }
  }
}
