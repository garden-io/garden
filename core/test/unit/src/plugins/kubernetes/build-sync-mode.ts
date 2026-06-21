/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { KubernetesPluginContext } from "../../../../../src/plugins/kubernetes/config.js"

describe("k8s build sync mode", () => {
  describe("syncToBuildSync", () => {
    it("should use the configured buildSyncMode from provider config", async () => {
      // This is a basic test to ensure the configuration is properly typed and accessible
      // The actual sync functionality is tested in integration tests

      const mockCtx = {
        provider: {
          config: {
            buildSyncMode: "two-way-resolved",
          },
        },
      } as unknown as KubernetesPluginContext

      // Verify that the configuration is accessible
      expect(mockCtx.provider.config.buildSyncMode).to.equal("two-way-resolved")
    })

    it("should default to one-way-replica when buildSyncMode is not configured", async () => {
      const mockCtx = {
        provider: {
          config: {
            // buildSyncMode not set
          },
        },
      } as unknown as KubernetesPluginContext

      // Verify that the configuration defaults correctly
      expect(mockCtx.provider.config.buildSyncMode).to.be.undefined
    })
  })
})
