/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { makeTestGardenA, taskResultOutputs } from "../../../helpers"
import { Server } from "http"
import { startServer, GardenServer } from "../../../../src/server/server"
import { Garden } from "../../../../src/garden"
import { expect } from "chai"
import { sleep } from "../../../../src/util/util"
import request = require("supertest")
import getPort = require("get-port")
import WebSocket = require("ws")
import stripAnsi from "strip-ansi"
import { authTokenHeader } from "../../../../src/cloud/api"
import { ServeCommand } from "../../../../src/commands/serve"
import websockify from "koa-websocket"
import { gardenEnv } from "../../../../src/constants"
import { deepOmitUndefined } from "../../../../src/util/objects"
import { uuidv4 } from "../../../../src/util/random"

describe("GardenServer", () => {
  let garden: Garden
  let gardenServer: GardenServer
  let server: Server
  let port: number
  let app: websockify.App

  const hostname = "127.0.0.1"

  const command = new ServeCommand()

  before(async () => {
    port = await getPort()
    garden = await makeTestGardenA()
    gardenEnv.GARDEN_SERVER_HOSTNAME = hostname
    gardenServer = await startServer({ log: garden.log, command, port })
    await gardenServer.start()
    server = gardenServer["server"]
    app = gardenServer["app"]
  })

  after(async () => {
    server.close()
  })

  beforeEach(async () => {
    await gardenServer.setGarden(garden)
  })

  it("should show no URL on startup", async () => {
    const line = gardenServer["statusLog"]
    expect(line.getLatestEntry()).to.be.undefined
  })

  it("should update server URL with own if the external server goes down", async () => {
    gardenServer.showUrl("http://foo")
    garden.events.emit("serversUpdated", {
      servers: [],
    })
    const line = gardenServer["statusLog"]
    await sleep(1) // This is enough to let go of the control loop
    const status = stripAnsi(line.getLatestEntry().msg || "")
    expect(status).to.equal(`🌻 Garden server running at ${gardenServer.getUrl()}`)
  })

  it("should update server URL with new one if another is started", async () => {
    gardenServer.showUrl("http://foo")
    garden.events.emit("serversUpdated", {
      servers: [{ host: `http://${hostname}:9800`, command: "serve", serverAuthKey: "foo" }],
    })
    const line = gardenServer["statusLog"]
    await sleep(1) // This is enough to let go of the control loop
    const status = stripAnsi(line.getLatestEntry().msg || "")
    expect(status).to.equal(`🌻 Garden server running at http://${hostname}:9800?key=foo`)
  })

  describe("POST /api", () => {
    it("returns 401 if missing auth header", async () => {
      await request(server).post("/api").send({}).expect(401)
    })

    it("returns 401 if auth header doesn't match auth key", async () => {
      await request(server)
        .post("/api")
        .set({ [authTokenHeader]: "foo" })
        .send({})
        .expect(401)
    })

    it("should 400 on non-JSON body", async () => {
      await request(server)
        .post("/api")
        .set({ [authTokenHeader]: gardenServer.authKey })
        .send("foo")
        .expect(400)
    })

    it("should 400 on invalid payload", async () => {
      await request(server)
        .post("/api")
        .set({ [authTokenHeader]: gardenServer.authKey })
        .send({ foo: "bar" })
        .expect(400)
    })

    it("should 404 on invalid command", async () => {
      await request(server)
        .post("/api")
        .set({ [authTokenHeader]: gardenServer.authKey })
        .send({ command: "foo" })
        .expect(404)
    })

    it("should 503 when Garden instance is not set", async () => {
      gardenServer["garden"] = undefined
      await request(server)
        .post("/api")
        .set({ [authTokenHeader]: gardenServer.authKey })
        .send({ command: "get.config" })
        .expect(503)
    })

    it("should execute a command and return its results", async () => {
      const res = await request(server)
        .post("/api")
        .set({ [authTokenHeader]: gardenServer.authKey })
        .send({ command: "get.config" })
        .expect(200)
      const config = await garden.dumpConfig({ log: garden.log })
      expect(res.body.result).to.eql(deepOmitUndefined(config))
    })

    it("should correctly map arguments and options to commands", async () => {
      const res = await request(server)
        .post("/api")
        .set({ [authTokenHeader]: gardenServer.authKey })
        .send({
          command: "build",
          parameters: {
            names: ["module-a"],
            force: true,
          },
        })
        .expect(200)

      const result = taskResultOutputs(res.body.result)
      expect(result["build.module-a"]).to.exist
      expect(result["build.module-a"].state).to.equal("ready")
    })
  })

  describe("/dashboardPages", () => {
    it("returns 401 if missing auth header", async () => {
      await request(server).get("/dashboardPages/test-plugin/test").expect(401)
    })

    it("returns 401 if auth header doesn't match auth key", async () => {
      await request(server)
        .get("/dashboardPages/test-plugin/test")
        .set({ [authTokenHeader]: "foo" })
        .send({})
        .expect(401)
    })

    it("should resolve the URL for the given dashboard page and redirect", async () => {
      const res = await request(server)
        .get("/dashboardPages/test-plugin/test")
        .set({ [authTokenHeader]: gardenServer.authKey })
        .expect(302)

      expect(res.header.location).to.equal(`http://localhost:12345/test`)
    })
  })

  describe("/events", () => {
    it("returns 401 if missing auth header", async () => {
      await request(server).post("/events").send({}).expect(401)
    })

    it("returns 401 if auth header doesn't match auth key", async () => {
      await request(server)
        .post("/events")
        .set({ [authTokenHeader]: "foo" })
        .send({})
        .expect(401)
    })

    it("posts events on the incoming event bus", (done) => {
      let passed = false

      gardenServer["incomingEvents"].on("_test", () => {
        !passed && done()
        passed = true
      })

      request(server)
        .post("/events")
        .set({ [authTokenHeader]: gardenServer.authKey })
        .send({
          events: [{ name: "_test", payload: { some: "value" } }],
        })
        .expect(200)
        .catch(done)
    })
  })

  describe("/ws", () => {
    let ws: WebSocket

    beforeEach((done) => {
      ws = new WebSocket(`ws://${hostname}:${port}/ws?sessionId=${garden.sessionId}`)
      ws.on("error", done)
      ws.on("open", () => {
        done()
      })
    })

    afterEach(() => {
      ws.close()
    })

    const onMessageAfterReady = (cb: (req: object) => void) => {
      ws.on("message", (msg) => {
        const parsed = JSON.parse(msg.toString())
        // This message is always sent at the beginning and we skip it here
        // to simplify testing.
        if (parsed.name !== "serverReady") {
          cb(parsed)
        }
      })
    }

    it("terminates the connection if auth query params are missing", (done) => {
      const badWs = new WebSocket(`ws://${hostname}:${port}/ws`)
      badWs.on("error", done)
      badWs.on("close", (code, reason) => {
        expect(code).to.eql(4401)
        expect(reason.toString()).to.eql("Unauthorized")
        done()
      })
    })

    it("terminates the connection if key doesn't match and sessionId is missing", (done) => {
      const badWs = new WebSocket(`ws://${hostname}:${port}/ws?key=foo`)
      badWs.on("error", done)
      badWs.on("close", (code, reason) => {
        expect(code).to.eql(4401)
        expect(reason.toString()).to.eql("Unauthorized")
        done()
      })
    })

    it("terminates the connection if sessionId doesn't match and key is missing", (done) => {
      const badWs = new WebSocket(`ws://${hostname}:${port}/ws?sessionId=foo`)
      badWs.on("error", done)
      badWs.on("close", (code, reason) => {
        expect(code).to.eql(4401)
        expect(reason.toString()).to.eql("Unauthorized")
        done()
      })
    })

    it("terminates the connection if both sessionId and key are bad", (done) => {
      const badWs = new WebSocket(`ws://${hostname}:${port}/ws?sessionId=foo&key=bar`)
      badWs.on("error", done)
      badWs.on("close", (code, reason) => {
        expect(code).to.eql(4401)
        expect(reason.toString()).to.eql("Unauthorized")
        done()
      })
    })

    it("should send a serverReady event when the server is ready", (done) => {
      let msgs: any[] = []
      ws.on("message", (msg) => {
        msgs.push(JSON.parse(msg.toString()))

        if (msgs.length === 2) {
          expect(msgs).to.eql([
            { type: "event", name: "serverReady", payload: {} },
            { type: "event", name: "_test", payload: "foo" },
          ])
          done()
        }
      })
      garden.events.emit("_test", "foo")
    })

    it("should emit events from the Garden event bus", (done) => {
      onMessageAfterReady((req) => {
        expect(req).to.eql({ type: "event", name: "_test", payload: "foo" })
        done()
      })
      garden.events.emit("_test", "foo")
    })

    it("should send error when a request is not valid JSON", (done) => {
      onMessageAfterReady((req) => {
        expect(req).to.eql({
          type: "error",
          message: "Could not parse message as JSON",
        })
        done()
      })
      ws.send("ijdgkasdghlasdkghals")
    })

    it("should send error when Garden instance is not set", (done) => {
      const id = uuidv4()

      onMessageAfterReady((req) => {
        expect(req).to.eql({
          type: "error",
          message: "Waiting for Garden instance to initialize",
          requestId: id,
        })
        done()
      })

      gardenServer["garden"] = undefined

      ws.send(
        JSON.stringify({
          type: "command",
          id,
          command: "get.config",
        })
      )
    })

    it("should error when a request is missing an ID", (done) => {
      onMessageAfterReady((req) => {
        expect(req).to.eql({
          type: "error",
          message: "Message should contain an `id` field with a UUID value",
        })
        done()
      })
      ws.send(JSON.stringify({ type: "command" }))
    })

    it("should error when a request has an invalid ID", (done) => {
      onMessageAfterReady((req) => {
        expect(req).to.eql({
          type: "error",
          requestId: "ksdhgalsdkjghalsjkg",
          message: "Message should contain an `id` field with a UUID value",
        })
        done()
      })
      ws.send(JSON.stringify({ type: "command", id: "ksdhgalsdkjghalsjkg" }))
    })

    it("should error when a request has an invalid type", (done) => {
      const id = uuidv4()
      onMessageAfterReady((req) => {
        expect(req).to.eql({
          type: "error",
          requestId: id,
          message: "Unsupported request type: foo",
        })
        done()
      })
      ws.send(JSON.stringify({ type: "foo", id }))
    })

    it("should execute a command and return its results", (done) => {
      const id = uuidv4()

      garden
        .dumpConfig({ log: garden.log })
        .then((config) => {
          onMessageAfterReady((req: any) => {
            if (req.type !== "commandResult") {
              return
            }

            expect(req).to.eql({
              type: "commandResult",
              requestId: id,
              result: deepOmitUndefined(config),
            })
            done()
          })
          ws.send(
            JSON.stringify({
              type: "command",
              id,
              command: "get.config",
            })
          )
        })
        .catch(done)
    })

    it("should correctly map arguments and options to commands", (done) => {
      const id = uuidv4()
      onMessageAfterReady((req) => {
        // Ignore other events such as taskPending and taskProcessing and wait for the command result
        if ((<any>req).type !== "commandResult") {
          return
        }
        const taskResult = taskResultOutputs((<any>req).result)
        const result = {
          ...(<any>req),
          result: taskResult,
        }
        expect(result.requestId).to.equal(id)
        expect(result.result["build.module-a"]).to.exist
        expect(result.result["build.module-a"].state).to.equal("ready")
        done()
      })
      ws.send(
        JSON.stringify({
          type: "command",
          id,
          command: "build",
          parameters: {
            names: ["module-a"],
            force: true,
          },
        })
      )
    })
  })
})
