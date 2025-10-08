/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { DEFAULT_BUILD_TIMEOUT_SEC, GardenApiVersion } from "../../../../src/constants.js"
import type { TestGarden } from "../../../helpers.js"
import { expectError, getDataDir, makeTestGarden } from "../../../helpers.js"
import type { ConfigTemplateResource, ConfigTemplateConfig } from "../../../../src/config/config-template.js"
import { resolveConfigTemplate } from "../../../../src/config/config-template.js"
import { resolve } from "path"
import { joi } from "../../../../src/config/common.js"
import fsExtra from "fs-extra"
const { pathExists, remove } = fsExtra
import cloneDeep from "fast-copy"
import { configTemplateKind, renderTemplateKind } from "../../../../src/config/base.js"
import type { RenderTemplateConfig } from "../../../../src/config/render-template.js"
import { renderConfigTemplate } from "../../../../src/config/render-template.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import { parseTemplateCollection } from "../../../../src/template/templated-collections.js"
import { serialiseUnresolvedTemplates, UnresolvedTemplateValue } from "../../../../src/template/types.js"
import { deepEvaluate } from "../../../../src/template/evaluate.js"
import { VariablesContext } from "../../../../src/config/template-contexts/variables.js"
import { parseTemplateString } from "../../../../src/template/templated-strings.js"

