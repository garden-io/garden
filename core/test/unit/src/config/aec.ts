/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { AecTrigger } from "../../../../src/config/aec.js"
import { matchAecTriggers } from "../../../../src/config/aec.js"

describe("matchAecTriggers", () => {
  const now = new Date()

  it("returns empty array if AEC is disabled", () => {
    const results = matchAecTriggers({
      config: {
        disabled: true,
        triggers: [{ action: "pause", afterLastUpdate: { unit: "hours", value: 1 } }],
      },
      // Would trip the trigger
      lastDeployed: new Date("2010-01-01T00:00:00"),
    })
    expect(results.length).to.equal(0)
  })

  it("returns empty array if no triggers are specified", () => {
    const results = matchAecTriggers({
      config: {
        disabled: false,
        triggers: [],
      },
      lastDeployed: now,
    })
    expect(results.length).to.equal(0)
  })

  it("returns all matches when multiple triggers match", () => {
    const triggers: AecTrigger[] = [
      {
        action: "cleanup",
        schedule: { every: "day", hourOfDay: 1, minuteOfHour: 2 },
      },
      {
        action: "cleanup",
        afterLastUpdate: { unit: "hours", value: 1 },
      },
    ]
    const results = matchAecTriggers({
      config: {
        triggers,
      },
      lastDeployed: new Date("2010-01-01T00:00:00"),
      currentTime: new Date("2010-01-01T01:02:00"),
    })
    expect(results).to.eql(triggers)
  })

  it("only returns matching triggers", () => {
    const matchedTrigger: AecTrigger = {
      action: "cleanup",
      afterLastUpdate: { unit: "hours", value: 1 },
    }
    const results = matchAecTriggers({
      config: {
        disabled: false,
        triggers: [
          {
            action: "cleanup",
            schedule: {
              every: "day",
              hourOfDay: 1,
              minuteOfHour: 2,
            },
          },
          matchedTrigger,
        ],
      },
      lastDeployed: new Date("2010-01-01T00:00:00"),
      currentTime: new Date("2010-01-01T02:00:00"),
    })
    expect(results.length).to.equal(1)
    expect(results[0]).to.eql(matchedTrigger)
  })

  it("returns empty array if no triggers matched", () => {
    const results = matchAecTriggers({
      config: {
        disabled: false,
        triggers: [
          {
            action: "cleanup",
            schedule: {
              every: "day",
              hourOfDay: 1,
              minuteOfHour: 2,
            },
          },
          {
            action: "cleanup",
            afterLastUpdate: { unit: "hours", value: 1 },
          },
        ],
      },
      lastDeployed: now,
      currentTime: new Date("2010-01-01T02:00:00"),
    })
    expect(results.length).to.equal(0)
  })

  describe("schedule triggers", () => {
    it("matches a schedule trigger if within a one-minute range (rounded up)", () => {
      const trigger: AecTrigger = {
        action: "cleanup",
        schedule: {
          every: "day",
          hourOfDay: 1,
          minuteOfHour: 2,
        },
      }
      const lastDeployed = new Date("2010-01-01T00:00:00")
      const currentTime = new Date("2010-01-01T01:02:59")
      const results = matchAecTriggers({ config: { triggers: [trigger] }, lastDeployed, currentTime })
      expect(results[0]).to.eql(trigger)
    })

    it("matches a schedule trigger on exact current time match", () => {
      const trigger: AecTrigger = {
        action: "cleanup",
        schedule: {
          every: "day",
          hourOfDay: 1,
          minuteOfHour: 2,
        },
      }
      const lastDeployed = new Date("2010-01-01T00:00:00")
      const currentTime = new Date("2010-01-01T01:02:00")
      const results = matchAecTriggers({ config: { triggers: [trigger] }, lastDeployed, currentTime })
      expect(results[0]).to.eql(trigger)
    })

    it("doesn't match if every=weekday and current time is a weekend", () => {
      const results = matchAecTriggers({
        config: {
          triggers: [
            {
              action: "cleanup",
              schedule: { every: "weekday", hourOfDay: 1, minuteOfHour: 2 },
            },
          ],
        },
        lastDeployed: new Date("2010-01-01T00:00:00"),
        currentTime: new Date("2025-08-03T01:02:00"), // Sunday
      })
      expect(results.length).to.equal(0)
    })

    it("doesn't match if every=monday and current time is not a Monday", () => {
      const results = matchAecTriggers({
        config: {
          triggers: [
            {
              action: "cleanup",
              schedule: { every: "monday", hourOfDay: 1, minuteOfHour: 2 },
            },
          ],
        },
        lastDeployed: new Date("2010-01-01T00:00:00"),
        currentTime: new Date("2025-08-03T01:02:00"), // Sunday
      })
      expect(results.length).to.equal(0)
    })

    it("matches if scheduleWindowStart is set and current time is within the window", () => {
      const trigger: AecTrigger = {
        action: "cleanup",
        schedule: { every: "day", hourOfDay: 1, minuteOfHour: 1 },
      }
      const results = matchAecTriggers({
        config: { triggers: [trigger] },
        lastDeployed: new Date("2010-01-01T00:00:00"),
        currentTime: new Date("2010-01-01T01:01:50"), // Would not match without the scheduleWindowStart param
        scheduleWindowStart: new Date("2010-01-01T01:00:30"),
      })
      expect(results[0]).to.eql(trigger)
    })

    it("doesn't match if scheduleWindowStart is set and current time is outside the window", () => {
      const trigger: AecTrigger = {
        action: "cleanup",
        schedule: { every: "day", hourOfDay: 1, minuteOfHour: 2 },
      }
      const results = matchAecTriggers({
        config: { triggers: [trigger] },
        lastDeployed: new Date("2010-01-01T00:00:00"),
        currentTime: new Date("2010-01-01T01:01:50"),
        scheduleWindowStart: new Date("2010-01-01T01:00:30"),
      })
      expect(results.length).to.equal(0)
    })
  })

  describe("afterLastUpdate triggers", () => {
    it("matches a afterLastUpdate trigger if the last update was more than the specified time ago", () => {
      const trigger: AecTrigger = {
        action: "cleanup",
        afterLastUpdate: { unit: "hours", value: 1 },
      }
      const results = matchAecTriggers({
        config: { triggers: [trigger] },
        lastDeployed: new Date("2010-01-01T00:00:00"),
        currentTime: new Date("2010-01-01T01:02:00"),
      })
      expect(results[0]).to.eql(trigger)
    })

    it("doesn't match if the last update was less than the specified time ago", () => {
      const trigger: AecTrigger = {
        action: "cleanup",
        afterLastUpdate: { unit: "hours", value: 1 },
      }
      const results = matchAecTriggers({
        config: { triggers: [trigger] },
        lastDeployed: new Date("2010-01-01T00:00:00"),
        currentTime: new Date("2010-01-01T00:59:00"),
      })
      expect(results.length).to.equal(0)
    })
  })
})
