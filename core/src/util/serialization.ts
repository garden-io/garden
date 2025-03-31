/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash-es"
import fsExtra from "fs-extra"
import type { DumpOptions } from "js-yaml"
import { dump, load } from "js-yaml"
import { UnresolvedTemplateValue } from "../template/types.js"

const { readFile, writeFile } = fsExtra

export async function dumpYaml(yamlPath: string, data: any) {
  return writeFile(yamlPath, safeDumpYaml(data, { noRefs: true }))
}

/**
 * Wraps safeDump and enforces that invalid values are skipped
 */
export function safeDumpYaml(data: any, opts: Omit<DumpOptions, "replacer"> = {}) {
  return dump(data, {
    ...opts,
    skipInvalid: true,
    replacer: (_, v) => {
      if (v instanceof UnresolvedTemplateValue) {
        // serialize unresolved template values to JSON
        return v.toJSON()
      }

      // return the original value otherwise
      return v
    },
  })
}

/**
 * Encode multiple objects as one multi-doc YAML file
 */
export function encodeYamlMulti(objects: object[]) {
  return objects.map((s) => safeDumpYaml(s, { noRefs: true }) + "---\n").join("")
}

/**
 * Encode and write multiple objects as a multi-doc YAML file
 */
export async function dumpYamlMulti(yamlPath: string, objects: object[]) {
  return writeFile(yamlPath, encodeYamlMulti(objects))
}

export async function loadYamlFile(path: string): Promise<any> {
  const fileData = await readFile(path)
  return load(fileData.toString())
}

export function serializeObject(o: any): string {
  return Buffer.from(JSON.stringify(o === undefined ? null : o)).toString("base64")
}

export function deserializeObject(s: string) {
  const parsed = JSON.parse(Buffer.from(s, "base64").toString())
  return parsed === null ? undefined : parsed
}

export function serializeValues(o: { [key: string]: any }): { [key: string]: string } {
  return mapValues(o, serializeObject)
}

export function deserializeValues(o: object) {
  return mapValues(o, deserializeObject)
}
