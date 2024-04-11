/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { performance } from "perf_hooks"
import { sortBy, sum } from "lodash-es"
import { gardenEnv } from "../constants.js"
import { renderTable, tablePresets } from "./string.js"
import { isPromise } from "./objects.js"
import { styles } from "../logger/styles.js"

const skipProfiling = process.env.GARDEN_SKIP_TEST_PROFILING

const maxReportRows = 60

// Just storing the invocation duration for now
type Invocation = number

interface Profiles {
  [key: string]: Invocation[]
}

interface Counters {
  [key: string]: number
}

interface InvocationRow {
  name: string
  count: number
  total: number
  average: number
  first: number
}

export class Profiler {
  private data: Profiles
  private counters: Counters

  constructor(private enabled = true) {
    this.data = {}
    this.counters = {}
  }

  isEnabled() {
    return this.enabled
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  getData() {
    return this.data
  }

  private renderInvocations() {
    function formatKey(key: string) {
      const split = key.split("#")

      if (split.length === 1) {
        return styles.success(key)
      } else {
        return styles.highlight(split[0]) + "#" + styles.success(split[1])
      }
    }

    function formatDuration(duration: number) {
      return duration.toFixed(2) + styles.primary(" ms")
    }

    const heading = ["Function/method", "# Invocations", "Total ms", "Avg. ms", "First ms"].map((h) =>
      styles.accent.underline(h)
    )

    const keys = Object.keys(this.data)
    const rows = keys.map((key): InvocationRow => {
      const invocations = this.data[key]
      const count = invocations.length
      const first = invocations[0]
      const total = sum(invocations)
      const average = total / count
      return { name: formatKey(key), count, total, average, first }
    })
    const tableData = sortBy(rows, (row) => -row.total)
      .map((row) => [
        row.name,
        row.count,
        formatDuration(row.total),
        formatDuration(row.average),
        formatDuration(row.first),
      ])
      .slice(0, maxReportRows)

    const totalRows = keys.length

    if (totalRows > maxReportRows) {
      tableData.push([styles.primary("...")])
    }

    return renderTable([heading, [], ...tableData], tablePresets["no-borders"])
  }

  private renderCounters() {
    function formatKey(key: string) {
      return styles.success(key)
    }

    const keys = Object.keys(this.counters)

    const heading = ["Counter", "Value"].map((h) => styles.accent.underline(h))
    const tableData = sortBy(
      keys.map((key) => {
        const counter = this.counters[key]
        return [formatKey(key), counter]
      }),
      // Sort by total duration
      (row) => row[1]
    ).slice(0, maxReportRows)

    const totalRows = keys.length

    if (totalRows > maxReportRows) {
      tableData.push([styles.primary("...")])
    }

    return renderTable([heading, [], ...tableData], tablePresets["no-borders"])
  }

  report() {
    if (skipProfiling) {
      return
    }

    return `
 ${styles.accent.bold("Profiling data:")}

 INVOCATIONS:
 ─────────────────────────────────────────────────────────────────────────────────────────
${this.renderInvocations()}
 ─────────────────────────────────────────────────────────────────────────────────────────

 COUNTERS:
 ─────────────────────────────────────────────────────────────────────────────────────────
${this.renderCounters()}
 ─────────────────────────────────────────────────────────────────────────────────────────
    `
  }

  reset() {
    this.data = {}
    this.counters = {}
  }

  log(key: string, start: number) {
    if (!this.enabled) {
      return
    }

    const duration = performance.now() - start
    if (this.data[key]) {
      this.data[key].push(duration)
    } else {
      this.data[key] = [duration]
    }
  }

  inc(key: string) {
    if (!this.enabled) {
      return
    }

    let counter = this.counters[key]
    if (counter === undefined || counter === null) {
      counter = 0
    }
    counter++
    this.counters[key] = counter
  }
}

const defaultProfiler = new Profiler(gardenEnv.GARDEN_ENABLE_PROFILING)

export function getDefaultProfiler() {
  return defaultProfiler
}

/**
 * Class decorator that collects profiling data on every method invocation (if GARDEN_ENABLE_PROFILING is true).
 */
export function Profile(profiler?: Profiler) {
  if (!profiler) {
    profiler = getDefaultProfiler()
  }

  return function (target: Function) {
    if (!profiler!.isEnabled()) {
      return
    }

    for (const propertyName of Object.getOwnPropertyNames(target.prototype)) {
      const propertyValue = target.prototype[propertyName]
      const isMethod = propertyValue instanceof Function
      if (!isMethod) {
        continue
      }

      const descriptor = Object.getOwnPropertyDescriptor(target.prototype, propertyName)!
      const originalMethod = descriptor.get || descriptor.value

      const timingKey = `${target.name}#${propertyName}`

      const wrapped = function (this: any, ...args: any[]) {
        const start = performance.now()
        // eslint-disable-next-line no-invalid-this
        const result = originalMethod.apply(this, args)

        if (!profiler!.isEnabled()) {
          return result
        } else if (isPromise(result)) {
          return result
            .catch((err: Error) => {
              profiler!.log(timingKey, start)
              throw err
            })
            .then((v) => {
              profiler!.log(timingKey, start)
              return v
            })
        } else {
          profiler!.log(timingKey, start)
          return result
        }
      }

      if (descriptor.get) {
        descriptor.get = wrapped
      } else {
        descriptor.value = wrapped
      }

      Object.defineProperty(target.prototype, propertyName, descriptor)
    }
  }
}

/**
 * Function decorator that collects profiling data on every function invocation (if GARDEN_ENABLE_PROFILING is true).
 */
export const profile = <T extends Array<any>, U>(fn: (...args: T) => U, profiler?: Profiler) => {
  if (!profiler) {
    profiler = getDefaultProfiler()
  }

  if (!profiler!.isEnabled()) {
    return fn
  }

  const timingKey = fn.name

  return (...args: T): U => {
    const result = fn(...args)
    const start = performance.now()

    if (!profiler!.isEnabled()) {
      return result
    } else {
      profiler!.log(timingKey, start)
      return result
    }
  }
}

/**
 * Async function decorator that collects profiling data on every function invocation (if GARDEN_ENABLE_PROFILING is
 * true).
 */
export const profileAsync = <T extends Array<any>, U>(fn: (...args: T) => Promise<U>, profiler?: Profiler) => {
  if (!profiler) {
    profiler = getDefaultProfiler()
  }

  if (!profiler!.isEnabled()) {
    return fn
  }

  const timingKey = fn.name

  return async (...args: T): Promise<U> => {
    const start = performance.now()

    if (!profiler!.isEnabled()) {
      return fn(...args)
    } else {
      return fn(...args)
        .catch((err: Error) => {
          profiler!.log(timingKey, start)
          throw err
        })
        .then((v) => {
          profiler!.log(timingKey, start)
          return v
        })
    }
  }
}
