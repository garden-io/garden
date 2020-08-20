/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { defaultNamespace } from "../../../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../../../src/constants"
import { projectRootA } from "../../../../helpers"
import { expect } from "chai"
import { got } from "../../../../../src/util/http"
import { Garden } from "../../../../../src/garden"

describe("octant provider", () => {
  describe("getDashboardPage", () => {
    it("should start an octant process and return a URL to it", async () => {
      const garden = await Garden.factory(projectRootA, {
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: projectRootA,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "local-kubernetes", namespace: "default" }, { name: "octant" }],
          variables: {},
        },
      })
      const actions = await garden.getActionRouter()
      const plugin = await garden.getPlugin("octant")
      const { url } = await actions.getDashboardPage({
        log: garden.log,
        page: plugin.dashboardPages[0],
        pluginName: "octant",
      })

      // Make sure the URL works, no need to check the output
      await got.get(url)

      expect(url.startsWith("http://127.0.0.1:")).to.be.true
    })
  })
})
