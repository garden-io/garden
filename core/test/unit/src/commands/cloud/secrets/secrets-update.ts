/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type tmp from "tmp-promise"
import { expect } from "chai"
import type { SecretResult as CloudApiSecretResult } from "@garden-io/platform-api-types"
import {
  SecretsUpdateCommand,
  getSecretsToCreate,
  getSecretsToUpdateByName,
} from "../../../../../../src/commands/cloud/secrets/secrets-update.js"
import { deline } from "../../../../../../src/util/string.js"
import { createProjectConfig, expectError, getDataDir, makeTempDir, makeTestGarden } from "../../../../../helpers.js"
import type { Secret, SingleUpdateSecretRequest } from "../../../../../../src/cloud/api-legacy/api.js"
import { FakeGardenCloudApiLegacy, makeFakeCloudApi } from "../../../../../helpers/api.js"
import type { ApiTrpcClient } from "../../../../../../src/cloud/api/trpc.js"
import { getRootLogger } from "../../../../../../src/logger/logger.js"

describe("SecretsUpdateCommand", () => {
  let configStoreTmpDir: tmp.DirectoryResult
  const log = getRootLogger().createLog()
  const projectRoot = getDataDir("test-project-b")
  const allSecrets: CloudApiSecretResult[] = [
    {
      id: "1",
      createdAt: "",
      updatedAt: "",
      name: "secret1",
    },
    {
      id: "2",
      createdAt: "",
      updatedAt: "",
      name: "secret2",
    },
    {
      id: "3",
      createdAt: "",
      updatedAt: "",
      name: "secret1",
      environment: {
        name: "env1",
        id: "e1",
        projectId: "projectId",
        createdAt: "1970-01-01T00:00:00Z",
        updatedAt: "1970-01-01T00:00:00Z",
      },
    },
    {
      id: "4",
      createdAt: "",
      updatedAt: "",
      name: "secret1",
      environment: {
        name: "env1",
        id: "e1",
        projectId: "projectId",
        createdAt: "1970-01-01T00:00:00Z",
        updatedAt: "1970-01-01T00:00:00Z",
      },
      user: {
        name: "user1",
        id: "u1",
        vcsUsername: "u1",
        createdAt: "1970-01-01T00:00:00Z",
        updatedAt: "1970-01-01T00:00:00Z",
        serviceAccount: false,
      },
    },
  ]

  before(async () => {
    configStoreTmpDir = await makeTempDir()
  })

  after(async () => {
    await configStoreTmpDir.cleanup()
  })

  it("should throw an error if jOT using legacy Garden Cloud", async () => {
    const overrideCloudApiFactory = async () =>
      await makeFakeCloudApi({
        trpcClient: {} as ApiTrpcClient,
        configStoreTmpDir,
        log,
      })
    const garden = await makeTestGarden(projectRoot, {
      config: createProjectConfig({ organizationId: "fake-org-id" }),
      overrideCloudApiFactory,
    })
    const command = new SecretsUpdateCommand()

    await expectError(
      () =>
        command.action({
          garden,
          log,
          args: { secretNamesOrIds: undefined },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          opts: {} as any,
        }),
      (err) => {
        expect(err.message).to.include("Looks like you're logged into Garden Cloud")
      }
    )
  })

  it("should throw an error when run without arguments", async () => {
    const garden = await makeTestGarden(projectRoot, {
      config: createProjectConfig({ domain: "https://example.com", id: "fake-project-id" }),
      overrideCloudApiLegacyFactory: FakeGardenCloudApiLegacy.factory,
    })
    const log = garden.log
    const command = new SecretsUpdateCommand()

    await expectError(
      () =>
        command.action({
          garden,
          log,
          args: { secretNamesOrIds: undefined },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          opts: {} as any,
        }),
      (err) => {
        expect(err.message).to.equal(
          "No secret(s) provided. Either provide secret(s) directly to the command or via the --from-file flag."
        )
      }
    )
  })

  it("should get correct secrets to update when secret is not scoped to env and user", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const inputSecrets: Secret[] = [{ name: "secret2", value: "foo" }]
    const actualSecret = await getSecretsToUpdateByName({
      allSecrets,
      environmentName: undefined,
      userId: undefined,
      inputSecrets,
      log,
    })

    const matchingSecret = allSecrets.find((a) => a.id === "2")!
    const expectedSecret: SingleUpdateSecretRequest = {
      id: matchingSecret.id,
      environmentId: matchingSecret.environment?.id,
      userId: matchingSecret.user?.id,
      name: matchingSecret.name,
      value: "foo",
    }
    expect(actualSecret).to.eql([expectedSecret])
  })

  it(`should throw an error when multiple secrets of same name are found, and user and env scopes are not set`, async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const inputSecrets: Secret[] = [{ name: "secret1", value: "foo" }]

    await expectError(
      () =>
        getSecretsToUpdateByName({
          allSecrets,
          environmentName: undefined,
          userId: undefined,
          inputSecrets,
          log,
        }),
      (err) => {
        expect(err.message).to.eql(
          deline`Multiple secrets with the name(s) secret1 found. Either update the secret(s)
          by ID or use the --scope-to-env and --scope-to-user-id flags to update the scoped secret(s).`
        )
      }
    )
  })

  it(`should get correct secrets to update when multiple secrets of same name are found, and user and env scopes are set`, async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const inputSecrets: Secret[] = [{ name: "secret1", value: "foo" }]

    const actualSecret = await getSecretsToUpdateByName({
      allSecrets,
      environmentName: "env1",
      userId: "u1",
      inputSecrets,
      log,
    })

    const matchingSecret = allSecrets.find((a) => a.id === "4")!
    const expectedSecret: SingleUpdateSecretRequest = {
      id: matchingSecret.id,
      environmentId: matchingSecret.environment?.id,
      userId: matchingSecret.user?.id,
      name: matchingSecret.name,
      value: "foo",
    }
    expect(actualSecret).to.eql([expectedSecret])
  })

  it(`should get correct difference between new secrets and existing secrets for upsert`, async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const inputSecrets: Secret[] = [
      { name: "secret1", value: "foo" },
      { name: "secretnew", value: "bar" },
    ]

    const secretsToUpdate = await getSecretsToUpdateByName({
      allSecrets,
      environmentName: "env1",
      userId: "u1",
      inputSecrets,
      log,
    })

    const secretsToCreate = getSecretsToCreate(inputSecrets, secretsToUpdate)

    expect(secretsToCreate).to.eql([{ name: "secretnew", value: "bar" }])
  })
})
