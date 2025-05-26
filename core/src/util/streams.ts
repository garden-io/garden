/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import split2 from "split2"
import { Readable } from "stream"
import { InternalError } from "../exceptions.js"

export const splitStream = split2

/**
 * Takes a list of sorted Readable streams and emits the intersection of all of them.
 */
export class SortedStreamIntersection<T> extends Readable {
  private lastValues: T[]
  private values: T[][]
  private ended: boolean[]

  private done: boolean
  private started: boolean

  constructor(
    private streams: Readable[],
    private comparisonFn: (a: T, b: T) => number
  ) {
    super({ objectMode: true })
    this.lastValues = []
    this.ended = []
    this.values = streams.map(() => [])
    this.done = false
    this.started = false
  }

  override _read() {
    if (!this.started) {
      this.start()
    }
  }

  start() {
    this.started = true

    this.streams.map((stream, i) => {
      stream.on("data", (value) => {
        if (this.done) {
          return
        }

        const lastValue = this.lastValues[i]
        this.lastValues[i] = value

        if (lastValue !== undefined && this.comparisonFn(lastValue, value) > 0) {
          this.emit("error", new InternalError({ message: `Received unordered stream (index: ${i})` }))
          return
        }

        // Skip the entry if it is smaller than the smallest entry in the other lists
        for (let j = 0; j < this.streams.length; j++) {
          if (i === j) {
            continue
          }

          const first = this.values[j][0]

          if (first !== undefined && this.comparisonFn(first, value) > 0) {
            return
          }
        }

        this.values[i].push(value)
        this.handleBuffer()
      })

      stream.on("error", (err) => {
        this.done = true
        this.emit("error", err)
      })

      stream.on("end", () => {
        this.handleBuffer()
        this.ended[i] = true
        if (this.ended.length === this.streams.length && this.ended.every((s) => s === true)) {
          this.push(null)
          this.done = true
        }
      })
    })
  }

  handleBuffer() {
    if (this.done) {
      return
    }

    while (!this.values.find((v) => v.length === 0)) {
      const row = this.values.map((v) => v[0])

      if (row.every((v) => this.comparisonFn(row[0], v) === 0)) {
        // Emit and shift if the top values are all equal
        // TODO: Pause if push returns false
        this.push(row[0])
        for (let i = 0; i < this.values.length; i++) {
          this.values[i].shift()
        }
      } else {
        // Trim off every item lower than the lowest item in the highest list
        const sortedIndices = this.sortedIndices(row)
        const furthestList = this.values[sortedIndices[sortedIndices.length - 1]]
        const compared = furthestList[0]

        for (let i = 0; i < sortedIndices.length - 1; i++) {
          const arrayToTrim = this.values[sortedIndices[i]]

          for (let itemsToShift = 0; itemsToShift < arrayToTrim.length; itemsToShift++) {
            if (this.comparisonFn(arrayToTrim[itemsToShift], compared) === 0) {
              this.values[sortedIndices[i]] = arrayToTrim.slice(itemsToShift)
              break
            }
          }
        }
      }
    }
  }

  private sortedIndices(row: T[]) {
    const indices = new Array(row.length)
    for (let i = 0; i < row.length; ++i) {
      indices[i] = i
    }
    indices.sort(this.comparisonFn)
    return indices
  }
}
