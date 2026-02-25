/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type tmp from "tmp-promise"
import { getDataDir, makeTempDir, makeTestGarden } from "../../../../helpers.js"
import type { ApiTrpcClient } from "../../../../../src/cloud/api/trpc.js"
import { getRootLogger } from "../../../../../src/logger/logger.js"
import type { DeepPartial } from "../../../../../src/util/util.js"
import { makeFakeCloudApi } from "../../../../helpers/api.js"
import { GetRemoteVariablesCommand } from "../../../../../src/commands/get/get-remote-variables.js"

function makeFakeTrpcClient(overrides?: DeepPartial<ApiTrpcClient>): ApiTrpcClient {
  const base: DeepPartial<ApiTrpcClient> = {
    variableList: {
      getValues: {
        query: async () => {
          return {
            SECRET_VAR: {
              value: "secret-val",
              isSecret: true,
              scopedAccountId: null,
              scopedGardenEnvironmentId: null,
            },
          }
        },
      },
    },
    variable: {
      list: {
        query: async () => {
          return {
            items: [
              {
                id: "0c76b1ba-0384-405c-8a0e-089ef31a953d",
                organizationId: "40175549-6d62-4ba9-8b92-895ba0a3a9b2",
                createdByAccountId: "6bf2f162-441f-4710-90ec-e13f642fcd32",
                name: "SECRET_VAR",
                value: "<secret>",
                description: "my-var",
                isSecret: true,
                expiresAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                scopedGardenEnvironmentId: null,
                scopedAccountId: null,
                variableListName: "list-1",
                variableListDescription: "Variable list 1",
                createdByName: "Some user",
                environmentName: null,
                scopedAccountName: null,
              },
            ],
            nextCursor: undefined,
          }
        },
      },
    },
  }
  return { ...(base as unknown as ApiTrpcClient), ...(overrides as ApiTrpcClient) }
}

