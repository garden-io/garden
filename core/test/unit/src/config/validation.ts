/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { joi } from "../../../../src/config/common.js"
import { validateSchema } from "../../../../src/config/validation.js"
import { expectError } from "../../../helpers.js"
import type { BaseGardenResource, YamlDocumentWithSource } from "../../../../src/config/base.js"
import { baseInternalFieldsSchema, loadAndValidateYaml } from "../../../../src/config/base.js"
import { GardenApiVersion } from "../../../../src/constants.js"
import { parseDocument } from "yaml"
import { dedent } from "../../../../src/util/string.js"
import stripAnsi from "strip-ansi"

describe("validateSchema", () => {
  it("returns validated config with default values set", () => {
    const schema = joi.object().keys({
      apiVersion: joi.string(),
      kind: joi.string(),
      name: joi.string(),
      internal: baseInternalFieldsSchema(),
      foo: joi.string().default("bar"),
    })

    const config: BaseGardenResource = {
      apiVersion: GardenApiVersion.v2,
      kind: "Test",
      name: "foo",
      internal: {
        basePath: "/foo",
      },
    }

    const result = validateSchema(config, schema)

    expect(result).to.eql({
      ...config,
      foo: "bar",
    })
  })

  it("should format a basic object validation error", async () => {
    const schema = joi.object().keys({ foo: joi.string() })
    const value = { foo: 123 }
    await expectError(() => validateSchema(value, schema), {
      contains: ["Validation error", "foo must be a string"],
    })
  })

  it("should format a nested object validation error", async () => {
    const schema = joi.object().keys({ foo: joi.object().keys({ bar: joi.string() }) })
    const value = { foo: { bar: 123 } }
    await expectError(() => validateSchema(value, schema), {
      contains: ["Validation error", "foo.bar must be a string"],
    })
  })

  it("should format a nested pattern object validation error", async () => {
    const schema = joi.object().keys({ foo: joi.object().pattern(/.+/, joi.string()) })
    const value = { foo: { bar: 123 } }
    await expectError(() => validateSchema(value, schema), {
      contains: ["Validation error", "foo[bar] must be a string"],
    })
  })

  it("shows available keys when unexpected key is found", () => {
    const schema = joi.object().keys({
      foo: joi.string(),
    })

    const config = { bar: "bla" }

    void expectError(
      () => validateSchema(config, schema, {}),
      (err) => expect(err.message).to.include("Available keys: foo")
    )
  })

  it("doesn't show available keys if object field validation fails but key is expected", () => {
    const schema = joi.object().keys({
      foo: joi.string(),
    })

    const config = { foo: 123 }

    void expectError(
      () => validateSchema(config, schema, {}),
      (err) => expect(err.message).to.not.include("Available keys:")
    )
  })

  it("shows correct position of error if yamlDoc is attached to config, when error is on first line", () => {
    const schema = joi.object().keys({
      apiVersion: joi.string(),
      kind: joi.string(),
      name: joi.string(),
      internal: baseInternalFieldsSchema(),
      spec: joi.object().keys({
        foo: joi.string(),
      }),
    })

    const yaml = dedent`
      apiVersion: 123
      kind: Test
      name: foo
      spec:
        foo: bar
    `

    const yamlDoc = parseDocument(yaml) as YamlDocumentWithSource
    yamlDoc["source"] = yaml

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      ...yamlDoc.toJS(),
      internal: {
        basePath: "/foo",
        yamlDoc,
      },
    }

    void expectError(
      () => validateSchema(config, schema, { source: { yamlDoc, path: [] } }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(dedent`
        Validation error:

        1  | apiVersion: 123
        -----------------^
        apiVersion must be a string
      `)
    )
  })

  it("shows correct position of error if yamlDoc is attached to config", () => {
    const schema = joi.object().keys({
      apiVersion: joi.string(),
      kind: joi.string(),
      name: joi.string(),
      internal: baseInternalFieldsSchema(),
      spec: joi.object().keys({
        foo: joi.string(),
      }),
    })

    const yaml = dedent`
      apiVersion: v1
      kind: Test
      spec:
        foo: 123
      name: foo
    `

    const yamlDoc = parseDocument(yaml) as YamlDocumentWithSource
    yamlDoc["source"] = yaml

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      ...yamlDoc.toJS(),
      internal: {
        basePath: "/foo",
        yamlDoc,
      },
    }

    void expectError(
      () => validateSchema(config, schema, { source: { yamlDoc, path: [] } }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(dedent`
        Validation error:

        ...
        3  | spec:
        4  |   foo: 123
        ------------^
        spec.foo must be a string
      `)
    )
  })

  it("shows correct position of error in list item if yamlDoc is attached to config", () => {
    const schema = joi.object().keys({
      apiVersion: joi.string(),
      kind: joi.string(),
      name: joi.string(),
      internal: baseInternalFieldsSchema(),
      spec: joi.object().keys({
        foo: joi.array().items(joi.string()),
      }),
    })

    const yaml = dedent`
      apiVersion: v1
      kind: Test
      spec:
        foo:
          - fine
          - 123
      name: foo
    `

    const yamlDoc = parseDocument(yaml) as YamlDocumentWithSource
    yamlDoc["source"] = yaml

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      ...yamlDoc.toJS(),
      internal: {
        basePath: "/foo",
        yamlDoc,
      },
    }

    void expectError(
      () => validateSchema(config, schema, { source: { yamlDoc, path: [] } }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(dedent`
        Validation error:

        ...
        5  |     - fine
        6  |     - 123
        -----------^
        spec.foo[1] must be a string
      `)
    )
  })

  it("shows correct positions of multiple errors if yamlDoc is attached", () => {
    const schema = joi.object().keys({
      apiVersion: joi.string(),
      kind: joi.string(),
      name: joi.string(),
      internal: baseInternalFieldsSchema(),
      spec: joi.object().keys({
        foo: joi.string(),
      }),
    })

    const yaml = dedent`
      apiVersion: 123
      kind: Test
      spec:
        foo: 123
      name: foo
    `

    const yamlDoc = parseDocument(yaml) as YamlDocumentWithSource
    yamlDoc["source"] = yaml

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      ...yamlDoc.toJS(),
      internal: {
        basePath: "/foo",
        yamlDoc,
      },
    }

    void expectError(
      () => validateSchema(config, schema, { source: { yamlDoc, path: [] } }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(dedent`
        Validation error:

        1  | apiVersion: 123
        -----------------^
        apiVersion must be a string
        ...
        3  | spec:
        4  |   foo: 123
        ------------^
        spec.foo must be a string
      `)
    )
  })

  it("shows correct position of error if yamlDoc with multiple configs is attached to config", async () => {
    const schema = joi.object().keys({
      apiVersion: joi.string(),
      kind: joi.string(),
      name: joi.string(),
      internal: baseInternalFieldsSchema(),
      spec: joi.object().keys({
        foo: joi.string(),
      }),
    })

    const yaml = dedent`
      apiVersion: v1
      kind: Test
      spec:
        foo: 123
      name: foo
      ---
      apiVersion: v1
      kind: Test
      spec:
        foo: 456
      name: bar
    `

    const yamlDocs = await loadAndValidateYaml({
      content: yaml,
      sourceDescription: "foo.yaml in directory bar",
      filename: "bar/foo.yaml",
    })
    const yamlDoc = yamlDocs[1]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      ...yamlDoc.toJS(),
      internal: {
        basePath: "/foo",
        yamlDoc,
      },
    }

    void expectError(
      () => validateSchema(config, schema, { source: { yamlDoc, path: [] } }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(dedent`
        Validation error:

        bar/foo.yaml:10
        ...
        9   | spec:
        10  |   foo: 456
        -------------^
        spec.foo must be a string
      `)
    )
  })

  it("shows correct position of error if yamlDoc is attached to config and yamlDocBasePath is set", () => {
    const schema = joi.object().keys({
      foo: joi.string(),
    })

    const yaml = dedent`
      apiVersion: v1
      kind: Test
      spec:
        foo: 123
      name: foo
    `

    const yamlDoc = parseDocument(yaml) as YamlDocumentWithSource
    yamlDoc.source = yaml
    yamlDoc.filename = "foo/bar.yaml"

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      ...yamlDoc.toJS(),
      internal: {
        basePath: "/foo",
        yamlDoc,
      },
    }

    void expectError(
      () => validateSchema(config.spec, schema, { source: { yamlDoc, path: ["spec"] } }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(dedent`
        Validation error:

        foo/bar.yaml:4
        ...
        3  | spec:
        4  |   foo: 123
        ------------^
        spec.foo must be a string
      `)
    )
  })
})
