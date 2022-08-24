/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { builtInExcludes, makeSyncConfig } from "../../../../../src/plugins/kubernetes/dev-mode"

describe("k8s dev mode helpers", () => {
  const localPath = "/path/to/module/src"
  const remoteDestination = "exec:'various fun connection parameters'"
  // const source = "src"
  // const target = "/app/src"
  describe("makeSyncConfig", () => {
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
        mode: "one-way",
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
        // spec: {
        //   source, // TODO-G2 figure out where these two go
        //   target,
        //   mode: "one-way",
        // },
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
})