describe("config templates", () => {
  let garden: TestGarden
  let log: Log

  before(async () => {
    garden = await makeTestGarden(getDataDir("test-projects", "module-templates"))
    log = garden.log
  })

  describe("resolveConfigTemplate", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let defaults: any

    before(() => {
      defaults = {
        apiVersion: GardenApiVersion.v0,
        kind: configTemplateKind,
        name: "test",

        internal: {
          basePath: garden.projectRoot,
          configFilePath: resolve(garden.projectRoot, "templates.garden.yml"),
        },
      }
    })

    it("resolves template strings for fields other than modules and files", async () => {
      const config: ConfigTemplateResource = parseTemplateCollection({
        value: {
          ...defaults,
          inputsSchemaPath: "${project.name}.json",
        },
        source: { path: [] },
      })
      const resolved = await resolveConfigTemplate(garden, config)
      expect(resolved.inputsSchemaPath).to.eql("module-templates.json")
      expect(resolved.inputsSchemaDefaults).to.eql({
        test: "hello",
      })
    })

    it("ignores template strings in modules", async () => {
      const config: ConfigTemplateResource = {
        ...defaults,
        modules: [
          {
            type: "test",
            name: "${inputs.foo}",
          },
        ],
      }
      const resolved = await resolveConfigTemplate(garden, config)
      expect(resolved.modules).to.eql(config.modules)
    })

    it("throws on an invalid schema", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config: any = {
        ...defaults,
        foo: "bar",
      }
      await expectError(() => resolveConfigTemplate(garden, config), {
        contains: [
          "Error validating ConfigTemplate 'test' (templates.garden.yml)",
          '"foo" is not allowed at path [foo]',
        ],
      })
    })

    it("defaults to an object with any properties for schema", async () => {
      const config: ConfigTemplateResource = {
        ...defaults,
      }
      const resolved = await resolveConfigTemplate(garden, config)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>resolved.inputsSchema)._rules[0].args.jsonSchema.schema).to.eql({
        type: "object",
        additionalProperties: true,
        required: [],
      })
    })

    it("parses a valid JSON inputs schema", async () => {
      const config: ConfigTemplateResource = {
        ...defaults,
        inputsSchemaPath: "module-templates.json",
      }
      const resolved = await resolveConfigTemplate(garden, config)
      expect(resolved.inputsSchema).to.exist
    })

    it("throws if inputs schema cannot be found", async () => {
      const config: ConfigTemplateResource = {
        ...defaults,
        inputsSchemaPath: "foo.json",
      }
      const path = resolve(config.internal.basePath, config.inputsSchemaPath!)
      await expectError(() => resolveConfigTemplate(garden, config), {
        contains: `Unable to read inputs schema at '${config.inputsSchemaPath}' for ConfigTemplate test: Error: ENOENT: no such file or directory, open '${path}'`,
      })
    })

    it("throws if an invalid JSON schema is provided", async () => {
      const config: ConfigTemplateResource = {
        ...defaults,
        inputsSchemaPath: "invalid.json",
      }
      await expectError(() => resolveConfigTemplate(garden, config), {
        contains: `Inputs schema at 'invalid.json' for ConfigTemplate test has type string, but should be "object".`,
      })
    })

    it("handles the inputs field", async () => {
      const config: ConfigTemplateResource = {
        ...defaults,
        inputs: {
          foo: { type: "string", default: "bar" },
          baz: { type: "number", default: 123 },
          qux: { type: "boolean", default: true },
        },
      }
      const resolved = await resolveConfigTemplate(garden, config)
      expect(resolved.inputsSchema).to.exist
      expect((<any>resolved.inputsSchema)._rules[0].args.jsonSchema.schema).to.eql({
        type: "object",
        additionalProperties: false,
        properties: {
          foo: { type: "string", default: "bar" },
          baz: { type: "number", default: 123 },
          qux: { type: "boolean", default: true },
        },
        required: [],
      })
    })

    it("makes the inputs fields required if no default value is provided", async () => {
      const config: ConfigTemplateResource = {
        ...defaults,
        inputs: {
          foo: { type: "string" },
        },
      }
      const resolved = await resolveConfigTemplate(garden, config)
      expect(resolved.inputsSchema).to.exist
      expect((<any>resolved.inputsSchema)._rules[0].args.jsonSchema.schema).to.eql({
        type: "object",
        additionalProperties: false,
        properties: {
          foo: { type: "string" },
        },
        required: ["foo"],
      })
    })

    it("throws if inputs field has a default value of the wrong type", async () => {
      const config: ConfigTemplateResource = {
        ...defaults,
        inputs: {
          foo: { type: "string", default: 123 },
        },
      }
      await expectError(() => resolveConfigTemplate(garden, config), {
        contains: `Input foo for ConfigTemplate test has default value 123 of type number, but should be of type string.`,
      })
    })
  })

  describe("renderConfigTemplate", () => {
    let template: ConfigTemplateConfig
    let defaults: RenderTemplateConfig

    const templates: { [name: string]: ConfigTemplateConfig } = {}

    before(() => {
      template = {
        apiVersion: GardenApiVersion.v0,
        kind: configTemplateKind,
        name: "test",
        internal: {
          basePath: garden.projectRoot,
          configFilePath: resolve(garden.projectRoot, "modules.garden.yml"),
        },
        inputsSchema: joi.object().keys({
          foo: joi.string(),
        }),
        inputsSchemaDefaults: {},
        modules: [],
      }
      templates.test = template

      defaults = {
        apiVersion: GardenApiVersion.v0,
        kind: renderTemplateKind,
        name: "test",
        internal: {
          basePath: garden.projectRoot,
          configFilePath: resolve(garden.projectRoot, "modules.garden.yml"),
        },
        template: "test",
        disabled: false,
      }
    })

    it("resolves template strings on the templated module config", async () => {
      const config: RenderTemplateConfig = {
        ...defaults,
        ...parseTemplateCollection({
          value: {
            inputs: {
              foo: "${project.name}",
            },
          },
          source: { path: [] },
        }),
      }
      const { resolved } = await renderConfigTemplate({ garden, log, config, templates })
      expect(resolved.inputs?.foo).to.be.instanceOf(UnresolvedTemplateValue)
      const evaluated = deepEvaluate(resolved.inputs, { context: garden.getProjectConfigContext(), opts: {} })
      expect(evaluated).to.be.eql({
        foo: "module-templates",
      })
    })

    it("resolves core fields like name, but leaves others unresolved, like dependencies and image", async () => {
      const _templates = {
        test: {
          ...template,
          ...parseTemplateCollection({
            value: {
              modules: [
                {
                  type: "test",
                  name: "${parent.name}-${template.name}-${inputs.foo}",
                  build: {
                    dependencies: [{ name: "${parent.name}-${template.name}-foo", copy: [] }],
                    timeout: DEFAULT_BUILD_TIMEOUT_SEC,
                  },
                  image: "${modules.foo.outputs.bar || inputs.foo}",
                },
              ],
            },
            source: { path: [] },
          }),
        },
      }
      const config: RenderTemplateConfig = {
        ...defaults,
        inputs: {
          foo: "bar",
        },
      }

      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })
      const module = resolved.modules[0]

      expect(module.name).to.equal("test-test-bar")
      expect(serialiseUnresolvedTemplates(module.build.dependencies)).to.eql([
        { name: "${parent.name}-${template.name}-foo", copy: [] },
      ])
      expect(serialiseUnresolvedTemplates(module.spec.image)).to.equal("${modules.foo.outputs.bar || inputs.foo}")
    })

    it("throws if config is invalid", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config: any = {
        ...defaults,
        foo: "bar",
      }
      await expectError(() => renderConfigTemplate({ garden, log, config, templates }), {
        contains: ["Error validating Render test (modules.garden.yml)", '"foo" is not allowed'],
      })
    })

    it("throws if template cannot be found", async () => {
      const config: RenderTemplateConfig = {
        ...defaults,
        template: "foo",
      }
      await expectError(() => renderConfigTemplate({ garden, log, config, templates }), {
        contains: "RenderTemplate test references template foo which cannot be found. Available templates: test",
      })
    })

    it("fully resolves the source path on module files", async () => {
      const _templates = {
        test: {
          ...template,
          modules: [
            {
              type: "test",
              name: "foo",
              generateFiles: [{ sourcePath: "foo/bar.txt", targetPath: "foo.txt", resolveTemplates: true }],
            },
          ],
        },
      }
      const config: RenderTemplateConfig = {
        ...defaults,
        inputs: {
          foo: "bar",
        },
      }

      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })

      const absPath = resolve(config.internal.basePath, "foo", "bar.txt")
      expect(resolved.modules[0].generateFiles![0].sourcePath).to.equal(absPath)
    })

    it("creates the module path directory, if necessary", async () => {
      const absPath = resolve(garden.projectRoot, ".garden", "foo")
      await remove(absPath)

      const _templates = {
        test: {
          ...template,
          modules: [
            {
              type: "test",
              name: "foo",
              path: `.garden/foo`,
            },
          ],
        },
      }
      const config: RenderTemplateConfig = {
        ...defaults,
        inputs: {
          foo: "bar",
        },
      }

      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })
      const module = resolved.modules[0]

      expect(module.path).to.equal(absPath)
      expect(await pathExists(module.path)).to.be.true
    })

    it("attaches parent module and template metadata to the output modules", async () => {
      const _templates = {
        test: {
          ...template,
          modules: [
            {
              type: "test",
              name: "foo",
            },
          ],
        },
      }
      const config: RenderTemplateConfig = {
        ...defaults,
        inputs: {
          foo: "bar",
        },
      }

      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })

      expect(resolved.modules[0].parentName).to.equal(config.name)
      expect(resolved.modules[0].templateName).to.equal(template.name)
      expect(resolved.modules[0].inputs).to.eql(config.inputs)
    })

    it("resolves template strings in template module names", async () => {
      const _templates = {
        test: {
          ...template,
          ...parseTemplateCollection({
            value: {
              modules: [
                {
                  type: "test",
                  name: "${inputs.foo}",
                },
              ],
            },
            source: { path: [] },
          }),
        },
      }
      const config: RenderTemplateConfig = {
        ...defaults,
        inputs: {
          foo: "bar",
        },
      }

      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })

      expect(resolved.modules[0].name).to.equal("bar")
    })

    it("returns no modules if templated module is disabled", async () => {
      const _templates = {
        test: {
          ...template,
          modules: [
            {
              type: "test",
              name: "foo",
            },
          ],
        },
      }
      const config: RenderTemplateConfig = {
        ...defaults,
        disabled: true,
      }

      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })

      expect(resolved.modules.length).to.equal(0)
    })

    it("throws if an invalid module spec is in the template", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const _templates: any = {
        test: {
          ...template,
          modules: [
            {
              type: 123,
              name: "foo",
            },
          ],
        },
      }
      const config: RenderTemplateConfig = {
        ...defaults,
      }
      await expectError(() => renderConfigTemplate({ garden, log, config, templates: _templates }), {
        contains: [
          "ConfigTemplate test returned an invalid module (named foo) for templated module test",
          "Error validating module (modules.garden.yml)",
          "type must be a string",
        ],
      })
    })

    it("throws if a module spec has an invalid name", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const _templates: any = {
        test: {
          ...template,
          modules: [
            {
              type: "test",
              name: 123,
            },
          ],
        },
      }
      const config: RenderTemplateConfig = {
        ...defaults,
      }
      await expectError(() => renderConfigTemplate({ garden, log, config, templates: _templates }), {
        contains: [
          "ConfigTemplate test returned an invalid module (named 123) for templated module test",
          "Error validating module (modules.garden.yml)",
          "name must be a string",
        ],
      })
    })

    it("resolves project variable references in input fields", async () => {
      const _templates = {
        test: {
          ...template,
          ...parseTemplateCollection({
            value: {
              modules: [
                {
                  type: "test",
                  name: "${inputs.name}-test",
                },
              ],
            },
            source: { path: [] },
          }),
        },
      }

      const config: RenderTemplateConfig = cloneDeep(defaults)
      config.inputs = parseTemplateCollection({ value: { name: "${var.test}" }, source: { path: [] } })
      garden.variables = VariablesContext.forTest({
        garden,
        variablePrecedence: [
          {
            test: "test-value",
          },
        ],
      })

      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })

      expect(resolved.modules[0].name).to.equal("test-value-test")
    })

    it("passes through unresolvable template strings in inputs field", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const _templates: any = {
        test: {
          ...template,
          modules: [
            {
              type: "test",
              name: "test",
            },
          ],
        },
      }

      const templateString = "version-${modules.foo.version}"

      const config: RenderTemplateConfig = cloneDeep(defaults)
      config.inputs = { version: templateString }

      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })

      expect(resolved.modules[0].inputs?.version).to.equal(templateString)
    })

    it("throws if an unresolvable template string is used for a templated module name", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const _templates: any = {
        test: {
          ...template,
          ...parseTemplateCollection({
            value: {
              modules: [
                {
                  type: "test",
                  name: "${inputs.name}-module",
                },
              ],
            },
            source: { path: [] },
          }),
        },
      }

      const config: RenderTemplateConfig = cloneDeep(defaults)
      config.inputs = parseTemplateCollection({
        value: { name: "module-${modules.foo.version}" },
        source: { path: [] },
      })

      await expectError(() => renderConfigTemplate({ garden, log, config, templates: _templates }), {
        contains: [
          "ConfigTemplate test returned an invalid module (named ${inputs.name}-module) for templated module test",
          "failed to evaluate template expression at inputs.name",
          "invalid template string (module-${modules.foo.version}) at path name",
          "could not find key modules. available keys:",
          "Note that if a template string is used for the name, kind, type or apiversion of a module in a template, then the template string must be fully resolvable at the time of module scanning. This means that e.g. references to other modules or runtime outputs cannot be used.",
        ],
      })
    })

    it("throws if a module name is duplicated after rendering", async () => {
      const _templates = {
        test: {
          ...template,
          modules: [
            {
              type: "test",
              name: "foo",
            },
            {
              type: "test",
              name: "foo",
            },
          ],
        },
      }
      const config: RenderTemplateConfig = cloneDeep(defaults)
      config.inputs = { foo: "bar" }
      await expectError(() => renderConfigTemplate({ garden, log, config, templates: _templates }), {
        contains: "Found duplicate config names after rendering RenderTemplate test: Module.foo",
      })
    })

    it("throws if an action name is duplicated with the same kind after rendering", async () => {
      const _templates: any = {
        test: {
          ...template,
          configs: [
            {
              kind: "Test" as const,
              name: "foo",
              type: "test",
              timeout: DEFAULT_BUILD_TIMEOUT_SEC,
              spec: {},
            },
            {
              kind: "Test" as const,
              name: "foo",
              type: "test",
              timeout: DEFAULT_BUILD_TIMEOUT_SEC,
              spec: {},
            },
          ],
        },
      }
      const config: RenderTemplateConfig = cloneDeep(defaults)
      config.inputs = { foo: "bar" }
      await expectError(() => renderConfigTemplate({ garden, log, config, templates: _templates }), {
        contains: "Found duplicate config names after rendering RenderTemplate test: Test.foo",
      })
    })

    it("renders all combinations when the matrix field is provided", async () => {
      const _templates: any = {
        test: {
          ...template,
          configs: [
            {
              kind: "Test" as const,
              name: parseTemplateString({
                rawTemplateString: "foo-${inputs.a}-${inputs.b}-${inputs.c}",
                source: { path: [] },
              }),
              type: "test",
              timeout: DEFAULT_BUILD_TIMEOUT_SEC,
              spec: {},
            },
          ],
        },
      }
      const config: RenderTemplateConfig = cloneDeep(defaults)
      config.matrix = {
        a: ["a1", "a2", "a3"],
        b: ["b1", "b2"],
        c: ["c1", "c2", "c3"],
      }
      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })
      expect(resolved.configs.length).to.equal(2 * 3 * 3)
      expect(resolved.configs.map((c) => c.name)).to.eql([
        "foo-a1-b1-c1",
        "foo-a1-b1-c2",
        "foo-a1-b1-c3",
        "foo-a1-b2-c1",
        "foo-a1-b2-c2",
        "foo-a1-b2-c3",
        "foo-a2-b1-c1",
        "foo-a2-b1-c2",
        "foo-a2-b1-c3",
        "foo-a2-b2-c1",
        "foo-a2-b2-c2",
        "foo-a2-b2-c3",
        "foo-a3-b1-c1",
        "foo-a3-b1-c2",
        "foo-a3-b1-c3",
        "foo-a3-b2-c1",
        "foo-a3-b2-c2",
        "foo-a3-b2-c3",
      ])
    })

    it("combines the inputs field with the matrix field", async () => {
      const _templates: any = {
        test: {
          ...template,
          configs: [
            {
              kind: "Test" as const,
              name: parseTemplateString({
                rawTemplateString: "foo-${inputs.a}-${inputs.b}-${inputs.c}",
                source: { path: [] },
              }),
              type: "test",
              timeout: DEFAULT_BUILD_TIMEOUT_SEC,
              spec: {},
            },
          ],
        },
      }
      const config: RenderTemplateConfig = cloneDeep(defaults)
      config.inputs = {
        a: "a1",
        b: "overridden",
        c: "overridden",
      }
      config.matrix = {
        b: ["b1", "b2"],
        c: ["c1", "c2", "c3"],
      }
      const resolved = await renderConfigTemplate({ garden, log, config, templates: _templates })
      expect(resolved.configs.length).to.equal(2 * 3)
      expect(resolved.configs.map((c) => c.name)).to.eql([
        "foo-a1-b1-c1",
        "foo-a1-b1-c2",
        "foo-a1-b1-c3",
        "foo-a1-b2-c1",
        "foo-a1-b2-c2",
        "foo-a1-b2-c3",
      ])
    })
  })
})
