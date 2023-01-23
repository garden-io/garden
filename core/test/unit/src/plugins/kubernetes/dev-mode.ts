/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { KubernetesTargetResourceSpec } from "../../../../../src/plugins/kubernetes/config"
import {
  builtInExcludes,
  convertDevModeSpec,
  getLocalSyncPath,
  KubernetesModuleDevModeSpec,
  makeSyncConfig,
} from "../../../../../src/plugins/kubernetes/dev-mode"

describe("k8s dev mode helpers", () => {
  describe("getLocalSyncPath", () => {
    context("relative source path", () => {
      it("should join the module root path with the source path", () => {
        const relativeSourcePath = "../relative/path"
        const basePath = "/this/is/module/path"
        const localPath = getLocalSyncPath(relativeSourcePath, basePath)
        expect(localPath).to.equal("/this/is/module/relative/path")
      })
    })

    context("absolute source path", () => {
      it("should ignore the module root path and return the absolute source path", () => {
        const absoluteSourcePath = "/absolute/path"
        const basePath = "/this/is/module/path"
        const localPath = getLocalSyncPath(absoluteSourcePath, basePath)
        expect(localPath).to.equal(absoluteSourcePath)
      })
    })
  })

  describe("makeSyncConfig", () => {
    const localPath = "/path/to/module/src"
    const remoteDestination = "exec:'various fun connection parameters'"

    it("should generate a simple sync config", () => {
      const config = makeSyncConfig({
        localPath,
        remoteDestination,
        actionDefaults: {},
        opts: {},
        providerDefaults: {},
      })

      expect(config).to.eql({
        alpha: localPath,
        beta: remoteDestination,
        ignore: [...builtInExcludes],
        mode: "one-way-safe",
        defaultOwner: undefined,
        defaultGroup: undefined,
        defaultDirectoryMode: undefined,
        defaultFileMode: undefined,
      })
    })

    it("should apply provider-level defaults", () => {
      const config = makeSyncConfig({
        localPath,
        remoteDestination,
        actionDefaults: {
          exclude: ["**/*.log"],
          owner: "node",
          group: "admin",
          fileMode: 600,
          directoryMode: 700,
        },
        opts: {
          mode: "one-way",
        },
        providerDefaults: {},
      })

      expect(config).to.eql({
        alpha: localPath,
        beta: remoteDestination,
        ignore: [...builtInExcludes, "**/*.log"],
        mode: "one-way",
        defaultOwner: "node",
        defaultGroup: "admin",
        defaultFileMode: 600,
        defaultDirectoryMode: 700,
      })
    })

    it("should override/extend provider-level defaults with settings on the sync spec", () => {
      const config = makeSyncConfig({
        localPath,
        remoteDestination,
        actionDefaults: {
          exclude: ["**/*.log"],
          owner: "node",
          group: "admin",
          fileMode: 600,
          directoryMode: 700,
        },
        opts: {
          mode: "one-way",
          exclude: ["node_modules"],
          defaultOwner: "owner_from_spec",
          defaultGroup: "group_from_spec",
          defaultFileMode: 700,
          defaultDirectoryMode: 777,
        },
        providerDefaults: {},
      })

      expect(config).to.eql({
        alpha: localPath,
        beta: remoteDestination,
        ignore: [...builtInExcludes, "**/*.log", "node_modules"],
        mode: "one-way",
        defaultOwner: "owner_from_spec",
        defaultGroup: "group_from_spec",
        defaultFileMode: 700,
        defaultDirectoryMode: 777,
      })
    })

    it("should return a remote alpha and a local beta when called with a reverse sync mode", () => {
      const config = makeSyncConfig({
        localPath,
        remoteDestination,
        actionDefaults: {},
        opts: {
          mode: "one-way-replica-reverse",
        },
        providerDefaults: {},
      })

      expect(config).to.eql({
        alpha: remoteDestination, // <----
        beta: localPath, // <----
        ignore: [...builtInExcludes],
        mode: "one-way-replica-reverse",
        defaultOwner: undefined,
        defaultGroup: undefined,
        defaultDirectoryMode: undefined,
        defaultFileMode: undefined,
      })
    })
  })

  describe("helpers for converting old-style dev mode specs from module configs", () => {
    describe("convertDevModeSpec", () => {
      it("should convert a simple dev mode spec from a kubernetes or helm module", () => {
        // Since the dev mode specs for both `kubernetes` and `helm` modules have the type
        // `KubernetesModuleDevModeSpec`, we don't need separate test cases for each of those two module types here.
        const oldDevModeSpec: KubernetesModuleDevModeSpec = {
          sync: [
            {
              target: "/app/src",
              source: "src",
              mode: "two-way",
            },
          ],
        }
        const target: KubernetesTargetResourceSpec = {
          kind: "Deployment",
          name: "some-deployment",
        }
        const converted = convertDevModeSpec(oldDevModeSpec, "/path/to/module", target)
        expect(converted).to.eql({
          syncs: [
            {
              target: {
                kind: "Deployment",
                name: "some-deployment",
              },
              mode: "two-way",
              sourcePath: "/path/to/module/src",
              containerPath: "/app/src",
            },
          ],
        })
      })

      it("should convert a dev mode spec using several options from a kubernetes or helm module", () => {
        const oldDevModeSpec: KubernetesModuleDevModeSpec = {
          sync: [
            {
              target: "/app/src",
              source: "src",
              mode: "two-way",
              exclude: ["bad/things"],
              defaultFileMode: 600,
              defaultDirectoryMode: 700,
              defaultOwner: "some-user",
              defaultGroup: "some-group",
            },
          ],
          containerName: "app",
          args: ["arg1", "arg2"],
          command: ["cmd"],
        }
        const target: KubernetesTargetResourceSpec = {
          kind: "Deployment",
          name: "some-deployment",
        }
        const converted = convertDevModeSpec(oldDevModeSpec, "/path/to/module", target)
        expect(converted).to.eql({
          syncs: [
            {
              target: {
                kind: "Deployment",
                name: "some-deployment",
              },
              mode: "two-way",
              exclude: ["bad/things"],
              defaultFileMode: 600,
              defaultDirectoryMode: 700,
              defaultOwner: "some-user",
              defaultGroup: "some-group",
              sourcePath: "/path/to/module/src",
              containerPath: "/app/src",
            },
          ],
          overrides: [
            {
              target: {
                kind: "Deployment",
                name: "some-deployment",
                containerName: undefined,
              },
              command: ["cmd"],
              args: ["arg1", "arg2"],
            },
          ],
        })
      })
    })
  })
})
