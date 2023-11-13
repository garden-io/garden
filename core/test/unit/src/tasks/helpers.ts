/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  findCacheKeyPathsToExcludeFromConfig,
  findMatchingKeyPathsFromWildcardPaths,
} from "../../../../src/tasks/helpers.js"
import type { DeployActionConfig } from "../../../../src/actions/deploy.js"
import { DEFAULT_DEPLOY_TIMEOUT_SEC } from "../../../../src/constants.js"

describe("TaskHelpers", () => {
  context("cache exclude key paths", () => {
    const config: DeployActionConfig = {
      internal: { basePath: "" },
      timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
      kind: "Deploy",
      type: "container",
      name: "foo",
      cache: {
        exclude: {
          paths: [],
        },
      },
      variables: {
        hostname: "foo.com",
      },
      spec: {
        ports: [
          {
            name: "http",
            containerPort: 8080,
            servicePort: 80,
          },
        ],
        healthCheck: {
          httpGet: {
            path: "/",
            port: "http",
          },
        },
        ingresses: [
          {
            path: "/",
            port: "http",
            hostname: "foo.${var.hostname}",
          },
          {
            path: "/",
            port: "http",
            hostname: "api.foo",
          },
          {
            path: "/",
            port: "http",
            hostname: "proxy.${var.base-hostname}",
          },
        ],
        env: {
          hostname: "vote.${var.base-hostname}",
          username: "${local.username}",
        },
      },
    }

    context("findKeyPathsToExcludeFromConfig", () => {
      it("returns an empty array when cache exclude paths are not specified", () => {
        const result = findCacheKeyPathsToExcludeFromConfig(config)
        expect(result).to.eql([])
      })

      it("returns an array with paths correctly, when cache exclude paths are without wildcard paths", () => {
        const config1 = {
          ...config,
          cache: {
            exclude: {
              paths: ["spec.ingresses.0.hostname"],
            },
          },
        }
        const result = findCacheKeyPathsToExcludeFromConfig(config1)
        expect(result).to.eql(["spec.ingresses.0.hostname"])
      })

      it("returns an array with paths correctly, when cache exclude paths include wildcard paths", () => {
        const config1 = {
          ...config,
          cache: {
            exclude: {
              paths: ["spec.ingresses.*.hostname"],
            },
          },
        }
        const result = findCacheKeyPathsToExcludeFromConfig(config1)
        expect(result).to.eql(["spec.ingresses.0.hostname", "spec.ingresses.1.hostname", "spec.ingresses.2.hostname"])
      })

      it("returns an array with paths correctly, when cache exclude paths include wildcard paths and fixed paths together", () => {
        const config1 = {
          ...config,
          cache: {
            exclude: {
              paths: ["spec.ingresses.*.hostname", "spec.env"],
            },
          },
        }
        const result = findCacheKeyPathsToExcludeFromConfig(config1)
        expect(result).to.have.members([
          "spec.ingresses.0.hostname",
          "spec.ingresses.1.hostname",
          "spec.ingresses.2.hostname",
          "spec.env",
        ])
      })
    })

    context("findMatchingKeyPathsFromWildcardPaths", () => {
      it("returns an empty array when cache exclude paths are not specified", () => {
        const excludePatterns: string[] = []
        const result = findMatchingKeyPathsFromWildcardPaths(config, excludePatterns)
        expect(result).to.eql([])
      })

      it("returns the matching paths from the wildcard correctly", () => {
        // * in the middle of the pattern
        const excludePatterns1: string[] = ["spec.ingresses.*.hostname"]
        const result1 = findMatchingKeyPathsFromWildcardPaths(config, excludePatterns1)
        expect(result1).to.eql(["spec.ingresses.0.hostname", "spec.ingresses.1.hostname", "spec.ingresses.2.hostname"])

        // * at the beginning of the pattern
        const excludePatterns2: string[] = ["*.hostname"]
        const result2 = findMatchingKeyPathsFromWildcardPaths(config, excludePatterns2)
        expect(result2).to.eql([
          "variables.hostname",
          "spec.ingresses.0.hostname",
          "spec.ingresses.1.hostname",
          "spec.ingresses.2.hostname",
          "spec.env.hostname",
        ])

        // * is in the middle and for nested array/objects
        const excludePatterns3: string[] = ["spec.*.hostname"]
        const result3 = findMatchingKeyPathsFromWildcardPaths(config, excludePatterns3)
        expect(result3).to.eql([
          "spec.ingresses.0.hostname",
          "spec.ingresses.1.hostname",
          "spec.ingresses.2.hostname",
          "spec.env.hostname",
        ])
      })
    })
  })
})
