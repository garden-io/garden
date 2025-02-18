/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { genJsonSchema } from "@garden-io/core/build/src/docs/gen-json-schema.js"
import { defaultEnvironment, defaultNamespace } from "@garden-io/core/build/src/config/project.js"
import { defaultDotIgnoreFile } from "@garden-io/core/build/src/util/fs.js"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { Garden } from "@garden-io/core/build/src/index.js"
import { GardenApiVersion } from "@garden-io/core/build/src/constants.js"
import { getSupportedPlugins } from "@garden-io/core/build/src/plugins/plugins.js"
import { skipDocsForPlugins } from "@garden-io/core/build/src/docs/generate.js"
import addFormatsPackage from "ajv-formats"
import { join } from "node:path"
import * as yaml from "js-yaml"
import fsExtra from "fs-extra"

const { readFile, readdir } = fsExtra

import ajvPackage from "ajv"
import { getBundledPlugins } from "../../../src/cli.js"
import { omit } from "lodash-es"

const Ajv = ajvPackage.default
const addFormats = addFormatsPackage.default

const currentFilePath = fileURLToPath(import.meta.url)
const moduleDirName = dirname(currentFilePath)
const examplesDir = join(currentFilePath, "..", "..", "..", "..", "..", "..", "examples")

const getPlugins = () => [...getBundledPlugins(), ...getSupportedPlugins()]

/**
 * Find all garden.yml or garden.yaml files recursively
 */
async function findGardenFiles(directoryPath: string): Promise<string[]> {
  const result: string[] = []

  // Helper function for recursive search
  async function scanDirectory(currentPath: string) {
    const entries = await readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      // Skip directories that start with a dot
      if (entry.name.startsWith(".")) {
        continue
      }

      const fullPath = join(currentPath, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan subdirectory
        await scanDirectory(fullPath)
      } else if (entry.isFile()) {
        // Check if the file matches garden.yml pattern
        const filename = entry.name.toLowerCase()
        if (
          filename.endsWith(".garden.yml") ||
          filename.endsWith(".garden.yaml") ||
          filename === "garden.yml" ||
          filename === "garden.yaml"
        ) {
          result.push(fullPath)
        }
      }
    }
  }

  await scanDirectory(directoryPath)
  return result
}

describe("genJsonSchema", () => {
  let garden: Garden
  const ajv = new Ajv({ strict: false })
  addFormats(ajv)

  before(async () => {
    const providers = [
      { name: "conftest" },
      { name: "conftest-container" },
      { name: "conftest-kubernetes" },
      { name: "container" },
      { name: "exec" },
      { name: "hadolint" },
      { name: "jib" },
      { name: "kubernetes" },
      { name: "local-kubernetes" },
      { name: "octant" },
      { name: "terraform" },
      { name: "pulumi" },
    ]

    garden = await Garden.factory(moduleDirName, {
      commandInfo: { name: "generate-docs", args: {}, opts: {} },
      config: {
        path: moduleDirName,
        apiVersion: GardenApiVersion.v1,
        kind: "Project",
        name: "generate-docs",
        internal: {
          basePath: moduleDirName,
        },
        defaultEnvironment,
        dotIgnoreFile: defaultDotIgnoreFile,
        variables: {},
        environments: [
          {
            name: "default",
            defaultNamespace,
            variables: {},
          },
        ],
        providers,
      },
      plugins: getPlugins(),
    })
  })

  it("should return a valid JSON schema", async () => {
    const actionTypeDefinitions = await garden.getActionTypes()
    const pluginsToRender = (await garden.getAllPlugins()).filter((p) => !skipDocsForPlugins.includes(p.name))

    const jsonSchema = genJsonSchema(actionTypeDefinitions, pluginsToRender)

    expect(jsonSchema["$schema"]).to.eql("https://json-schema.org/draft/2020-12/schema")

    // Remove the $schema key because Ajv doesn't have access to this schema by default
    const res = ajv.compile(omit(jsonSchema, "$schema"))

    expect(res.errors).to.eql(null)
  })

  context("examples dir", () => {
    it("should generate a schema that's valid for examples in examples dir", async () => {
      const gardenConfigFiles = await findGardenFiles(examplesDir)
      const actionTypeDefinitions = await garden.getActionTypes()
      const pluginsToRender = (await garden.getAllPlugins()).filter((p) => !skipDocsForPlugins.includes(p.name))

      const jsonSchema = omit(genJsonSchema(actionTypeDefinitions, pluginsToRender), "$schema")

      const validate = ajv.compile(jsonSchema)

      // Validate each Garden config file in 'examples' dir
      gardenConfigFiles.forEach(async (filePath) => {
        const allDocuments: unknown[] = []

        try {
          const content = await readFile(filePath, "utf8")
          // Parse YAML documents (multi-document support with loadAll)
          const docs = yaml.loadAll(content)
          allDocuments.push(...docs)
        } catch (error) {
          console.error(`Error parsing file ${filePath}:`, error)
          throw error
        }

        // Validate every YAML doc in file
        const allValidations = allDocuments.map((d) => validate(d))
        const valid = allValidations.every((el) => el === true)

        expect(valid, `Failed for file ${filePath}`).to.eql(true)
      })
    })
  })
})
