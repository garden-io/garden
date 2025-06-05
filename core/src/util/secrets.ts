/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, zip } from "lodash-es"
import { inspect } from "node:util"

/////////// Public interface

export function isSecret(s: unknown): s is Secret {
  return s !== null && typeof s === "object" && s["isSecretString"] === true
}

/**
 * Create an instance of Secret
 * @example
 *
 * const secret = makeSecret("foo")
 * console.log(secret) // => ***
 * toClearText(secret) // => foo
 */
export function makeSecret(s: string): Secret {
  return new SecretValue(s)
}

export interface Secret {
  /**
   * Redacts secrets with three asterisks (***)
   */
  toString(): string

  /**
   * Gives access to the clear text.
   * Use {@link toClearText} if you are dealing with {@link MaybeSecret} values.
   */
  unwrapSecretValue(): string

  /**
   * Transform a secret value, returning a new instance of Secret
   */
  transformSecretValue(transformFn: (secretValue: string) => string): Secret
}

export type MaybeSecret = string | Secret

/**
 * To be used as tagged string, to concatenate secret and non-secret strings, protecting the secrets from leaking them accidentally.
 *
 * Returns a {@link Secret} if any of the template expressions evaluate to a secret; Otherwise returns string.
 *
 * @example
 *
 * const secretBanana = maybeSecret`FRUIT=${makeSecret("banana")}` // Secret
 * const regularBanana = maybeSecret`FRUIT=${"banana"}` // string
 *
 * console.log(secretBanana) // => MY_ENV_VAR=***
 * console.log(regularBanana) // => MY_ENV_VAR=banana
 *
 * console.log(toClearText(secretBanana)) // => MY_ENV_VAR=banana
 */
export function maybeSecret(
  nonSecrets: ReadonlyArray<string>,
  ...maybeSecrets: ReadonlyArray<MaybeSecret>
): MaybeSecret {
  const components = zip(nonSecrets, maybeSecrets)
    .flat()
    .filter((s): s is MaybeSecret => s !== undefined || s !== "")

  if (!maybeSecrets.some((s) => isSecret(s))) {
    // None of the expressions evaluated to secrets. Let's call toString on all the components.
    // if we were wrong for some reason, the only risk is that our secret value gets lost.
    return components.join("")
  }

  return new CompoundSecret(components)
}

export function joinSecrets(s: ReadonlyArray<MaybeSecret>, separator: string): MaybeSecret {
  const result = s.reduce<undefined | MaybeSecret>((previous, currentValue) => {
    if (previous !== undefined) {
      return maybeSecret`${previous}${separator}${currentValue}`
    } else {
      return currentValue
    }
  }, undefined) as MaybeSecret | undefined

  // join must return empty string in case of zero elements.
  return result || ""
}

type UnwrapSecret<T> =
  T extends Record<string, infer Value>
    ? Record<string, UnwrapSecret<Value>>
    : T extends Array<infer Value>
      ? UnwrapSecret<Value>
      : T extends MaybeSecret
        ? string
        : T

type OptionalMaybeSecret = MaybeSecret | undefined
type DeepOptionalMaybeSecret = OptionalMaybeSecret | OptionalMaybeSecret[] | { [key: string]: OptionalMaybeSecret }

export function toClearText<T extends DeepOptionalMaybeSecret>(s: T): UnwrapSecret<T> {
  if (isSecret(s)) {
    return s.unwrapSecretValue() as UnwrapSecret<T>
  }

  // lodash isPlainObject implementation causes a type error
  if (!!s && typeof s === "object" && s.constructor === Object) {
    return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, toClearText(v)])) as UnwrapSecret<T>
  }

  if (isArray(s)) {
    return s.map(toClearText) as UnwrapSecret<T>
  }

  // it's a string or another type that doesn't need to be unwrapped
  return s as UnwrapSecret<T>
}

export function transformSecret<T extends MaybeSecret>(s: T, transformFn: (s: string) => string): T {
  if (isSecret(s)) {
    return s.transformSecretValue(transformFn) as T
  }
  return transformFn(s) as T
}

/////////// Private implementation details

abstract class BaseSecret<SecretValueType> implements Secret {
  public readonly isSecretString = true as const

  // We are using a private class field.
  // This prevents most types of accidental leaks due to deep object serialisation.
  // See also https://github.com/tc39/proposal-class-fields/blob/main/PRIVATE_SYNTAX_FAQ.md#what-do-you-mean-by-encapsulation--hard-private
  readonly #secretValue: SecretValueType

  constructor(secretValue: SecretValueType) {
    this.#secretValue = secretValue
  }

  // This allows accessing the secret value by means of calling a function, which
  // serialization libraries usually don't do.
  protected getSecretValue(): SecretValueType {
    return this.#secretValue
  }

  // Make sure this is serialized as string.
  // toString is expected to redact the secret.
  public toJSON(): string {
    return this.toString()
  }

  // Make inspect useful and readable; This is what console.log will use to generate a string representation
  public [inspect.custom]() {
    return {
      secretValue: this.toString(),
    }
  }

  /**
   * Protect accidentally leaking the secret
   *
   * Replaces secrets with three asterisks (***)
   */
  public abstract toString(): string

  /**
   * Allow reading the clear text value
   */
  public abstract unwrapSecretValue(): string

  public transformSecretValue(transformFn: (secretValue: string) => string): Secret {
    const secretValue = this.unwrapSecretValue()
    return new SecretValue(transformFn(secretValue))
  }
}

class SecretValue extends BaseSecret<string> {
  constructor(secretValue: string) {
    super(secretValue)
  }

  public toString(): string {
    return "***"
  }

  public unwrapSecretValue(): string {
    return this.getSecretValue()
  }
}

class CompoundSecret extends BaseSecret<MaybeSecret[]> {
  constructor(components: MaybeSecret[]) {
    super(components)
  }

  override toString(): string {
    // calls toString on each of the components
    // toString implementation of secret components will turn into three asterisks (***) automatically.
    return this.getSecretValue().join("")
  }

  override unwrapSecretValue(): string {
    return this.getSecretValue().map(toClearText).join("")
  }
}
