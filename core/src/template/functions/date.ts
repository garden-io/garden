/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TemplateHelperFunction } from "./index.js"
import { joi } from "../../config/common.js"
import { format as formatFns, add, type Duration } from "date-fns"
import { UTCDateMini } from "@date-fns/utc"

type ShiftDateTimeUnit = keyof Duration
const validShiftDateTimeUnits: ShiftDateTimeUnit[] = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
] as const

const validModifyDateTimeUnits = ["years", "months", "days", "hours", "minutes", "seconds", "milliseconds"] as const
type ModifyDateTimeUnit = (typeof validModifyDateTimeUnits)[number]
// This is still type-safe because every entry of ModifyDateTimeUnit must be declared in the index below.
const modifyDateFunctions: { [k in ModifyDateTimeUnit]: (date: Date, timeUnits: number) => void } = {
  years: (date, timeUnits) => date.setUTCFullYear(timeUnits),
  months: (date, timeUnits) => date.setUTCMonth(timeUnits),
  days: (date, timeUnits) => date.setUTCDate(timeUnits),
  hours: (date, timeUnits) => date.setUTCHours(timeUnits),
  minutes: (date, timeUnits) => date.setUTCMinutes(timeUnits),
  seconds: (date, timeUnits) => date.setUTCSeconds(timeUnits),
  milliseconds: (date, timeUnits) => date.setUTCMilliseconds(timeUnits),
} as const

const timeZoneComment =
  "The input date is always converted to the UTC time zone before the modification. If no explicit timezone is specified on the input date, then the system default one will be used. The output date is always returned in the UTC time zone too."

export const dateHelperFunctionSpecs: TemplateHelperFunction[] = [
  {
    name: "formatDateUtc",
    description: `Formats the given date using the specified format. ${timeZoneComment}`,
    arguments: {
      date: joi.string().required().description("The date to format."),
      format: joi
        .string()
        .required()
        .description("The format to use. See https://date-fns.org/v2.21.1/docs/format for details."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: ["2021-01-01T00:00:00Z", "yyyy-MM-dd"], output: "2021-01-01" },
      { input: ["2021-01-01T00:00:00+0200", "yyyy-MM-dd"], output: "2020-12-31" },
      { input: ["2021-01-01T00:00:00Z", "yyyy-MM-dd HH:mm:ss"], output: "2021-01-01 00:00:00" },
      { input: ["2021-01-01T00:00:00+0200", "yyyy-MM-dd HH:mm:ss"], output: "2020-12-31 22:00:00" },
    ],
    fn: (date: string, format: string) => {
      const utcDate = new UTCDateMini(date)
      return formatFns(utcDate, format)
    },
  },
  {
    name: "shiftDateUtc",
    description: `Shifts the date by the specified amount of time units. ${timeZoneComment}`,
    arguments: {
      date: joi.string().required().description("The date to shift."),
      amount: joi.number().required().description("The amount of time units to shift the date by."),
      unit: joi
        .string()
        .valid(...validShiftDateTimeUnits)
        .required()
        .description("The time unit to shift the date by."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: ["2021-01-01T00:00:00Z", 1, "seconds"], output: "2021-01-01T00:00:01.000Z" },
      { input: ["2021-01-01T00:00:00Z", -1, "seconds"], output: "2020-12-31T23:59:59.000Z" },
      { input: ["2021-01-01T00:00:00Z", 1, "minutes"], output: "2021-01-01T00:01:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", -1, "minutes"], output: "2020-12-31T23:59:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", 1, "hours"], output: "2021-01-01T01:00:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", -1, "hours"], output: "2020-12-31T23:00:00.000Z" },
      { input: ["2021-01-01T10:00:00+0200", 1, "hours"], output: "2021-01-01T09:00:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", 1, "days"], output: "2021-01-02T00:00:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", -1, "days"], output: "2020-12-31T00:00:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", 1, "months"], output: "2021-02-01T00:00:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", -1, "months"], output: "2020-12-01T00:00:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", 1, "years"], output: "2022-01-01T00:00:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", -1, "years"], output: "2020-01-01T00:00:00.000Z" },
    ],
    fn: (date: string, timeUnitAmount: number, unit: ShiftDateTimeUnit) => {
      const dateClone = new Date(date)
      return add(dateClone, { [unit]: timeUnitAmount }).toISOString()
    },
  },
  {
    name: "modifyDateUtc",
    description: `Modifies the date by setting the specified amount of time units. ${timeZoneComment}`,
    arguments: {
      date: joi.string().required().description("The date to modify."),
      amount: joi.number().required().description("The amount of time units to set."),
      unit: joi
        .string()
        .valid(...validModifyDateTimeUnits)
        .required()
        .description("The time unit to set."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: ["2021-01-01T00:00:00.234Z", 345, "milliseconds"], output: "2021-01-01T00:00:00.345Z" },
      { input: ["2021-01-01T00:00:05Z", 30, "seconds"], output: "2021-01-01T00:00:30.000Z" },
      { input: ["2021-01-01T00:01:00Z", 15, "minutes"], output: "2021-01-01T00:15:00.000Z" },
      { input: ["2021-01-01T12:00:00Z", 11, "hours"], output: "2021-01-01T11:00:00.000Z" },
      { input: ["2021-01-01T10:00:00+0200", 11, "hours"], output: "2021-01-01T11:00:00.000Z" },
      { input: ["2021-01-31T00:00:00Z", 1, "days"], output: "2021-01-01T00:00:00.000Z" },
      { input: ["2021-03-01T00:00:00Z", 0, "months"], output: "2021-01-01T00:00:00.000Z" }, // 0 (Jan) - 11 (Dec)
      { input: ["2021-01-01T00:00:00Z", 2024, "years"], output: "2024-01-01T00:00:00.000Z" },
    ],
    fn: (date: string, timeUnitAmount: number, unit: ModifyDateTimeUnit) => {
      const dateClone = new Date(date)
      const dateModifier = modifyDateFunctions[unit]
      dateModifier(dateClone, timeUnitAmount)
      return dateClone.toISOString()
    },
  },
]
