/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  builtInExcludes,
  getLocalSyncPath,
  getSyncKeyPrefix,
  makeSyncConfig,
} from "../../../../../src/plugins/kubernetes/sync.js"

describe("k8s sync helpers", () => {
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
          fileMode: 0o600,
          directoryMode: 0o700,
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
        defaultFileMode: 0o600,
        defaultDirectoryMode: 0o700,
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
          fileMode: 0o600,
          directoryMode: 0o700,
        },
        opts: {
          mode: "one-way",
          exclude: ["node_modules"],
          defaultOwner: "owner_from_spec",
          defaultGroup: "group_from_spec",
          defaultFileMode: 0o700,
          defaultDirectoryMode: 0o777,
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
        defaultFileMode: 0o700,
        defaultDirectoryMode: 0o777,
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

  describe("getSyncKeyPrefix", () => {
    const environmentName = "dev"
    const namespace = "default"

    it("produces a sync key prefix with double-dashes", () => {
      const syncKeyPrefix = getSyncKeyPrefix({ environmentName, namespace, actionName: "backend" })
      expect(syncKeyPrefix).to.eql("k8s--dev--default--backend--")
    })

    it("produces non-colliding keys if one action's name starts with another action's name", () => {
      const actionName1 = "backend"
      const actionName2 = "backend-new"
      expect(actionName2.startsWith(actionName1)).to.be.true

      const syncKeyPrefix1 = getSyncKeyPrefix({ environmentName, namespace, actionName: actionName1 })
      const syncKeyPrefix2 = getSyncKeyPrefix({ environmentName, namespace, actionName: actionName2 })
      expect(syncKeyPrefix2.startsWith(syncKeyPrefix1)).to.be.false
      expect(syncKeyPrefix1.startsWith(syncKeyPrefix2)).to.be.false
    })
  })
})
