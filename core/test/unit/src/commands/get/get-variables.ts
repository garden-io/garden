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
import { GetVariablesCommand } from "../../../../../src/commands/get/get-variables.js"
import type { ApiTrpcClient } from "../../../../../src/cloud/api/trpc.js"
import { getRootLogger } from "../../../../../src/logger/logger.js"
import type { DeepPartial } from "../../../../../src/util/util.js"
import { gardenEnv } from "../../../../../src/constants.js"
import { makeFakeCloudApi } from "../../../../helpers/api.js"

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
      listVariables: {
        query: async () => {
          return {
            items: [
              {
                id: "0c76b1ba-0384-405c-8a0e-089ef31a953d",
                organizationId: "40175549-6d62-4ba9-8b92-895ba0a3a9b2",
                createdByAccountId: "6bf2f162-441f-4710-90ec-e13f642fcd32",
                name: "SECRET_VAR",
                value: "<secret>",
                description: null,
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

describe("GetVariablesCommand", () => {
  const varProjectRoot = getDataDir("test-projects", "get-variables-command")
  // TODO: Remove this once variables are GA
  const originalEnvVal = gardenEnv.GARDEN_EXPERIMENTAL_USE_CLOUD_VARIABLES
  let configStoreTmpDir: tmp.DirectoryResult
  const command = new GetVariablesCommand()
  const log = getRootLogger().createLog()

  before(async () => {
    gardenEnv.GARDEN_EXPERIMENTAL_USE_CLOUD_VARIABLES = true
    configStoreTmpDir = await makeTempDir()
  })

  after(async () => {
    await configStoreTmpDir.cleanup()
    gardenEnv.GARDEN_EXPERIMENTAL_USE_CLOUD_VARIABLES = originalEnvVal
  })

  it("returns all variables for project, leaving action-level template strings unresolved", async () => {
    const overrideCloudApiFactory = async () =>
      await makeFakeCloudApi({
        trpcClient: makeFakeTrpcClient(),
        configStoreTmpDir,
        log,
      })
    const garden = await makeTestGarden(varProjectRoot, {
      overrideCloudApiFactory,
    })
    const { result } = await garden.runCommand({
      command,
      args: {},
      opts: { "exclude-disabled": false, "resolve": "partial", "filter-actions": [] },
    })

    const runtimeVar = result.variables.find((v) => v.name === "runtimeVar")
    const varfileVarOverwrite = result.variables.find((v) => v.name === "actionVarfileVarToOverwrite")

    expect(runtimeVar.value).to.eql(
      '"${actions.run.my-run.outputs.log}"',
      "should not resolve action-level template strings"
    )
    expect(varfileVarOverwrite.value).to.eql('"this-overwrites-var-from-config"', "should correctly apply varfile vars")

    expect(result).to.eql({
      variables: [
        {
          name: "userId",
          value: '"my-user-id"',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
        },
        {
          name: "secretVar",
          value: "<secret>",
          source: "Garden Cloud",
          isSecret: true,
          details: "From fake-varlist (list-1)",
          path: "garden.yml",
        },
        {
          name: "nested",
          value: '{"foo":"bar"}',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
        },
        {
          name: "array",
          value: '["foo","bar"]',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
        },
        {
          name: "deepNested",
          value: '{"foo":{"bar":"bas"}}',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
        },
        {
          name: "projectvarfilevar",
          value: '"variable-from-project-varfile"',
          source: "varfile",
          isSecret: false,
          details: "From varfile ./project-varfile.env",
          path: "garden.yml",
        },
        {
          name: "ingressPath",
          value: '"/hello"',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
          action: "Run.my-run",
        },
        {
          name: "ingressPath",
          value: '"/hello"',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
          action: "Run.my-run-2",
        },
        {
          name: "foo",
          value: '"baz"',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
          action: "Run.my-run-2",
        },
        {
          name: "runtimeVar",
          value: '"${actions.run.my-run.outputs.log}"',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
          action: "Run.my-run-2",
        },
        {
          name: "actionvarfilevar1",
          value: '"variable-from-action-varfile"',
          source: "varfile",
          isSecret: false,
          details: "From varfile ./action-varfile.env",
          path: "garden.yml",
          action: "Run.my-run-2",
        },
        {
          name: "actionVarfileVarToOverwrite",
          value: '"this-overwrites-var-from-config"',
          source: "varfile",
          isSecret: false,
          details: "From varfile ./action-varfile.env",
          path: "garden.yml",
          action: "Run.my-run-2",
        },
      ],
    })
  })
  it("optionally resolves action-level variables", async () => {
    const overrideCloudApiFactory = async () =>
      await makeFakeCloudApi({
        trpcClient: makeFakeTrpcClient(),
        configStoreTmpDir,
        log,
      })
    const garden = await makeTestGarden(varProjectRoot, {
      overrideCloudApiFactory,
    })
    const { result } = await garden.runCommand({
      command,
      args: {},
      opts: { "exclude-disabled": false, "resolve": "full", "filter-actions": [] },
    })

    const runtimeVar = result.variables.find((v) => v.name === "runtimeVar")
    expect(runtimeVar.value).to.eql('"hello from run action"')
  })
  it("optionally filters on actions", async () => {
    const overrideCloudApiFactory = async () =>
      await makeFakeCloudApi({
        trpcClient: makeFakeTrpcClient(),
        configStoreTmpDir,
        log,
      })
    const garden = await makeTestGarden(varProjectRoot, {
      overrideCloudApiFactory,
    })
    const { result } = await garden.runCommand({
      command,
      args: {},
      opts: { "exclude-disabled": false, "resolve": "full", "filter-actions": ["Run.my-run"] },
    })

    expect(result).to.eql({
      variables: [
        {
          name: "userId",
          value: '"my-user-id"',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
        },
        {
          name: "secretVar",
          value: "<secret>",
          source: "Garden Cloud",
          isSecret: true,
          details: "From fake-varlist (list-1)",
          path: "garden.yml",
        },
        {
          name: "nested",
          value: '{"foo":"bar"}',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
        },
        {
          name: "array",
          value: '["foo","bar"]',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
        },
        {
          name: "deepNested",
          value: '{"foo":{"bar":"bas"}}',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
        },
        {
          name: "projectvarfilevar",
          value: '"variable-from-project-varfile"',
          source: "varfile",
          isSecret: false,
          details: "From varfile ./project-varfile.env",
          path: "garden.yml",
        },
        {
          name: "ingressPath",
          value: '"/hello"',
          source: "local",
          isSecret: false,
          details: "",
          path: "garden.yml",
          action: "Run.my-run",
        },
      ],
    })
  })
})
