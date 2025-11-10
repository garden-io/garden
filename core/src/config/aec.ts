/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import { memoize } from "lodash-es"
import { DOCS_BASE_URL } from "../constants.js"
import { joi, createSchema } from "./common.js"
import type { AecAgentInfoSchema as GrpcAecAgentInfoSchema } from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/garden_aec_pb.js"
import z from "zod"
import type { MessageValidType } from "@bufbuild/protobuf"

const aecTtlUnits = ["hours", "days", "minutes"] as const
const daysString = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const
const scheduleIntervals = ["weekday", "day", ...daysString] as const
const aecActions = ["cleanup", "pause"] as const

export type AecAction = (typeof aecActions)[number]

export type AecAgentInfo = Omit<MessageValidType<typeof GrpcAecAgentInfoSchema>, "$typeName">

export type EnvironmentAecConfig = {
  disabled?: boolean
  triggers: AecTrigger[]
}

export type AecTrigger = {
  action: AecAction
  timeAfterLastUpdate?: {
    unit: (typeof aecTtlUnits)[number]
    value: number
  }
  schedule?: {
    every: (typeof scheduleIntervals)[number]
    hourOfDay: number
    minuteOfHour: number
  }
}

const scheduleIntervalSchema = memoize(() => joi.string().valid(...scheduleIntervals))

const aecTtlSchema = createSchema({
  name: "aec-ttl",
  description: dedent`
    The time to live for the environment after the last update (i.e. the last time the environment was deployed or updated using \`garden deploy\`).

    Please refer to the [Automatic Environment Cleanup guide](${DOCS_BASE_URL}/guides/automatic-environment-cleanup) for details.
  `,
  keys: () => ({
    unit: joi
      .string()
      .valid(...aecTtlUnits)
      .required(),
    value: joi.number().min(1).required(),
  }),
})

const aecScheduleSchema = createSchema({
  name: "aec-schedule",
  description: dedent`
    Specify a cron-like schedule for the automatic environment cleanup. Use this to specify a fixed cadence and time of day for the cleanup.

    Please refer to the [Automatic Environment Cleanup guide](${DOCS_BASE_URL}/guides/automatic-environment-cleanup) for details.
  `,
  keys: () => ({
    every: scheduleIntervalSchema(),
    hourOfDay: joi.number().min(0).max(23).required(),
    minuteOfHour: joi.number().min(0).max(59).default(0),
  }),
})

const aecTriggerSchema = createSchema({
  name: "aec-trigger",
  description: dedent`
    Specify a trigger that will cause the automatic environment cleanup to be performed.

    You must specify either \`timeAfterLastUpdate\` or \`schedule\`.
  `,
  xor: [["timeAfterLastUpdate", "schedule"]],
  keys: () => ({
    action: joi
      .string()
      .valid(...aecActions)
      .required()
      .description("The action to perform when the trigger is matched."),
    timeAfterLastUpdate: aecTtlSchema(),
    schedule: aecScheduleSchema(),
  }),
})

export const aecConfigSchema = createSchema({
  name: "aec-config",
  description: dedent`
    Configuration for the Automatic Environment Cleanup feature.

    You must specify at least one _trigger_, which defines the schedule or time of inactivity that will cause the automatic environment cleanup to be performed, as well as the type of action to perform (pause or cleanup).

    If you specify multiple triggers and multiple are matched, the _last_ trigger matched in the list will be used. For example, you can specify a trigger to pause the environment after 1 day of inactivity as the first trigger, and another trigger to fully clean up the environment after 1 week of inactivity or on a specific schedule as the second trigger.

    Note that this feature is only available for Garden Cloud users. Also note that the feature is currently in beta, and is only available for specific providers, in particular the Kubernetes provider.

    Please refer to the [Automatic Environment Cleanup guide](${DOCS_BASE_URL}/guides/automatic-environment-cleanup) for details.
  `,
  keys: () => ({
    disabled: joi
      .boolean()
      .default(false)
      .description(
        "Set to true to disable automatic environment cleanup. It may be useful to template this value in, in some scenarios."
      ),
    triggers: joi
      .array()
      .items(aecTriggerSchema())
      .required()
      .description("The triggers that will cause the automatic environment cleanup to be performed."),
  }),
})

export const aecStatusSchema = z.enum(["paused", "cleaned-up", "none"])

export type AecStatus = z.infer<typeof aecStatusSchema>

export function matchAecTriggers({
  config,
  lastDeployed,
  scheduleWindowStart,
  currentTime,
}: {
  config: EnvironmentAecConfig
  lastDeployed: Date
  /**
   * Used for schedule-based triggers, to ensure that a schedule trigger is matched even if a specific minute is missed,
   * e.g. if the schedule is "every day at 10:05", a running cleanup loop started at 10:04, took a while so that the
   * next cleanup loop started at 10:06, the trigger should still be matched if this is set to when the last cleanup
   * loop started.
   */
  scheduleWindowStart?: Date
  // Used for testing, defaults to now
  currentTime?: Date
}): AecTrigger[] {
  if (config.disabled) {
    return []
  }

  const now = currentTime ?? new Date()

  return config.triggers.filter((trigger) => {
    if (trigger.schedule) {
      const { every, hourOfDay, minuteOfHour } = trigger.schedule

      // Check the weekday
      const weekday = now.getDay()
      const weekdayString = daysString[weekday]

      if (every === "weekday" && (weekdayString === "sunday" || weekdayString === "saturday")) {
        return false
      } else if (every !== "day" && every !== weekdayString) {
        return false
      }

      // Round up to the next minute
      const scheduleWindowEnd = new Date(now.getTime() + 60000 - (now.getTime() % 60000))
      if (!scheduleWindowStart) {
        // Round down to the minute
        scheduleWindowStart = new Date(now.getTime() - (now.getTime() % 60000))
      }

      // Check if the trigger is within the schedule window
      const triggerTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hourOfDay, minuteOfHour)
      if (
        triggerTime.getTime() < scheduleWindowStart.getTime() ||
        triggerTime.getTime() >= scheduleWindowEnd.getTime()
      ) {
        return false
      }

      return true
    } else if (trigger.timeAfterLastUpdate) {
      const triggerTime = new Date(
        lastDeployed.getTime() + trigger.timeAfterLastUpdate.value * getTimeUnitMsec(trigger.timeAfterLastUpdate.unit)
      )
      return triggerTime.getTime() <= now.getTime()
    }

    return false
  })
}

function getTimeUnitMsec(unit: (typeof aecTtlUnits)[number]) {
  switch (unit) {
    case "hours":
      return 60 * 60 * 1000
    case "days":
      return 24 * 60 * 60 * 1000
    case "minutes":
      return 60 * 1000
  }
}

export function describeTrigger(trigger: AecTrigger) {
  if (trigger.schedule) {
    return `Schedule: ${trigger.action} every ${trigger.schedule.every} at ${trigger.schedule.hourOfDay}:${trigger.schedule.minuteOfHour}`
  } else if (trigger.timeAfterLastUpdate) {
    return `After last update: ${trigger.action} after ${trigger.timeAfterLastUpdate.value} ${trigger.timeAfterLastUpdate.unit}(s)`
  } else {
    throw new Error("Invalid trigger")
  }
}
