/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { createClient, createRouterTransport } from "@connectrpc/connect"
import type { Event } from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/events_pb.js"
import {
  IngestEventsResponseSchema,
  GardenEventIngestionService,
} from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/events_pb.js"
import { create } from "@bufbuild/protobuf"
import type { GardenWithNewBackend } from "../../../../../src/garden.js"
import { GrpcEventStream } from "../../../../../src/cloud/grow/grpc-event-stream.js"
import type { Log } from "../../../../../src/logger/log-entry.js"
import { getRootLogger } from "../../../../../src/logger/logger.js"
import { makeTestGardenA } from "../../../../helpers.js"
import { sleep } from "../../../../../src/util/util.js"

const receivedEvents = new Array<Event>()
// if this is true, the mock backend will simulate failures.
let simulateUnreliableBackend = false
const mockTransport = createRouterTransport(({ service }) => {
  service(GardenEventIngestionService, {
    ingestEvents: async function* ingest(eventStream) {
      for await (const { event } of eventStream) {
        if (!event) {
          continue
        }

        if (simulateUnreliableBackend) {
          await sleep(1) // Introduce latency
          if (Math.random() < 0.5) {
            // Simulate a transient failure
            yield create(IngestEventsResponseSchema, {
              eventUlid: event.eventUlid,
              success: false,
              final: false,
            })
            break
          }
        }

        // Simulate processing the event
        receivedEvents.push(event)
        yield create(IngestEventsResponseSchema, {
          eventUlid: event.eventUlid,
          success: true,
          final: true,
        })
      }
    },
  })
})
const mockClient = createClient(GardenEventIngestionService, mockTransport)

const fakeCommandEvent = {
  environmentName: "fake-environment-name",
  projectName: "fake-project-name",
  projectId: "fake-project-id",
  namespaceName: "fake-namespace-name",
  coreVersion: "fake-core-version",
  vcsBranch: "fake-vcs-branch",
  vcsCommitHash: "fake-vcs-commit-hash",
  vcsOriginUrl: "fake-origin-url",
  _projectApiVersion: "fake-project-api-version",
  _projectRootDirAbs: "fake-project-root-dir",
  _vcsRepositoryRootDirAbs: "",
  sessionId: "fake-session-id",
  name: "deploy",
  args: {},
  opts: {},
  rawArgs: [],
  isCustomCommand: false,
}

describe("GrpcEventStream", () => {
  let log: Log
  let garden: GardenWithNewBackend
  let bufferedEventStream: GrpcEventStream

  afterEach(async () => {
    receivedEvents.length = 0
    if (garden) {
      garden.close()
    }
    if (bufferedEventStream) {
      await bufferedEventStream.close()
    }
  })

  beforeEach(async () => {
    log = getRootLogger().createLog()
    garden = (await makeTestGardenA()) as any
    garden.cloudApiV2 = { organizationId: "fake-organization-id" } as any
    bufferedEventStream = new GrpcEventStream({
      log,
      garden,
      eventIngestionService: mockClient,
      shouldStreamLogEntries: true,
    })
  })

  it("should send start command event (flush on connect)", async () => {
    garden.events.emit("commandInfo", fakeCommandEvent)
    // wait until connected
    await sleep(100)
    await bufferedEventStream.close()
    expect(receivedEvents.length).to.equal(1)
    const event = receivedEvents[0]
    expect(event.eventUlid).to.be.a("string")
    expect(event.eventData).to.be.an("object")
    expect(event.eventData).to.have.property("case", "gardenCli")
    expect(event.eventData.value).to.be.an("object")
  })

  it("should send start command event (flush on close)", async () => {
    garden.events.emit("commandInfo", fakeCommandEvent)
    await bufferedEventStream.close()
    expect(receivedEvents.length).to.equal(1)
    const event = receivedEvents[0]
    expect(event.eventUlid).to.be.a("string")
    expect(event.eventData).to.be.an("object")
    expect(event.eventData).to.have.property("case", "gardenCli")
    expect(event.eventData.value).to.be.an("object")
  })

  it("should send start command event (streamed)", async () => {
    // wait until connected
    await sleep(100)
    garden.events.emit("commandInfo", fakeCommandEvent)
    await bufferedEventStream.close()
    expect(receivedEvents.length).to.equal(1)
    const event = receivedEvents[0]
    expect(event.eventUlid).to.be.a("string")
    expect(event.eventData).to.be.an("object")
    expect(event.eventData).to.have.property("case", "gardenCli")
    expect(event.eventData.value).to.be.an("object")
  })

  it("should send events in the correct order even when facing transient failures", async () => {
    // Simulate unreliable backend
    simulateUnreliableBackend = true

    for (let i = 0; i < 100; i++) {
      await sleep(2) // Simulate some delay between events
      garden.events.emit("commandInfo", {
        ...fakeCommandEvent,
        name: `deploy-${i}`,
      })
    }

    await bufferedEventStream.close()
    // Check that events are in the correct order
    const receivedCommandNames = receivedEvents.map((event) => {
      if (event.eventData.case !== "gardenCli") {
        throw new Error(`Unexpected event.eventData.case: ${event.eventData.case}`)
      }
      if (event.eventData.value.eventData.case !== "commandExecutionStarted") {
        throw new Error(`Unexpected event.eventData.value.eventData.case: ${event.eventData.value.eventData.case}`)
      }

      return event.eventData.value.eventData.value.invocation?.instruction?.name
    })
    expect(receivedCommandNames).to.deep.equal(Array.from({ length: 100 }, (_, i) => `deploy-${i}`))
    expect(receivedEvents.length).to.be.equal(100)
  })
})
