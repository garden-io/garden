/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { computeKeyPathsToIgnoreFromConfig } from "../../../../src/tasks/helpers"
import { DeployActionConfig } from "../../../../src/actions/deploy"
import { DEFAULT_DEPLOY_TIMEOUT_SEC } from "../../../../src/constants"

describe("TaskHelpers", () => {
  context("computeKeyPathsToIgnoreFromConfig", () => {
    const config: DeployActionConfig = {
      internal: { basePath: "" },
      timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
      kind: "Deploy",
      type: "container",
      name: "foo",
      noCache: {
        disabled: false,
        variables: ["${var.hostname}"],
      },
      variables: {
        hostname: "foo.com",
      },
      spec: {
        ingresses: [
          {
            path: "/",
            port: "http",
            hostname: "foo.${var.hostname}",
          },
        ],
        env: {
          foo: 'bar'
        }
      },
    }
    it("returns an empty array when ignoreVars is empty", () => {
      const ignoreVars: string[] = []
      const result = computeKeyPathsToIgnoreFromConfig(config, ignoreVars)
      expect(result).to.eql([])
    })

    it("returns an empty array when no keys match ignoreVars", () => {
      const ignoreVars = ["corge"]
      const result = computeKeyPathsToIgnoreFromConfig(config, ignoreVars)
      expect(result).to.eql([])
    })

    it("returns an array of matching keys and values", () => {
      const ignoreVars = ["hostname"]
      const result = computeKeyPathsToIgnoreFromConfig(config, ignoreVars)
      expect(result).to.eql([
        {
          key: "noCache.variables.0",
          matchedValue: "${var.hostname}",
        },
        { key: "spec.ingresses.0.hostname", matchedValue: "foo.${var.hostname}" },
        { key: "variables.hostname", matchedValue: "foo.com" },
      ])
    })
  })
})
