/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import tmp from "tmp-promise"
import fsExtra from "fs-extra"
import { join } from "path"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { loadImportedVariables } from "../../../../src/config/import-variables.js"
import { importVariablesBaseSchema } from "../../../../src/config/project.js"
import { expectError } from "../../../helpers.js"

const { writeFile, ensureDir, chmod } = fsExtra

const log = getRootLogger().createLog()

describe("importVariablesBaseSchema", () => {
  describe("garden-cloud source", () => {
    it("should validate a valid garden-cloud source", () => {
      const config = [{ from: "garden-cloud", list: "varlist_123" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })

    it("should validate a garden-cloud source with description", () => {
      const config = [{ from: "garden-cloud", list: "varlist_123", description: "My variables" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })

    it("should reject garden-cloud source without list", () => {
      const config = [{ from: "garden-cloud" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.exist
    })
  })

  describe("file source", () => {
    it("should validate a valid file source with yaml format", () => {
      const config = [{ from: "file", path: "vars.yaml", format: "yaml" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })

    it("should validate a valid file source with json format", () => {
      const config = [{ from: "file", path: "vars.json", format: "json" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })

    it("should validate a valid file source with dotenv format", () => {
      const config = [{ from: "file", path: "vars.env", format: "dotenv" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })

    it("should validate a file source with description", () => {
      const config = [{ from: "file", path: "vars.yaml", format: "yaml", description: "My vars" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })

    it("should reject file source without path", () => {
      const config = [{ from: "file", format: "yaml" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.exist
    })

    it("should reject file source without format", () => {
      const config = [{ from: "file", path: "vars.yaml" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.exist
    })

    it("should reject file source with invalid format", () => {
      const config = [{ from: "file", path: "vars.xml", format: "xml" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.exist
    })
  })

  describe("exec source", () => {
    it("should validate a valid exec source", () => {
      const config = [{ from: "exec", command: ["./fetch-vars.sh"], format: "json" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })

    it("should validate an exec source with multiple command args", () => {
      const config = [{ from: "exec", command: ["node", "scripts/get-vars.js", "--env", "prod"], format: "yaml" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })

    it("should validate an exec source with description", () => {
      const config = [{ from: "exec", command: ["./fetch-vars.sh"], format: "json", description: "Fetch from vault" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })

    it("should reject exec source without command", () => {
      const config = [{ from: "exec", format: "json" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.exist
    })

    it("should reject exec source with empty command array", () => {
      const config = [{ from: "exec", command: [], format: "json" }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.exist
    })

    it("should reject exec source without format", () => {
      const config = [{ from: "exec", command: ["./fetch-vars.sh"] }]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.exist
    })
  })

  describe("multiple sources", () => {
    it("should validate multiple sources of different types", () => {
      const config = [
        { from: "file", path: "base-vars.yaml", format: "yaml" },
        { from: "garden-cloud", list: "varlist_123" },
        { from: "exec", command: ["./get-secrets.sh"], format: "json" },
      ]
      const result = importVariablesBaseSchema().validate(config)
      expect(result.error).to.be.undefined
      expect(result.value).to.eql(config)
    })
  })
})

describe("loadImportedVariables", () => {
  let tmpDir: tmp.DirectoryResult

  beforeEach(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  describe("empty config", () => {
    it("should return empty object when importVariables is undefined", async () => {
      const result = await loadImportedVariables({
        importVariables: undefined,
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })
      expect(result).to.eql({})
    })

    it("should return empty object when importVariables is empty array", async () => {
      const result = await loadImportedVariables({
        importVariables: [],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })
      expect(result).to.eql({})
    })
  })

  describe("file source", () => {
    it("should load variables from a YAML file", async () => {
      const varsPath = join(tmpDir.path, "vars.yaml")
      await writeFile(varsPath, "foo: bar\nbaz: qux\n")

      const result = await loadImportedVariables({
        importVariables: [{ from: "file", path: "vars.yaml", format: "yaml" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({ foo: "bar", baz: "qux" })
    })

    it("should load variables from a JSON file", async () => {
      const varsPath = join(tmpDir.path, "vars.json")
      await writeFile(varsPath, JSON.stringify({ api_key: "secret123", debug: true }))

      const result = await loadImportedVariables({
        importVariables: [{ from: "file", path: "vars.json", format: "json" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({ api_key: "secret123", debug: "true" })
    })

    it("should load variables from a dotenv file", async () => {
      const varsPath = join(tmpDir.path, "vars.env")
      await writeFile(varsPath, "DATABASE_URL=postgres://localhost/db\nAPI_KEY=abc123\n")

      const result = await loadImportedVariables({
        importVariables: [{ from: "file", path: "vars.env", format: "dotenv" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({ DATABASE_URL: "postgres://localhost/db", API_KEY: "abc123" })
    })

    it("should warn and return empty vars when file does not exist", async () => {
      const result = await loadImportedVariables({
        importVariables: [{ from: "file", path: "nonexistent.yaml", format: "yaml" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({})
    })

    it("should handle nested paths", async () => {
      const subDir = join(tmpDir.path, "config", "vars")
      await ensureDir(subDir)
      const varsPath = join(subDir, "secrets.yaml")
      await writeFile(varsPath, "secret: value\n")

      const result = await loadImportedVariables({
        importVariables: [{ from: "file", path: "config/vars/secrets.yaml", format: "yaml" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({ secret: "value" })
    })
  })

  describe("exec source", () => {
    it("should load variables from a command that writes to GARDEN_OUTPUT_PATH", async () => {
      // Create a script that writes to GARDEN_OUTPUT_PATH
      const scriptPath = join(tmpDir.path, "get-vars.sh")
      await writeFile(
        scriptPath,
        `#!/bin/bash
echo '{"from_script": "hello", "number": 42}' > "$GARDEN_OUTPUT_PATH"
`
      )
      await chmod(scriptPath, 0o755)

      const result = await loadImportedVariables({
        importVariables: [{ from: "exec", command: [scriptPath], format: "json" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({ from_script: "hello", number: "42" })
    })

    it("should warn and return empty vars when command does not write to output file", async () => {
      // Create a script that does NOT write to GARDEN_OUTPUT_PATH
      const scriptPath = join(tmpDir.path, "no-output.sh")
      await writeFile(
        scriptPath,
        `#!/bin/bash
echo "This script doesn't write to GARDEN_OUTPUT_PATH"
`
      )
      await chmod(scriptPath, 0o755)

      const result = await loadImportedVariables({
        importVariables: [{ from: "exec", command: [scriptPath], format: "json" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({})
    })

    it("should warn and return empty vars when command writes empty file", async () => {
      const scriptPath = join(tmpDir.path, "empty-output.sh")
      await writeFile(
        scriptPath,
        `#!/bin/bash
touch "$GARDEN_OUTPUT_PATH"
`
      )
      await chmod(scriptPath, 0o755)

      const result = await loadImportedVariables({
        importVariables: [{ from: "exec", command: [scriptPath], format: "json" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({})
    })

    it("should throw error when command fails", async () => {
      const scriptPath = join(tmpDir.path, "fail.sh")
      await writeFile(
        scriptPath,
        `#!/bin/bash
exit 1
`
      )
      await chmod(scriptPath, 0o755)

      await expectError(
        () =>
          loadImportedVariables({
            importVariables: [{ from: "exec", command: [scriptPath], format: "json" }],
            projectRoot: tmpDir.path,
            log,
            cloudApi: undefined,
            environmentName: "test",
            legacyProjectId: undefined,
          }),
        { contains: "failed with exit code 1" }
      )
    })

    it("should support yaml format from exec", async () => {
      const scriptPath = join(tmpDir.path, "yaml-output.sh")
      await writeFile(
        scriptPath,
        `#!/bin/bash
cat > "$GARDEN_OUTPUT_PATH" << EOF
key1: value1
key2: value2
EOF
`
      )
      await chmod(scriptPath, 0o755)

      const result = await loadImportedVariables({
        importVariables: [{ from: "exec", command: [scriptPath], format: "yaml" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({ key1: "value1", key2: "value2" })
    })

    it("should support dotenv format from exec", async () => {
      const scriptPath = join(tmpDir.path, "dotenv-output.sh")
      await writeFile(
        scriptPath,
        `#!/bin/bash
cat > "$GARDEN_OUTPUT_PATH" << EOF
VAR1=value1
VAR2=value2
EOF
`
      )
      await chmod(scriptPath, 0o755)

      const result = await loadImportedVariables({
        importVariables: [{ from: "exec", command: [scriptPath], format: "dotenv" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({ VAR1: "value1", VAR2: "value2" })
    })
  })

  describe("variable merging", () => {
    it("should merge variables from multiple sources in order", async () => {
      // First file
      const vars1Path = join(tmpDir.path, "vars1.yaml")
      await writeFile(vars1Path, "a: from-file1\nb: from-file1\n")

      // Second file that overrides 'b'
      const vars2Path = join(tmpDir.path, "vars2.yaml")
      await writeFile(vars2Path, "b: from-file2\nc: from-file2\n")

      const result = await loadImportedVariables({
        importVariables: [
          { from: "file", path: "vars1.yaml", format: "yaml" },
          { from: "file", path: "vars2.yaml", format: "yaml" },
        ],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({
        a: "from-file1",
        b: "from-file2", // Overridden by second source
        c: "from-file2",
      })
    })

    it("should merge variables from file and exec sources", async () => {
      // File source
      const varsPath = join(tmpDir.path, "vars.yaml")
      await writeFile(varsPath, "from_file: yes\nshared: from-file\n")

      // Exec source
      const scriptPath = join(tmpDir.path, "get-vars.sh")
      await writeFile(
        scriptPath,
        `#!/bin/bash
echo '{"from_exec": "yes", "shared": "from-exec"}' > "$GARDEN_OUTPUT_PATH"
`
      )
      await chmod(scriptPath, 0o755)

      const result = await loadImportedVariables({
        importVariables: [
          { from: "file", path: "vars.yaml", format: "yaml" },
          { from: "exec", command: [scriptPath], format: "json" },
        ],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined,
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({
        from_file: "yes",
        from_exec: "yes",
        shared: "from-exec", // Overridden by exec source (later in list)
      })
    })
  })

  describe("garden-cloud source", () => {
    it("should warn and skip when cloudApi is not available", async () => {
      const result = await loadImportedVariables({
        importVariables: [{ from: "garden-cloud", list: "varlist_123" }],
        projectRoot: tmpDir.path,
        log,
        cloudApi: undefined, // No cloud API
        environmentName: "test",
        legacyProjectId: undefined,
      })

      expect(result).to.eql({})
    })
  })
})
