/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { KubernetesError } from "../../../../../src/plugins/kubernetes/api.js"
import type { ErrorEvent, WebSocket } from "ws"
import { shouldRetry, toKubernetesError } from "../../../../../src/plugins/kubernetes/retry.js"
import { expect } from "chai"
import dedent from "dedent"
import { expectError } from "../../../../helpers.js"

const testKubeOp = "test"
const websocketError: ErrorEvent = {
  error: new Error("error message"),
  message: "This is a test error message",
  type: "error",
  target: true as unknown as WebSocket,
}
const plainError = new Error("failed to refresh token")
const syntaxError = new SyntaxError("invalid syntax")

describe("toKubernetesError", () => {
  it("should handle WebsocketError", () => {
    const err = toKubernetesError(websocketError, testKubeOp)

    expect(err).to.be.instanceof(KubernetesError)
    expect(err.message).to.equal(dedent`
      Error while performing Kubernetes API operation test: WebsocketError

      This is a test error message
    `)
    expect(err.responseStatusCode).to.be.undefined
    expect(err.apiMessage).to.be.undefined
    expect(err.type).to.equal("kubernetes")
  })

  it("should handle plain error gracefully", () => {
    const err = toKubernetesError(plainError, testKubeOp)

    expect(err).to.be.instanceof(KubernetesError)
    expect(err.message).to.equal(dedent`
      Error while performing Kubernetes API operation test: Error

      failed to refresh token
    `)
    expect(err.responseStatusCode).to.be.undefined
    expect(err.apiMessage).to.be.undefined
    expect(err.type).to.equal("kubernetes")
  })

  it("should crash on other errors like TypeError and SyntaxError", async () => {
    await expectError(async () => toKubernetesError(syntaxError, testKubeOp), {
      type: "crash",
    })
  })
})

describe("shouldRetry", () => {
  it("should retry WebsocketError", () => {
    expect(shouldRetry(websocketError, testKubeOp)).to.be.true
  })
})
