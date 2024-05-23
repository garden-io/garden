/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  SecretsUpdateCommand,
  getSecretsToCreate,
  getSecretsToUpdateByName,
} from "../../../../../../src/commands/cloud/secrets/secrets-update.js"
import { deline } from "../../../../../../src/util/string.js"
import { expectError, getDataDir, makeTestGarden } from "../../../../../helpers.js"
import type { Secret, SecretResult } from "../../../../../../src/commands/cloud/secrets/secret-helpers.js"

describe("SecretsUpdateCommand", () => {
  const projectRoot = getDataDir("test-project-b")
  const allSecrets: SecretResult[] = [
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
      },
      user: {
        name: "user1",
        id: "u1",
        vcsUsername: "u1",
      },
    },
  ]

  it("should throw an error when run without arguments", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new SecretsUpdateCommand()

    await expectError(
      () =>
        command.action({
          garden,
          log,
          args: { secretNamesOrIds: undefined },
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
    const actual = await getSecretsToUpdateByName({
      allSecrets,
      envName: undefined,
      userId: undefined,
      inputSecrets,
      log,
    })

    const expectedSecret = allSecrets.find((a) => a.id === "2")
    expect(actual).to.eql([
      {
        ...expectedSecret,
        newValue: "foo",
      },
    ])
  })

  it(`should throw an error when multiple secrets of same name are found, and user and env scopes are not set`, async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const inputSecrets: Secret[] = [{ name: "secret1", value: "foo" }]

    await expectError(
      () =>
        getSecretsToUpdateByName({
          allSecrets,
          envName: undefined,
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

    const actual = await getSecretsToUpdateByName({
      allSecrets,
      envName: "env1",
      userId: "u1",
      inputSecrets,
      log,
    })

    const expectedSecret = allSecrets.find((a) => a.id === "4")

    expect(actual).to.eql([
      {
        ...expectedSecret,
        newValue: "foo",
      },
    ])
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
      envName: "env1",
      userId: "u1",
      inputSecrets,
      log,
    })

    const secretsToCreate = getSecretsToCreate(inputSecrets, secretsToUpdate)

    expect(secretsToCreate).to.eql([["secretnew", "bar"]])
  })
})
