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
import { gardenEnv } from "../../../../src/constants.js"

function makeFakeAccount(
  organizationIds: string[] = ["fake-organization-id"]
): RouterOutput["account"]["getCurrentAccount"] {
  return {
    id: "user-123",
    name: "Test User",
    email: "test@example.com",
    avatarUrl: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    organizations: organizationIds.map((id) => ({
      id,
      name: `Org ${id}`,
      slug: id,
      role: "admin" as const,
      plan: "team" as const,
      isCurrentAccountOwner: true,
      featureFlags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  }
}

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
    account: {
      getCurrentAccount: {
        query: async () => makeFakeAccount(),
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
        importVariables: [{ from: "garden-cloud", list: "varlist_a" }],
        environmentName: "dev",
        log: garden.log,
        legacyProjectId: undefined,
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
        importVariables: [
          { from: "garden-cloud", list: "varlist_a" },
          { from: "garden-cloud", list: "varlist_b" },
        ],
        environmentName: "dev",
        log: garden.log,
        legacyProjectId: undefined,
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
            from: "garden-cloud",
            list: "varlist_a",
          },
          {
            from: "garden-cloud",
            list: "varlist_b",
          },
        ],
        environmentName: "dev",
        log: garden.log,
        legacyProjectId: undefined,
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
        importVariables: [
          { from: "garden-cloud", list: "varlist_a" },
          { from: "garden-cloud", list: "varlist_b" },
        ],
        environmentName: "dev",
        log: garden.log,
        legacyProjectId: undefined,
      })
      const varListALast = await cloudApi.getVariables({
        importVariables: [
          { from: "garden-cloud", list: "varlist_b" },
          { from: "garden-cloud", list: "varlist_a" },
        ],
        environmentName: "dev",
        log: garden.log,
        legacyProjectId: undefined,
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
            importVariables: [
              { from: "garden-cloud", list: "varlist_a" },
              { from: "garden-cloud", list: "varlist_b" },
            ],
            environmentName: "dev",
            log: garden.log,
            legacyProjectId: undefined,
          }),
        (err) => {
          expect(err.message).to.contain(`Garden Cloud API call failed with error`)
        }
      )
    })
  })

  describe("getDefaultOrganizationIdForLegacyProject", () => {
    it("should return organization id when organization is found", async () => {
      const fakeTrpcClient = makeFakeTrpcClient({
        organization: {
          legacyGetDefaultOrganization: {
            query: async () => {
              const res: RouterOutput["organization"]["legacyGetDefaultOrganization"] = {
                name: "Test Organization",
                slug: "test-org",
                id: "org-123",
              }
              return res
            },
          },
        },
      })

      const result = await GardenCloudApi.getDefaultOrganizationIdForLegacyProject(
        "https://example.com",
        "fake-auth-token",
        "legacy-project-123",
        fakeTrpcClient
      )

      expect(result).to.equal("org-123")
    })

    it("should return undefined when organization is not found", async () => {
      const fakeTrpcClient = makeFakeTrpcClient({
        organization: {
          legacyGetDefaultOrganization: {
            query: async () => {
              const res: RouterOutput["organization"]["legacyGetDefaultOrganization"] = {
                name: null,
                slug: null,
                id: null,
              }
              return res
            },
          },
        },
      })

      const result = await GardenCloudApi.getDefaultOrganizationIdForLegacyProject(
        "https://example.com",
        "fake-auth-token",
        "legacy-project-456",
        fakeTrpcClient
      )

      expect(result).to.be.undefined
    })
  })

  describe("factory", () => {
    const savedAuthToken = gardenEnv.GARDEN_AUTH_TOKEN

    beforeEach(() => {
      gardenEnv.GARDEN_AUTH_TOKEN = "fake-auth-token"
    })

    afterEach(() => {
      gardenEnv.GARDEN_AUTH_TOKEN = savedAuthToken
    })

    it("should resolve organization ID from legacyProjectId when organizationId is not provided", async () => {
      const fakeTrpcClient = makeFakeTrpcClient({
        token: {
          verifyToken: {
            query: async () => ({
              valid: true,
              notices: [],
            }),
          },
        },
        organization: {
          legacyGetDefaultOrganization: {
            query: async () => {
              const res: RouterOutput["organization"]["legacyGetDefaultOrganization"] = {
                name: "Test Organization",
                slug: "test-org",
                id: "org-123",
              }
              return res
            },
          },
        },
        account: {
          getCurrentAccount: {
            query: async () => makeFakeAccount(["org-123"]),
          },
        },
      })

      const api = await GardenCloudApi.factory({
        log: garden.log,
        cloudDomain: "https://example.com",
        organizationId: undefined,
        legacyProjectId: "legacy-project-123",
        globalConfigStore: garden.globalConfigStore,
        skipLogging: true,
        __trpcClientOverrideForTesting: fakeTrpcClient,
      })

      expect(api).to.be.instanceOf(GardenCloudApi)
      expect(api?.organizationId).to.equal("org-123")
    })

    it("should throw ParameterError when legacyProjectId is provided but organization is not found", async () => {
      const fakeTrpcClient = makeFakeTrpcClient({
        token: {
          verifyToken: {
            query: async () => ({
              valid: true,
              notices: [],
            }),
          },
        },
        organization: {
          legacyGetDefaultOrganization: {
            query: async () => {
              const res: RouterOutput["organization"]["legacyGetDefaultOrganization"] = {
                name: null,
                slug: null,
                id: null,
              }
              return res
            },
          },
        },
      })

      await expectError(
        () =>
          GardenCloudApi.factory({
            log: garden.log,
            cloudDomain: "https://example.com",
            organizationId: undefined,
            legacyProjectId: "legacy-project-456",
            globalConfigStore: garden.globalConfigStore,
            skipLogging: true,
            __trpcClientOverrideForTesting: fakeTrpcClient,
          }),
        (err) => {
          expect(err.message).to.contain("Could not determine organization ID")
        }
      )
    })

    it("should throw error when user lacks access to configured organization", async () => {
      const fakeTrpcClient = makeFakeTrpcClient({
        token: {
          verifyToken: {
            query: async () => ({ valid: true, notices: [] }),
          },
        },
        account: {
          getCurrentAccount: {
            query: async () => makeFakeAccount(["org-other"]),
          },
        },
      })

      await expectError(
        () =>
          GardenCloudApi.factory({
            log: garden.log,
            cloudDomain: "https://example.com",
            organizationId: "org-not-accessible",
            legacyProjectId: undefined,
            globalConfigStore: garden.globalConfigStore,
            skipLogging: true,
            __trpcClientOverrideForTesting: fakeTrpcClient,
          }),
        (err) => {
          expect(err.message).to.contain(
            "do not have access to the organization specified in your project configuration (id: org-not-accessible)"
          )
          expect(err.message).to.contain("- Org org-other (id: org-other)")
        }
      )
    })

    it("should throw error with empty org list when user has no organizations", async () => {
      const fakeTrpcClient = makeFakeTrpcClient({
        token: {
          verifyToken: {
            query: async () => ({ valid: true, notices: [] }),
          },
        },
        account: {
          getCurrentAccount: {
            query: async () => makeFakeAccount([]),
          },
        },
      })

      await expectError(
        () =>
          GardenCloudApi.factory({
            log: garden.log,
            cloudDomain: "https://example.com",
            organizationId: "org-123",
            legacyProjectId: undefined,
            globalConfigStore: garden.globalConfigStore,
            skipLogging: true,
            __trpcClientOverrideForTesting: fakeTrpcClient,
          }),
        (err) => {
          expect(err.message).to.contain(
            "do not have access to the organization specified in your project configuration (id: org-123)"
          )
          expect(err.message).to.contain("(none)")
        }
      )
    })

    it("should succeed when user has access to configured organization", async () => {
      const fakeTrpcClient = makeFakeTrpcClient({
        token: {
          verifyToken: {
            query: async () => ({ valid: true, notices: [] }),
          },
        },
        account: {
          getCurrentAccount: {
            query: async () => makeFakeAccount(["org-123", "org-456"]),
          },
        },
      })

      const api = await GardenCloudApi.factory({
        log: garden.log,
        cloudDomain: "https://example.com",
        organizationId: "org-123",
        legacyProjectId: undefined,
        globalConfigStore: garden.globalConfigStore,
        skipLogging: true,
        __trpcClientOverrideForTesting: fakeTrpcClient,
      })

      expect(api).to.be.instanceOf(GardenCloudApi)
      expect(api?.organizationId).to.equal("org-123")
    })
  })
})
