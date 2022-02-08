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
import { deepOmitUndefined, uuidv4, sleep } from "../../../../src/util/util"
import request = require("supertest")
import getPort = require("get-port")
import WebSocket = require("ws")
import stripAnsi = require("strip-ansi")
import { authTokenHeader } from "../../../../src/cloud/api"

describe("GardenServer", () => {
  let garden: Garden
  let gardenServer: GardenServer
  let server: Server
  let port: number

  before(async () => {
    port = await getPort()
    garden = await makeTestGardenA()
    gardenServer = await startServer({ log: garden.log, port })
    server = (<any>gardenServer).server
  })

  after(async () => {
    server.close()
  })

  beforeEach(() => {
    gardenServer.setGarden(garden)
  })

  it("should show no URL on startup", async () => {
    const line = gardenServer["statusLog"]
    expect(line.getLatestMessage().msg).to.be.undefined
  })

  it("should update dashboard URL with own if the external dashboard goes down", async () => {
    gardenServer.showUrl("http://foo")
    garden.events.emit("serversUpdated", {
      servers: [],
    })
    const line = gardenServer["statusLog"]
    await sleep(1) // This is enough to let go of the control loop
    const status = stripAnsi(line.getLatestMessage().msg || "")
    expect(status).to.equal(`Garden dashboard running at ${gardenServer.getUrl()}`)
  })

  it("should update dashboard URL with new one if another is started", async () => {
    gardenServer.showUrl("http://foo")
    garden.events.emit("serversUpdated", {
      servers: [{ host: "http://localhost:9800", command: "dashboard" }],
    })
    const line = gardenServer["statusLog"]
    await sleep(1) // This is enough to let go of the control loop
    const status = stripAnsi(line.getLatestMessage().msg || "")
    expect(status).to.equal(`Garden dashboard running at http://localhost:9800`)
  })

  describe("GET /", () => {
    it("should return the dashboard index page", async () => {
      await request(server).get("/").expect(200)
    })
  })

  describe("POST /api", () => {
    it("should 400 on non-JSON body", async () => {
      await request(server).post("/api").send("foo").expect(400)
    })

    it("should 400 on invalid payload", async () => {
      await request(server).post("/api").send({ foo: "bar" }).expect(400)
    })

    it("should 404 on invalid command", async () => {
      await request(server).post("/api").send({ command: "foo" }).expect(404)
    })

    it("should 503 when Garden instance is not set", async () => {
      gardenServer["garden"] = undefined
      await request(server).post("/api").send({ command: "get.config" }).expect(503)
    })

    it("should execute a command and return its results", async () => {
      const res = await request(server).post("/api").send({ command: "get.config" }).expect(200)
      const config = await garden.dumpConfig({ log: garden.log })
      expect(res.body.result).to.eql(deepOmitUndefined(config))
    })

    it("should correctly map arguments and options to commands", async () => {
      const res = await request(server)
        .post("/api")
        .send({
          command: "build",
          parameters: {
            modules: ["module-a"],
            force: true,
          },
        })
        .expect(200)

      expect(taskResultOutputs(res.body.result)).to.eql({
        "build.module-a": {
          buildLog: "A",
          fresh: true,
        },
        "stage-build.module-a": {},
      })
    })
  })

  describe("/dashboardPages", () => {
    it("should resolve the URL for the given dashboard page and redirect", async () => {
      const res = await request(server).get("/dashboardPages/test-plugin/test").expect(302)

      expect(res.header.location).to.equal("http://localhost:12345/test")
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
      ws = new WebSocket(`ws://localhost:${port}/ws`)
      ws.on("open", () => {
        done()
      })
      ws.on("error", done)
    })

    afterEach(() => {
      ws.close()
    })

    const onMessage = (cb: (req: object) => void) => {
      ws.on("message", (msg) => cb(JSON.parse(msg.toString())))
    }

    it("should emit events from the Garden event bus", (done) => {
      onMessage((req) => {
        expect(req).to.eql({ type: "event", name: "_test", payload: "foo" })
        done()
      })
      garden.events.emit("_test", "foo")
    })

    it("should emit events from the incoming event bus", (done) => {
      onMessage((req) => {
        expect(req).to.eql({ type: "event", name: "_test", payload: "foo" })
        done()
      })
      gardenServer["incomingEvents"].emit("_test", "foo")
    })

    it("should send error when a request is not valid JSON", (done) => {
      onMessage((req) => {
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

      onMessage((req) => {
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
      onMessage((req) => {
        expect(req).to.eql({
          type: "error",
          message: "Message should contain an `id` field with a UUID value",
        })
        done()
      })
      ws.send(JSON.stringify({ type: "command" }))
    })

    it("should error when a request has an invalid ID", (done) => {
      onMessage((req) => {
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
      onMessage((req) => {
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
          onMessage((req: any) => {
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
      onMessage((req) => {
        // Ignore other events such as taskPending and taskProcessing and wait for the command result
        if ((<any>req).type !== "commandResult") {
          return
        }
        const taskResult = taskResultOutputs((<any>req).result)
        const result = {
          ...req,
          result: taskResult,
        }
        expect(result).to.eql({
          type: "commandResult",
          requestId: id,
          result: {
            "build.module-a": {
              buildLog: "A",
              fresh: true,
            },
            "stage-build.module-a": {},
          },
        })
        done()
      })
      ws.send(
        JSON.stringify({
          type: "command",
          id,
          command: "build",
          parameters: {
            modules: ["module-a"],
            force: true,
          },
        })
      )
    })
  })
})
