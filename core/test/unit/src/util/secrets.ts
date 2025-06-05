/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  isSecret,
  joinSecrets,
  makeSecret,
  maybeSecret,
  toClearText,
  transformSecret,
} from "../../../../src/util/secrets.js"
import { inspect } from "node:util"

describe("Secret values", () => {
  const secretBanana = makeSecret("banana")
  const secretApple = makeSecret("apple")
  const regularKiwi = "kiwi"
  const fruitBasket = maybeSecret`This fruit basket contains an ${secretApple}, a ${secretBanana} as well as a ${regularKiwi}.`

  describe("maybeSecret", () => {
    it("allows easy templating of secret values without losing the secret value", () => {
      const redacted = `${secretBanana} and ${secretApple}`
      expect(redacted).eql("*** and ***")
      expect(toClearText(redacted)).eql("*** and ***")

      const secret = maybeSecret`${secretBanana} and ${secretApple}`
      expect(secret.toString()).eql("*** and ***")
      expect(toClearText(secret)).eql("banana and apple")
    })
    it("allows mixing secrets and non-secrets", () => {
      const secret = maybeSecret`${secretApple} and ${regularKiwi}`
      expect(secret.toString()).eql("*** and kiwi")
      expect(toClearText(secret)).eql("apple and kiwi")
    })
  })

  describe("Secret protection", () => {
    const clearTextSecrets = [toClearText(secretBanana), toClearText(secretApple), toClearText(fruitBasket)]

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

  describe("joinSecrets", () => {
    const testCases = [
      [["a", "b"], " ", "a b", "a b"],
      [[makeSecret("secret1"), makeSecret("secret2")], " ", "*** ***", "secret1 secret2"],
      [["a", makeSecret("secret1")], " ", "a ***", "a secret1"],
      [[], "", "", ""],
      [["one"], "+", "one", "one"],
      [["one", ""], "+", "one+", "one+"],
      [[makeSecret("oneSecret")], "_", "***", "oneSecret"],
      [[makeSecret("oneSecret"), ""], "_", "***_", "oneSecret_"],
      [["", "", "", ""], "", "", ""],
      [["", "", "", ""], "!", "!!!", "!!!"],
    ] as const

    for (const [elements, separator, redacted, clearText] of testCases) {
      it(`it joins secrets correctly (${clearText || "empty"})`, () => {
        const result = joinSecrets(elements, separator)
        expect(result.toString()).to.eql(redacted)
        expect(toClearText(result)).to.eql(clearText)
      })
    }
  })

  describe("transformSecret", () => {
    it("allows transforming secrets", () => {
      const longBanana = transformSecret(secretBanana, (s) => s.replaceAll("a", "aaa"))
      expect(longBanana.toString()).to.eql("***")
      expect(toClearText(longBanana)).to.eql("baaanaaanaaa")
    })
    it("allows transforming non-secret values", () => {
      const longKiwi = transformSecret(regularKiwi, (s) => s.replaceAll("i", "iii"))
      expect(longKiwi.toString()).to.eql("kiiiwiii")
      expect(toClearText(longKiwi)).to.eql("kiiiwiii")
    })
    it("can handle compound secrets", () => {
      const fruitBasketWithLongBanana = transformSecret(fruitBasket, (s) => s.replaceAll("a", "aaa"))
      expect(fruitBasketWithLongBanana.toString()).to.eql("***")
      expect(toClearText(fruitBasketWithLongBanana)).to.eql(
        "This fruit baaasket contaaains aaan aaapple, aaa baaanaaanaaa aaas well aaas aaa kiwi."
      )
    })
  })

  describe("isSecret", () => {
    it("can identify secrets", () => {
      expect(isSecret(secretApple)).to.be.true
      expect(isSecret(secretBanana)).to.be.true
      expect(isSecret(fruitBasket)).to.be.true
    })
    it("returns false for other values", () => {
      expect(isSecret(regularKiwi)).to.be.false
      expect(
        isSecret({
          fakeSecretValue: "hello",
        })
      ).to.be.false
      expect(isSecret(undefined)).to.be.false
      expect(isSecret(null)).to.be.false
    })
  })
})
