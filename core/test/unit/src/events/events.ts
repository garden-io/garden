/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { createClient, createRouterTransport } from "@connectrpc/connect"
import type { Event, EventResponse } from "@buf/garden_grow-platform.bufbuild_es/private/events/events_pb.js"
import {
  EventResponseSchema,
  EventSchema,
  GardenEventIngestionService,
} from "@buf/garden_grow-platform.bufbuild_es/private/events/events_pb.js"
import { create } from "@bufbuild/protobuf"
import { ulid } from "ulid"
import { GardenCommandEventSchema } from "@buf/garden_grow-platform.bufbuild_es/private/events/garden-command/garden-command_pb.js"

const mockTransport = createRouterTransport(({ service }) => {
  service(GardenEventIngestionService, {
    ingestEvent: (event: Event): EventResponse =>
      create(EventResponseSchema, {
        eventId: event.eventId,
        success: true,
      }),
  })
})
const mockClient = createClient(GardenEventIngestionService, mockTransport)

describe("GardenEventIngestionService", () => {
  it("test event ingestion endpoint", async () => {
    const eventId = ulid()
    const event = create(EventSchema, {
      eventId,
      eventData: {
        case: "commandEvent",
        value: create(GardenCommandEventSchema, {}),
      },
    })

    const eventResult = await mockClient.ingestEvent(event)
    expect(eventResult).to.include({ eventId, success: true })
  })
})
