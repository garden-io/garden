/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TemplateHelperFunction } from "./functions.js"
import { joi } from "../config/common.js"
import { format as formatFns, add } from "date-fns"

export const dateHelperFunctionSpecs: TemplateHelperFunction[] = [
  {
    name: "formatDate",
    description: "Formats the given date using the specified format.",
    arguments: {
      date: joi.string().required().description("The date to format."),
      format: joi
        .string()
        .required()
        .description("The format to use. See https://date-fns.org/v2.21.1/docs/format for details."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: ["2021-01-01T00:00:00Z", "yyyy-MM-dd"], output: "2021-01-01", skipTest: true },
      { input: ["2021-01-01T00:00:00Z", "yyyy-MM-dd HH:mm:ss"], output: "2021-01-01 00:00:00", skipTest: true },
    ],
    fn: (date: Date, format: string) => {
      return formatFns(date, format)
    },
  },
  {
    name: "shiftDate",
    description: "Shifts the date by the specified amount of time units.",
    arguments: {
      date: joi.string().required().description("The date to shift."),
      amount: joi.number().required().description("The amount of time units to shift the date by."),
      unit: joi
        .string()
        .valid("years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds")
        .required()
        .description("The time unit to shift the date by."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: ["2021-01-01T00:00:00Z", 1, "days"], output: "2021-01-02T00:00:00.000Z" },
      { input: ["2021-01-01T00:00:00Z", -1, "days"], output: "2020-12-31T00:00:00.000Z" },
    ],
    fn: (date: string, amount: number, unit: string) => {
      const dateClone = new Date(date)
      return add(dateClone, { [unit]: amount }).toISOString()
    },
  },
  {
    name: "modifyDate",
    description: "Modifies the date by setting the specified amount of time units.",
    arguments: {
      date: joi.string().required().description("The date to modify."),
      amount: joi.number().required().description("The amount of time units to set."),
      unit: joi
        .string()
        .valid("years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds")
        .required()
        .description("The time unit to set."),
    },
    outputSchema: joi.string(),
    exampleArguments: [{ input: ["2021-01-01T00:00:00Z", 30, "seconds"], output: "2021-01-01T00:00:30.000Z" }],
    fn: (date: string, amount: number, unit: string) => {
      const dateClone = new Date(date)
      switch (unit) {
        case "years":
          dateClone.setFullYear(amount)
          break
        case "months":
          dateClone.setMonth(amount)
          break
        case "days":
          dateClone.setDate(amount)
          break
        case "hours":
          dateClone.setHours(amount)
          break
        case "minutes":
          dateClone.setMinutes(amount)
          break
        case "seconds":
          dateClone.setSeconds(amount)
          break
        case "milliseconds":
          dateClone.setMilliseconds(amount)
          break
        default:
          throw new Error("Invalid unit")
      }
      return dateClone.toISOString()
    },
  },
]