describe("GetRemoteVariablesCommand", () => {
  const varProjectRoot = getDataDir("test-projects", "get-variables-command")
  let configStoreTmpDir: tmp.DirectoryResult
  const command = new GetRemoteVariablesCommand()
  const log = getRootLogger().createLog()

  before(async () => {
    configStoreTmpDir = await makeTempDir()
  })

  after(async () => {
    await configStoreTmpDir.cleanup()
  })

  function makeVarItem(overrides: {
    name: string
    id: string
    variableListId: string
    variableListName: string
    isSecret?: boolean
    description?: string
  }) {
    return {
      id: overrides.id,
      organizationId: "40175549-6d62-4ba9-8b92-895ba0a3a9b2",
      createdByAccountId: "6bf2f162-441f-4710-90ec-e13f642fcd32",
      name: overrides.name,
      value: overrides.isSecret ? "<secret>" : "some-value",
      description: overrides.description || "",
      isSecret: overrides.isSecret ?? false,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scopedGardenEnvironmentId: null,
      scopedGardenEnvironmentName: null,
      scopedGardenEnvironmentAdminOnly: null,
      scopedAccountId: null,
      scopedAccountName: null,
      variableListId: overrides.variableListId,
      variableListName: overrides.variableListName,
      variableListDescription: "",
      variableListAdminOnly: null,
      createdByName: "Some user",
      environmentName: null,
    }
  }

  it("returns remote variables", async () => {
    const overrideCloudApiFactory = async () =>
      await makeFakeCloudApi({
        trpcClient: makeFakeTrpcClient({
          variable: {
            list: {
              query: async () => {
                return {
                  items: [
                    {
                      id: "0c76b1ba-0384-405c-8a0e-089ef31a953d",
                      organizationId: "40175549-6d62-4ba9-8b92-895ba0a3a9b2",
                      createdByAccountId: "6bf2f162-441f-4710-90ec-e13f642fcd32",
                      name: "SECRET_VAR",
                      value: "<secret>",
                      description: "my-var",
                      isSecret: true,
                      expiresAt: null,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      scopedGardenEnvironmentId: null,
                      scopedAccountId: null,
                      variableListId: "varlist_foobar",
                      variableListName: "list-1",
                      variableListDescription: "Variable list 1",
                      createdByName: "Some user",
                      environmentName: null,
                      scopedAccountName: null,
                    },
                  ],
                  nextCursor: undefined,
                }
              },
            },
          },
        }),
        configStoreTmpDir,
        log,
      })
    const garden = await makeTestGarden(varProjectRoot, {
      overrideCloudApiFactory,
    })
    const { result } = await garden.runCommand({
      command,
      args: {},
      opts: {},
    })

    expect(result).to.eql({
      variables: [
        {
          name: "SECRET_VAR",
          id: "0c76b1ba-0384-405c-8a0e-089ef31a953d",
          value: "<secret>",
          isSecret: true,
          supersededBy: null,
          variableListId: "varlist_foobar",
          variableListName: "list-1",
          scopedToEnvironment: "None",
          scopedToUser: "None",
          expiresAt: null,
          description: "my-var",
          scopedAccountId: null,
          scopedEnvironmentId: null,
        },
      ],
    })
  })

  it("sorts variables by variable list order then by name within each list", async () => {
    const overrideCloudApiFactory = async () => {
      const api = await makeFakeCloudApi({
        trpcClient: makeFakeTrpcClient({
          variable: {
            list: {
              query: async ({ variableListId }: { variableListId: string }) => {
                if (variableListId === "varlist_list-a") {
                  return {
                    items: [
                      makeVarItem({
                        name: "ZEBRA_VAR",
                        id: "id-3",
                        variableListId: "varlist_list-a",
                        variableListName: "list-a",
                      }),
                      makeVarItem({
                        name: "ALPHA_VAR",
                        id: "id-1",
                        variableListId: "varlist_list-a",
                        variableListName: "list-a",
                      }),
                    ],
                    nextCursor: undefined,
                  }
                }
                if (variableListId === "varlist_list-b") {
                  return {
                    items: [
                      makeVarItem({
                        name: "MIDDLE_VAR",
                        id: "id-4",
                        variableListId: "varlist_list-b",
                        variableListName: "list-b",
                      }),
                      makeVarItem({
                        name: "BETA_VAR",
                        id: "id-2",
                        variableListId: "varlist_list-b",
                        variableListName: "list-b",
                      }),
                    ],
                    nextCursor: undefined,
                  }
                }
                return { items: [], nextCursor: undefined }
              },
            },
          },
        }),
        configStoreTmpDir,
        log,
      })
      // Override getVariableListIds to return two lists in a specific order
      api.getVariableListIds = async () => ["varlist_list-a", "varlist_list-b"]
      return api
    }
    const garden = await makeTestGarden(varProjectRoot, {
      overrideCloudApiFactory,
    })
    const { result } = await garden.runCommand({
      command,
      args: {},
      opts: {},
    })

    // Variables should be sorted: first by list order (list-a before list-b), then by name within each list
    const names = result!.variables.map((v) => v.name)
    expect(names).to.eql(["ALPHA_VAR", "ZEBRA_VAR", "BETA_VAR", "MIDDLE_VAR"])
    // No duplicates across lists, so none should be superseded
    expect(result!.variables.every((v) => v.supersededBy === null)).to.be.true
  })

  it("sets supersededBy to the winning list name when a later list defines the same variable", async () => {
    const overrideCloudApiFactory = async () => {
      const api = await makeFakeCloudApi({
        trpcClient: makeFakeTrpcClient({
          variable: {
            list: {
              query: async ({ variableListId }: { variableListId: string }) => {
                if (variableListId === "varlist_list-a") {
                  return {
                    items: [
                      makeVarItem({
                        name: "SHARED_VAR",
                        id: "id-1",
                        variableListId: "varlist_list-a",
                        variableListName: "list-a",
                      }),
                      makeVarItem({
                        name: "ONLY_A",
                        id: "id-2",
                        variableListId: "varlist_list-a",
                        variableListName: "list-a",
                      }),
                    ],
                    nextCursor: undefined,
                  }
                }
                if (variableListId === "varlist_list-b") {
                  return {
                    items: [
                      makeVarItem({
                        name: "SHARED_VAR",
                        id: "id-3",
                        variableListId: "varlist_list-b",
                        variableListName: "list-b",
                      }),
                      makeVarItem({
                        name: "ONLY_B",
                        id: "id-4",
                        variableListId: "varlist_list-b",
                        variableListName: "list-b",
                      }),
                    ],
                    nextCursor: undefined,
                  }
                }
                return { items: [], nextCursor: undefined }
              },
            },
          },
        }),
        configStoreTmpDir,
        log,
      })
      api.getVariableListIds = async () => ["varlist_list-a", "varlist_list-b"]
      return api
    }
    const garden = await makeTestGarden(varProjectRoot, {
      overrideCloudApiFactory,
    })
    const { result } = await garden.runCommand({
      command,
      args: {},
      opts: {},
    })

    const vars = result!.variables.map((v) => ({
      name: v.name,
      variableListName: v.variableListName,
      supersededBy: v.supersededBy,
    }))
    expect(vars).to.eql([
      { name: "ONLY_A", variableListName: "list-a", supersededBy: null },
      { name: "SHARED_VAR", variableListName: "list-a", supersededBy: "list-b" },
      { name: "ONLY_B", variableListName: "list-b", supersededBy: null },
      { name: "SHARED_VAR", variableListName: "list-b", supersededBy: null },
    ])
  })
})
