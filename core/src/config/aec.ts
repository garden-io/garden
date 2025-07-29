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

const aecTtlUnits = ["hours", "days"] as const

const scheduleIntervals = [
  "weekday",
  "day",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

const aecActions = ["cleanup", "pause"] as const

type AecAction = (typeof aecActions)[number]

export type EnvironmentAecConfig = {
  disabled?: boolean
  triggers: AecTrigger[]
}

export type AecTrigger = {
  action: AecAction
  afterLastUpdate?: {
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

const aecTtlSchema = memoize(() =>
  joi
    .object()
    .keys({
      unit: joi
        .string()
        .valid(...aecTtlUnits)
        .required(),
      value: joi.number().min(1).required(),
    })
    .description(
      dedent`
      The time to live for the environment after the last update (i.e. the last time the environment was deployed or updated using \`garden deploy\`).

      Please refer to the [Automatic Environment Cleanup guide](${DOCS_BASE_URL}/guides/automatic-environment-cleanup) for details.
      `
    )
)

const aecScheduleSchema = createSchema({
  name: "aec-schedule",
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

    You must specify either \`afterLastUpdate\` or \`schedule\`.
  `,
  xor: [["afterLastUpdate", "schedule"]],
  keys: () => ({
    action: joi
      .string()
      .valid(...aecActions)
      .required()
      .description("The action to perform when the trigger is matched."),
    afterLastUpdate: aecTtlSchema(),
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
  or: [["afterLastUpdate", "schedule"]],
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
      .min(1)
      .description("The triggers that will cause the automatic environment cleanup to be performed."),
  }),
})
