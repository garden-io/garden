/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// String with SHA256 hash
export function isSha256(str: string): boolean {
  const sha256Regex = /^[a-f0-9]{64}$/gi
  return sha256Regex.test(str)
}

export function isSha1(str: string): boolean {
  const sha1Regex = new RegExp(/\b([a-f0-9]{40})\b/)
  return sha1Regex.test(str)
}
