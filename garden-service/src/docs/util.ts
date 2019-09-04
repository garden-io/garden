/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { padEnd, max } from "lodash"

export function indent(lines: string[], level: number) {
  const prefix = padEnd("", level * 2, " ")
  return lines.map((line) => prefix + line)
}

export function renderMarkdownTable(data: { [heading: string]: string }) {
  const lengths = Object.entries(data).map(([k, v]) => max([k.length, v.length]))
  const paddedKeys = Object.keys(data).map((k, i) => padEnd(k, lengths[i], " "))
  const paddedValues = Object.values(data).map((v, i) => padEnd(v, lengths[i], " "))

  const head = "| " + paddedKeys.join(" | ") + " |"
  const divider = "| " + paddedKeys.map((k) => padEnd("", k.length, "-")).join(" | ") + " |"
  const values = "| " + paddedValues.join(" | ") + " |"

  return [head, divider, values].join("\n")
}
