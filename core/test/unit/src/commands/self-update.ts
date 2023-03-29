/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import finalhandler from "finalhandler"
import serveStatic from "serve-static"
import { expect } from "chai"
import { readdir } from "fs-extra"
import getPort from "get-port"
import { dirname } from "path"
import { makeDummyGarden } from "../../../../src/cli/cli"
import { ParameterValues } from "../../../../src/cli/params"
import { isEdgeVersion, SelfUpdateArgs, SelfUpdateCommand, SelfUpdateOpts } from "../../../../src/commands/self-update"
import { DummyGarden } from "../../../../src/garden"
import { makeTempDir, TempDirectory } from "../../../../src/util/fs"
import { getPackageVersion } from "../../../../src/util/util"
import { getDataDir, withDefaultGlobalOpts } from "../../../helpers"
import { createServer, Server } from "http"

describe("version helpers", () => {
  describe("isEdgeVersion", () => {
    it("should be true for 'edge' version name", () => {
      expect(isEdgeVersion("edge")).to.be.true
    })

    it("should be true for a version name starting with 'edge-'", () => {
      expect(isEdgeVersion("edge-bonsai")).to.be.true
    })

    it("should be false for a pre-release version name", () => {
      expect(isEdgeVersion("0.13.0-0")).to.be.false
    })

    it("should be false for a stable version name", () => {
      expect(isEdgeVersion("0.13.0")).to.be.false
    })
  })
})

describe("SelfUpdateCommand", () => {
  const command = new SelfUpdateCommand()

  let server: Server
  let garden: DummyGarden
  let tempDir: TempDirectory

  before(async () => {
    garden = await makeDummyGarden("/tmp", { commandInfo: { name: command.name, args: {}, opts: {} } })

    // Serve small static files to avoid slow HTTP requests during testing
    const staticServerPort = await getPort()
    const serve = serveStatic(getDataDir("self-update"))

    server = createServer((req, res) => {
      serve(req, res, finalhandler(req, res))
    })
    server.listen(staticServerPort)

    command._baseReleasesUrl = `http://127.0.0.1:${staticServerPort}/`
  })

  beforeEach(async () => {
    tempDir = await makeTempDir()
  })

  afterEach(async () => {
    try {
      if (tempDir) {
        await tempDir.cleanup()
      }
    } catch {}
  })

  after(() => {
    server?.close()
  })

  async function action(args: ParameterValues<SelfUpdateArgs>, opts: ParameterValues<SelfUpdateOpts>) {
    return command.action({
      garden,
      log: garden.log,
      headerLog: garden.log,
      footerLog: garden.log,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  }

  it(`detects the current installation directory if none is provided`, async () => {
    const { result } = await action(
      { version: "" },
      {
        "force": false,
        "install-dir": "",
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    expect(result?.installationDirectory).to.equal(dirname(process.execPath))
  })

  it(`uses the specified --install-dir if set`, async () => {
    const { result } = await action(
      { version: "edge" },
      {
        "force": false,
        "install-dir": tempDir.path,
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )

    expect(result?.installationDirectory).to.equal(tempDir.path)
  })

  it(`aborts if desired version is the same as the current version`, async () => {
    const { result } = await action(
      { version: getPackageVersion() },
      {
        "force": false,
        "install-dir": "",
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    expect(result?.installedVersion).to.be.undefined
    expect(result?.abortReason).to.equal("Version already installed")
  })

  it(`proceeds if desired version is the same as the current version and --force is set`, async () => {
    const { result } = await action(
      { version: getPackageVersion() },
      {
        "force": true,
        "install-dir": "",
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    expect(result?.installedVersion).to.be.undefined
    // The command will abort because we're running a dev build
    expect(result?.abortReason).to.not.equal("Version already installed")
  })

  it(`aborts if trying to run from a dev build`, async () => {
    const { result } = await action(
      { version: "" },
      {
        "force": true,
        "install-dir": "",
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    expect(result?.installedVersion).to.be.undefined
    expect(result?.abortReason).to.equal("Not running from binary installation")
  })

  it(`aborts cleanly if desired version isn't found`, async () => {
    const { result } = await action(
      { version: "foo" },
      {
        "force": true,
        "install-dir": tempDir.path,
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    expect(result?.installedVersion).to.be.undefined
    expect(result?.abortReason).to.equal("Version not found")
  })

  it(`installs successfully to an empty --install-dir`, async () => {
    const { result } = await action(
      { version: "edge" },
      {
        "force": false,
        "install-dir": tempDir.path,
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    expect(result?.installedVersion).to.equal("edge")
    expect(result?.abortReason).to.be.undefined

    const extracted = await readdir(tempDir.path)
    expect(extracted).to.include("garden")
    expect(extracted).to.include("static")
  })

  it(`installs successfully to an --install-dir with a previous release and creates a backup`, async () => {
    await action(
      { version: "edge" },
      {
        "force": false,
        "install-dir": tempDir.path,
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    const { result } = await action(
      { version: "edge" },
      {
        "force": false,
        "install-dir": tempDir.path,
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    expect(result?.installedVersion).to.equal("edge")
    expect(result?.abortReason).to.be.undefined

    const extracted = await readdir(tempDir.path)
    expect(extracted).to.include("garden")
    expect(extracted).to.include("static")
    expect(extracted).to.include(".backup")
  })

  it(`installs successfully to an --install-dir with a previous release and overwrites a backup`, async () => {
    await action(
      { version: "edge" },
      {
        "force": false,
        "install-dir": tempDir.path,
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    await action(
      { version: "edge" },
      {
        "force": false,
        "install-dir": tempDir.path,
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    const { result } = await action(
      {
        version: "edge",
      },
      {
        "force": false,
        "install-dir": tempDir.path,
        "platform": "",
        "major": false,
        // "minor": false,
      }
    )
    expect(result?.installedVersion).to.equal("edge")
    expect(result?.abortReason).to.be.undefined

    const extracted = await readdir(tempDir.path)
    expect(extracted).to.include("garden")
    expect(extracted).to.include("static")
    expect(extracted).to.include(".backup")
  })

  it(`handles --platform=windows and zip archives correctly`, async () => {
    await action(
      { version: "edge" },
      {
        "force": false,
        "install-dir": tempDir.path,
        "platform": "windows",
        "major": false,
        // "minor": false,
      }
    )

    const extracted = await readdir(tempDir.path)
    expect(extracted).to.include("garden.exe")
    expect(extracted).to.include("static")
  })

  it(`handles --platform=macos and tar.gz archives correctly`, async () => {
    await action(
      { version: "edge" },
      {
        "force": false,
        "install-dir": tempDir.path,
        "platform": "macos",
        "major": false,
        // "minor": false,
      }
    )

    const extracted = await readdir(tempDir.path)
    expect(extracted).to.include("garden")
    expect(extracted).to.include("static")
  })
})
