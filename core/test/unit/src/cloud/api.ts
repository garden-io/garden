/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { Garden } from "../../../../src/garden.js"
import { expectError, makeTestGardenA } from "../../../helpers.js"
import { GardenCloudApi } from "../../../../src/cloud/api/api.js"
import type { ApiTrpcClient, RouterOutput } from "../../../../src/cloud/api/trpc.js"
import type { DeepPartial } from "utility-types"
import { TRPCClientError } from "@trpc/client"

function makeFakeTrpcClient(overrides?: DeepPartial<ApiTrpcClient>): ApiTrpcClient {
  const base: DeepPartial<ApiTrpcClient> = {
    variableList: {
      getValues: {
        query: async () => {
          return {
            variableA: {
              value: "variable-a-val",
              isSecret: true,
              scopedAccountId: null,
              scopedGardenEnvironmentId: null,
            },
            variableB: {
              value: "variable-b-val",
              isSecret: true,
              scopedAccountId: null,
              scopedGardenEnvironmentId: null,
            },
          }
        },
      },
    },
  }
  return { ...(base as unknown as ApiTrpcClient), ...(overrides as ApiTrpcClient) }
}

describe("GardenCloudApi", () => {
  let garden: Garden

  before(async () => {
    garden = await makeTestGardenA()
  })

  afterEach(async () => {
    if (garden) {
      garden.close()
    }
  })

  describe("getVariables", () => {
    it("should return variables from variable list", async () => {
      const cloudApi = new GardenCloudApi({
        log: garden.log,
        domain: "https://example.com",
        globalConfigStore: garden.globalConfigStore,
        organizationId: "fake-organization-id",
        authToken: "fake-auth-token",
        __trpcClientOverrideForTesting: makeFakeTrpcClient(),
      })

      const variables = await cloudApi.getVariables({
        importVariables: "varlist_a",
        environmentName: "dev",
        log: garden.log,
      })

      expect(variables).to.eql({
        variableA: "variable-a-val",
        variableB: "variable-b-val",
      })
    })
    it("should handle multiple variable lists", async () => {
      const cloudApi = new GardenCloudApi({
        log: garden.log,
        domain: "https://example.com",
        globalConfigStore: garden.globalConfigStore,
        organizationId: "fake-organization-id",
        authToken: "fake-auth-token",
        __trpcClientOverrideForTesting: makeFakeTrpcClient({
          variableList: {
            getValues: {
              query: async (input) => {
                if (input.variableListId === "varlist_a") {
                  const res: RouterOutput["variableList"]["getValues"] = {
                    variableA: {
                      value: "variable-a-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                    variableB: {
                      value: "variable-b-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                  }
                  return res
                } else {
                  const res: RouterOutput["variableList"]["getValues"] = {
                    variableC: {
                      value: "variable-c-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                  }
                  return res
                }
              },
            },
          },
        }),
      })

      const variables = await cloudApi.getVariables({
        importVariables: ["varlist_a", "varlist_b"],
        environmentName: "dev",
        log: garden.log,
      })

      expect(variables).to.eql({
        variableA: "variable-a-val",
        variableB: "variable-b-val",
        variableC: "variable-c-val",
      })
    })
    it("should handle the verbose remote variable config", async () => {
      const cloudApi = new GardenCloudApi({
        log: garden.log,
        domain: "https://example.com",
        globalConfigStore: garden.globalConfigStore,
        organizationId: "fake-organization-id",
        authToken: "fake-auth-token",
        __trpcClientOverrideForTesting: makeFakeTrpcClient({
          variableList: {
            getValues: {
              query: async (input) => {
                if (input.variableListId === "varlist_a") {
                  const res: RouterOutput["variableList"]["getValues"] = {
                    variableA: {
                      value: "variable-a-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                    variableB: {
                      value: "variable-b-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                  }
                  return res
                } else {
                  const res: RouterOutput["variableList"]["getValues"] = {
                    variableC: {
                      value: "variable-c-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                  }
                  return res
                }
              },
            },
          },
        }),
      })

      const variables = await cloudApi.getVariables({
        importVariables: [
          {
            source: "garden-cloud",
            varlist: "varlist_a",
          },
          {
            source: "garden-cloud",
            varlist: "varlist_b",
          },
        ],
        environmentName: "dev",
        log: garden.log,
      })

      expect(variables).to.eql({
        variableA: "variable-a-val",
        variableB: "variable-b-val",
        variableC: "variable-c-val",
      })
    })
    it("should merge variables in list order", async () => {
      const cloudApi = new GardenCloudApi({
        log: garden.log,
        domain: "https://example.com",
        globalConfigStore: garden.globalConfigStore,
        organizationId: "fake-organization-id",
        authToken: "fake-auth-token",
        __trpcClientOverrideForTesting: makeFakeTrpcClient({
          variableList: {
            getValues: {
              query: async (input) => {
                if (input.variableListId === "varlist_a") {
                  const res: RouterOutput["variableList"]["getValues"] = {
                    variableA: {
                      value: "variable-a-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                    variableB: {
                      value: "variable-b-val-list_1",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                  }
                  return res
                } else {
                  const res: RouterOutput["variableList"]["getValues"] = {
                    variableB: {
                      value: "variable-b-val-list_2",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                  }
                  return res
                }
              },
            },
          },
        }),
      })

      const varListBLast = await cloudApi.getVariables({
        importVariables: ["varlist_a", "varlist_b"],
        environmentName: "dev",
        log: garden.log,
      })
      const varListALast = await cloudApi.getVariables({
        importVariables: ["varlist_b", "varlist_a"],
        environmentName: "dev",
        log: garden.log,
      })

      expect(varListBLast).to.eql({
        variableA: "variable-a-val",
        variableB: "variable-b-val-list_2",
      })
      expect(varListALast).to.eql({
        variableA: "variable-a-val",
        variableB: "variable-b-val-list_1",
      })
    })
    it("should throw if fetching variables from any list fails", async () => {
      const cloudApi = new GardenCloudApi({
        log: garden.log,
        domain: "https://example.com",
        globalConfigStore: garden.globalConfigStore,
        organizationId: "fake-organization-id",
        authToken: "fake-auth-token",
        __trpcClientOverrideForTesting: makeFakeTrpcClient({
          variableList: {
            getValues: {
              query: async (input) => {
                if (input.variableListId === "varlist_a") {
                  const res: RouterOutput["variableList"]["getValues"] = {
                    variableA: {
                      value: "variable-a-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedGardenEnvironmentId: null,
                    },
                  }
                  return res
                } else {
                  throw new TRPCClientError("bad stuff")
                }
              },
            },
          },
        }),
      })

      await expectError(
        () =>
          cloudApi.getVariables({
            importVariables: ["varlist_a", "varlist_b"],
            environmentName: "dev",
            log: garden.log,
          }),
        (err) => {
          expect(err.message).to.contain(`Garden Cloud API call failed with error`)
        }
      )
    })
  })
})
