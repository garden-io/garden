/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { makeTestGardenA } from "../../../../helpers.js"
import { GetStatusCommand } from "../../../../../src/commands/get/get-status.js"
import { withDefaultGlobalOpts } from "../../../../helpers.js"
import { expect } from "chai"
import { LogLevel } from "../../../../../src/logger/logger.js"
import { getLogMessages } from "../../../../../src/util/testing.js"

describe("GetStatusCommand", () => {
  const command = new GetStatusCommand()

  describe("action", () => {
    it("returns statuses for all actions in a project", async () => {
      const garden = await makeTestGardenA()

      const { result } = await garden.runCommand({
        command,
        args: {},
        opts: {
          "skip-detail": false,
          "only-deploys": false,
        },
      })

      expect(result).to.eql({
        providers: {
          "exec": {
            ready: true,
            outputs: {},
          },
          "container": {
            ready: true,
            outputs: {},
          },
          "templated": {
            ready: true,
            outputs: {},
          },
          "test-plugin": {
            ready: true,
            outputs: {
              testKey: "testValue",
            },
          },
          "test-plugin-b": {
            ready: true,
            outputs: {
              testKey: "testValue",
            },
          },
        },
        actions: {
          Build: {
            "module-b": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
            "module-c": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
            "module-a": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
          },
          Deploy: {
            "service-b": {
              state: "ready",
              detail: {
                state: "ready",
                detail: {},
                forwardablePorts: [],
                outputs: {},
                mode: "default",
              },
              outputs: {},
            },
            "service-c": {
              state: "ready",
              detail: {
                state: "ready",
                detail: {},
                forwardablePorts: [],
                outputs: {},
                mode: "default",
              },
              outputs: {},
            },
            "service-a": {
              state: "ready",
              detail: {
                state: "ready",
                detail: {},
                forwardablePorts: [],
                outputs: {},
                mode: "default",
              },
              outputs: {},
            },
          },
          Test: {
            "module-b-unit": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
            "module-c-unit": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
            "module-c-integ": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
            "module-a-unit": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
            "module-a-integration": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
          },
          Run: {
            "task-b": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
            "task-c": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
            "task-a": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
            "task-a2": {
              state: "not-ready",
              detail: null,
              outputs: {},
            },
          },
        },
      })
    })

    it("should warn if a service's status can't be resolved", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log

      await garden.setTestActionStatus({
        log,
        kind: "Deploy",
        name: "service-a",
        status: {
          state: "unknown",
          detail: { state: "unknown", detail: {} },
          outputs: {},
        },
      })

      await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({
          "skip-detail": false,
          "only-deploys": false,
        }),
      })

      const logMessages = getLogMessages(log, (l) => l.level === LogLevel.warn)

      expect(logMessages).to.include(
        "Unable to resolve status for Deploy service-a. It is likely missing or outdated. This can come up if the deployment has runtime dependencies that are not resolvable, i.e. not deployed or invalid."
      )
    })
  })
})
