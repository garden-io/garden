/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import tmp from "tmp-promise"
import { dedent } from "../../../../src/util/string"
import cpy = require("cpy")
import { sortBy } from "lodash"
import { expectError, withDefaultGlobalOpts, dataDir, makeTestGardenA } from "../../../helpers"
import { MigrateCommand, MigrateCommandResult, dumpSpec } from "../../../../src/commands/migrate"
import { LogEntry } from "../../../../src/logger/log-entry"
import { Garden } from "../../../../src/garden"
import execa from "execa"

describe("commands", () => {
  describe("migrate", () => {
    let tmpDir: tmp.DirectoryResult
    const projectPath = join(dataDir, "test-projects", "v10-configs")
    const projectPathErrors = join(dataDir, "test-projects", "v10-configs-errors")
    const command = new MigrateCommand()
    let garden: Garden
    let log: LogEntry

    before(async () => {
      garden = await makeTestGardenA()
      log = garden.log
      tmpDir = await tmp.dir({ unsafeCleanup: true })
    })

    after(async () => {
      await tmpDir.cleanup()
    })

    context("convert config", () => {
      let result: MigrateCommandResult

      before(async () => {
        // The Garden class is not used by the command so we just use any test Garden

        const res = await command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { configPaths: [] },
          opts: withDefaultGlobalOpts({
            root: projectPath,
            write: false,
          }),
        })
        result = res.result!
      })
      it("should scan for garden.yml files and convert them to v11 config", () => {
        expect(result.updatedConfigs.map((c) => c.path).sort()).to.eql([
          join(projectPath, "garden.yml"),
          join(projectPath, "module-a", "garden.yml"),
          join(projectPath, "module-b", "garden.yml"),
          join(projectPath, "nested", "module-c", "garden.yml"),
        ])
      })
      it("should ignore configs that are already valid", () => {
        expect(result.updatedConfigs.map((c) => c.path)).to.not.contain([
          join(projectPath, "module-noop", "garden.yml"),
        ])
      })
      it("should not modify specs that are already valid", () => {
        const noop = result.updatedConfigs[0].specs[0]
        expect(noop).to.eql({
          kind: "Project",
          name: "test-project-v10-config-noop",
          environments: [
            {
              name: "local",
            },
            {
              name: "other",
            },
          ],
          providers: [
            {
              name: "test-plugin",
              environments: ["local"],
            },
            {
              name: "test-plugin-b",
              environments: ["other"],
            },
          ],
        })
      })
      it("should convert nested configs to the flat style", () => {
        const nested = result.updatedConfigs[0].specs[1]
        expect(nested).to.eql({
          kind: "Project",
          name: "test-project-v10-config-nested",
          environments: [
            {
              name: "local",
              providers: [
                {
                  name: "test-plugin",
                },
                {
                  name: "test-plugin-b",
                },
              ],
            },
            {
              name: "other",
            },
          ],
        })
      })
      it("should convert nested project configs to the flat style", () => {
        const envDefaults = result.updatedConfigs[0].specs[2]
        expect(envDefaults).to.eql({
          kind: "Project",
          name: "test-project-v10-config-env-defaults",
          varfile: "foobar",
          variables: {
            some: "var",
            foo: "bar",
          },
          providers: [
            {
              name: "test-plugin-c",
              context: "foo",
              environments: ["local", "dev"],
            },
          ],
          environments: [
            {
              name: "local",
              providers: [
                {
                  name: "test-plugin",
                },
                {
                  name: "test-plugin-b",
                },
              ],
            },
            {
              name: "other",
            },
          ],
        })
      })
      it("should convert local-openfaas provider to openfaas", () => {
        const localOpenfaasProvider = result.updatedConfigs[0].specs[3]
        expect(localOpenfaasProvider).to.eql({
          kind: "Project",
          name: "test-project-v10-config-local-openfaas",
          environments: [
            {
              name: "local",
            },
          ],
          providers: [
            {
              name: "openfaas",
            },
          ],
        })
      })
      it("should convert local-openfaas provider to openfaas for providers nested under the environment field", () => {
        const localOpenfaasProviderNested = result.updatedConfigs[0].specs[4]
        expect(localOpenfaasProviderNested).to.eql({
          kind: "Project",
          name: "test-project-v10-config-local-openfaas-nested",
          environments: [
            {
              name: "local",
              providers: [
                {
                  name: "openfaas",
                },
              ],
            },
          ],
        })
      })
      it("should convert nested module configs to the flat style", () => {
        const moduleNested = result.updatedConfigs[0].specs[5]
        expect(moduleNested).to.eql({
          kind: "Module",
          name: "module-nested",
          type: "test",
          build: {
            command: ["echo", "project"],
          },
        })
      })
      it("should convert local-openfaas module to openfaas", () => {
        const moduleOpenfaaas = result.updatedConfigs[0].specs[6]
        expect(moduleOpenfaaas).to.eql({
          kind: "Module",
          name: "module-local-openfaas",
          type: "openfaas",
          build: {
            command: ["echo", "project"],
          },
        })
      })
      it("should remove local-openfaas provider if openfaas already configured", () => {
        const openfaasExistingNested = result.updatedConfigs[0].specs[7]
        const openfaasExisting = result.updatedConfigs[0].specs[8]
        expect(openfaasExistingNested).to.eql({
          kind: "Project",
          name: "test-project-v10-config-existing-openfaas-nested",
          environments: [
            {
              name: "local",
              providers: [
                {
                  name: "openfaas",
                  gatewayUrl: "foo",
                },
              ],
            },
          ],
        })
        expect(openfaasExisting).to.eql({
          kind: "Project",
          name: "test-project-v10-config-existing-openfaas",
          environments: [
            {
              name: "local",
            },
          ],
          providers: [
            {
              name: "openfaas",
              gatewayUrl: "foo",
            },
          ],
        })
      })
      it("should convert modules in their own config files", () => {
        const modules = sortBy(result.updatedConfigs, "path").slice(1)
        expect(modules).to.eql([
          {
            path: join(projectPath, "module-a", "garden.yml"),
            specs: [
              {
                kind: "Module",
                name: "module-a",
                type: "openfaas",
                build: {
                  command: ["echo", "project"],
                },
              },
            ],
          },
          {
            path: join(projectPath, "module-b", "garden.yml"),
            specs: [
              {
                kind: "Module",
                name: "module-b",
                type: "openfaas",
                build: {
                  command: ["echo", "project"],
                },
              },
            ],
          },
          {
            path: join(projectPath, "nested", "module-c", "garden.yml"),
            specs: [
              {
                kind: "Module",
                name: "module-c",
                type: "openfaas",
                build: {
                  command: ["echo", "project"],
                },
              },
            ],
          },
        ])
      })
    })
    it("should throw if it can't re-assign the environmentDefaults.varfile field", async () => {
      await expectError(
        () =>
          command.action({
            garden,
            log,
            headerLog: log,
            footerLog: log,
            args: { configPaths: ["./project-varfile/garden.yml"] },
            opts: withDefaultGlobalOpts({
              root: projectPathErrors,
              write: false,
            }),
          }),
        (err) => {
          expect(err.message).to.include("Found a project level `varfile` field")
        }
      )
    })
    it("should abort write if config file is dirty", async () => {
      await execa("git", ["init"], { cwd: tmpDir.path })
      await cpy(join(projectPath, "garden.yml"), tmpDir.path)

      await expectError(
        () =>
          command.action({
            garden,
            log,
            headerLog: log,
            footerLog: log,
            args: { configPaths: [] },
            opts: withDefaultGlobalOpts({
              write: true,
              root: tmpDir.path,
            }),
          }),
        (err) => {
          expect(err.message).to.eql(dedent`
          Config files at the following paths are dirty:\n
          ${join(tmpDir.path, "garden.yml")}

          Please commit them before applying this command with the --write flag
          `)
        }
      )
    })
    describe("dumpConfig", () => {
      it("should return multiple specs as valid YAML", async () => {
        const res = await command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { configPaths: ["./garden.yml"] },
          opts: withDefaultGlobalOpts({
            root: projectPath,
            write: false,
          }),
        })
        const specs = res.result!.updatedConfigs[0].specs
        expect(dumpSpec(specs)).to.eql(dedent`
        kind: Project
        name: test-project-v10-config-noop
        environments:
          - name: local
          - name: other
        providers:
          - name: test-plugin
            environments:
              - local
          - name: test-plugin-b
            environments:
              - other

        ---

        kind: Project
        name: test-project-v10-config-nested
        environments:
          - name: local
            providers:
              - name: test-plugin
              - name: test-plugin-b
          - name: other

        ---

        kind: Project
        name: test-project-v10-config-env-defaults
        variables:
          some: var
          foo: bar
        environments:
          - name: local
            providers:
              - name: test-plugin
              - name: test-plugin-b
          - name: other
        varfile: foobar
        providers:
          - name: test-plugin-c
            context: foo
            environments:
              - local
              - dev

        ---

        kind: Project
        name: test-project-v10-config-local-openfaas
        environments:
          - name: local
        providers:
          - name: openfaas

        ---

        kind: Project
        name: test-project-v10-config-local-openfaas-nested
        environments:
          - name: local
            providers:
              - name: openfaas

        ---

        kind: Module
        name: module-nested
        type: test
        build:
          command:
            - echo
            - project

        ---

        kind: Module
        name: module-local-openfaas
        type: openfaas
        build:
          command:
            - echo
            - project

        ---

        kind: Project
        name: test-project-v10-config-existing-openfaas-nested
        environments:
          - name: local
            providers:
              - name: openfaas
                gatewayUrl: foo

        ---

        kind: Project
        name: test-project-v10-config-existing-openfaas
        environments:
          - name: local
        providers:
          - name: openfaas
            gatewayUrl: foo\n
        `)
      })
    })
  })
})
