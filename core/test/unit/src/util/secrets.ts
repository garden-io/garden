/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { makeSecret, maybeSecret } from "../../../../src/util/secrets.js"
import { inspect } from "node:util"

describe("Secret values", () => {
  const secretBanana = makeSecret("banana")
  const secretApple = makeSecret("apple")
  const regularKiwi = "kiwi"
  const fruitBasket = maybeSecret`This fruit basket contains an ${secretApple}, a ${secretBanana} as well as a ${regularKiwi}.`

  const clearTextSecrets = ["banana", "apple", "This fruit basket contains an apple, a banana as well as a kiwi."]

  const protectionTestCases = [
    [secretBanana, "***", "banana"],
    [secretApple, "***", "apple"],
    [fruitBasket, "This fruit basket contains an ***, a *** as well as a kiwi.", "fruit basket"],
  ] as const

  for (const [secret, redacted, shortDescription] of protectionTestCases) {
    describe(`protects accidentally leaking secret values (${shortDescription})`, () => {
      it("converts a plain text secret to an object that protects it against accidental leaks", () => {
        expect(secret.toString()).to.eql(redacted)
        expect(secret + "").to.eql(redacted)
        expect(`${secret}`).to.eql(redacted)
        expect(`Hello ${secret}`).to.eql(`Hello ${redacted}`)
        expect(JSON.stringify(secret)).to.eql(`"${redacted}"`)
      })

      it("secrets are protected from property enumeration algorithms", () => {
        // enumerates all non-symbol properties, including inherited properties.
        let count = 0
        for (const p in secret as object) {
          for (const c of clearTextSecrets) {
            expect(inspect(secret[p]), `Property ${p} leaks the secret value`).not.to.include(c)
            count += 1
          }
        }
        expect(count).not.eql(0)
      })

      it("protects against printing the secret using util.inspect", () => {
        const res = inspect(secret, {
          showHidden: true,
          showProxy: true,
          getters: true,
          customInspect: false,
          depth: Infinity,
          colors: false,
        })
        let count = 0
        for (const c of clearTextSecrets) {
          expect(res).not.to.contain(c)
          count += 1
        }
        expect(count).not.to.eql(0)
      })
    })
  }
})
