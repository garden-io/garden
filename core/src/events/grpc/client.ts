/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { createClient } from "@connectrpc/connect"
import { GardenEventIngestionService } from "@buf/garden_grow-platform.bufbuild_es/private/events/events_pb.js"
import { createGrpcTransport } from "@connectrpc/connect-node"

export function createGrpcClient(baseUrl: string) {
  return createClient(
    GardenEventIngestionService,
    createGrpcTransport({
      baseUrl,
      defaultTimeoutMs: 2000,
    })
  )
}
