/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { createClient, createRouterTransport } from "@connectrpc/connect"
import type { Event } from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import {
  EventResponseSchema,
  GardenEventIngestionService,
} from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import { create } from "@bufbuild/protobuf"
import type { GardenWithNewBackend } from "../../../../../src/garden.js"
import { GrowBufferedEventStream } from "../../../../../src/cloud/grow/buffered-event-stream.js"
import type { Log } from "../../../../../src/logger/log-entry.js"
import { getRootLogger } from "../../../../../src/logger/logger.js"
import { makeTestGardenA } from "../../../../helpers.js"
import { sleep } from "../../../../../src/util/util.js"

const receivedEvents = new Array<Event>()
const mockTransport = createRouterTransport(({ service }) => {
  service(GardenEventIngestionService, {
    ingestEvents: async function* ingest(eventStream) {
      for await (const event of eventStream) {
        receivedEvents.push(event)
        yield create(EventResponseSchema, {
          eventUlid: event.eventUlid,
          success: true,
          final: true,
        })
      }
    },
  })
})
const mockClient = createClient(GardenEventIngestionService, mockTransport)

describe("GrowBufferedEventStream", () => {
  let log: Log
  let garden: GardenWithNewBackend
  let bufferedEventStream: GrowBufferedEventStream

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
    bufferedEventStream = new GrowBufferedEventStream({
      log,
      garden,
      eventIngestionService: mockClient,
      shouldStreamLogEntries: true,
    })
  })

  it("should send start command event (flush on connect)", async () => {
    garden.events.emit("commandInfo", {
      environmentName: "fake-environment-name",
      projectName: "fake-project-name",
      projectId: "fake-project-id",
      namespaceName: "fake-namespace-name",
      coreVersion: "fake-core-version",
      vcsBranch: "fake-vcs-branch",
      vcsCommitHash: "fake-vcs-commit-hash",
      vcsOriginUrl: "fake-origin-url",
      _projectApiVersion: "fake-project",
      _projectRootDirAbs: "fake-project",
      sessionId: "fake-session-id",
      name: "deploy",
      args: {},
      opts: {},
      _vcsRepositoryRootDirAbs: "",
      rawArgs: [],
      isCustomCommand: false,
    })
    // wait until connected
    await sleep(100)
    await bufferedEventStream.close()
    expect(receivedEvents.length).to.equal(1)
    const event = receivedEvents[0]
    expect(event.eventUlid).to.be.a("string")
    expect(event.eventData).to.be.an("object")
    expect(event.eventData).to.have.property("case", "garden")
    expect(event.eventData.value).to.be.an("object")
  })

  it("should send start command event (flush on close)", async () => {
    garden.events.emit("commandInfo", {
      environmentName: "fake-environment-name",
      projectName: "fake-project-name",
      projectId: "fake-project-id",
      namespaceName: "fake-namespace-name",
      coreVersion: "fake-core-version",
      vcsBranch: "fake-vcs-branch",
      vcsCommitHash: "fake-vcs-commit-hash",
      vcsOriginUrl: "fake-origin-url",
      sessionId: "fake-session-id",
      _projectApiVersion: "",
      _projectRootDirAbs: "",
      _vcsRepositoryRootDirAbs: "",
      name: "deploy",
      args: {},
      opts: {},
      rawArgs: [],
      isCustomCommand: false,
    })
    await bufferedEventStream.close()
    expect(receivedEvents.length).to.equal(1)
    const event = receivedEvents[0]
    expect(event.eventUlid).to.be.a("string")
    expect(event.eventData).to.be.an("object")
    expect(event.eventData).to.have.property("case", "garden")
    expect(event.eventData.value).to.be.an("object")
  })

  it("should send start command event (streamed)", async () => {
    // wait until connected
    await sleep(100)
    garden.events.emit("commandInfo", {
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
    })
    await bufferedEventStream.close()
    expect(receivedEvents.length).to.equal(1)
    const event = receivedEvents[0]
    expect(event.eventUlid).to.be.a("string")
    expect(event.eventData).to.be.an("object")
    expect(event.eventData).to.have.property("case", "garden")
    expect(event.eventData.value).to.be.an("object")
  })
})
