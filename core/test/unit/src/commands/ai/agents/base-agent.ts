/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { BaseAgent } from "../../../../../../src/commands/ai/agents/base-agent.js"
import type { AgentContext, AgentResponse } from "../../../../../../src/commands/ai/types.js"
import { makeTestGardenA } from "../../../../../helpers.js"
import fsExtra from "fs-extra"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"
import type { Anthropic } from "@anthropic-ai/sdk"

// Test implementation of BaseAgent
class TestAgent extends BaseAgent {
  constructor(context: AgentContext, _projectRoot: string) {
    super(context, "test-agent")
  }

  getName(): string {
    return "test-agent"
  }

  getDescription(): string {
    return "Test agent for testing BaseAgent functionality"
  }

  getSystemPrompt(): string {
    return "You are a test agent."
  }

  protected override getAdditionalToolHandlers() {
    return {}
  }

  protected override getAdditionalTools() {
    return []
  }

  async processQuery(_query: string): Promise<AgentResponse> {
    return {
      message: "Test response",
    }
  }

  // Expose protected members for testing
  public getTestToolHandlers() {
    return this.toolHandlers
  }

  public getTestToolsDefinition() {
    return this.getToolsDefinition()
  }
}

describe("BaseAgent", () => {
  let testAgent: TestAgent
  let testContext: AgentContext
  let testDir: string

  beforeEach(async () => {
    const garden = await makeTestGardenA()

    // Create mock Anthropic client
    const mockAnthropic = {
      messages: {
        create: async () => ({ content: [], stop_reason: "end_turn" }),
      },
    } as unknown as Anthropic

    testContext = {
      log: garden.log,
      garden,
      anthropic: mockAnthropic,
      projectRoot: garden.projectRoot,
      projectInfo: {
        directories: [],
        configFiles: [],
        structure: {
          hasKubernetes: false,
          hasDocker: false,
          hasGarden: true,
          hasTerraform: false,
          services: [],
          builds: [],
          infrastructure: [],
        },
      },
    }
    testDir = join(tmpdir(), `garden-test-${randomUUID()}`)
    await fsExtra.ensureDir(testDir)
    testAgent = new TestAgent(testContext, testDir)
  })

  afterEach(async () => {
    await fsExtra.remove(testDir)
  })

  describe("tool handlers", () => {
    describe("list_directory", () => {
      it("should list directory contents", async () => {
        // Create test files
        await fsExtra.writeFile(join(testDir, "file1.txt"), "content1")
        await fsExtra.writeFile(join(testDir, "file2.txt"), "content2")
        await fsExtra.ensureDir(join(testDir, "subdir"))
        await fsExtra.writeFile(join(testDir, "subdir", "file3.txt"), "content3")

        const handler = testAgent.getTestToolHandlers().list_directory
        const result = await handler({
          input: { directory_path: "." },
          rootDir: testDir,
          log: testContext.log,
        })

        expect(result.result).to.equal("success")
        expect(result.content).to.include("📄 file1.txt")
        expect(result.content).to.include("📄 file2.txt")
        expect(result.content).to.include("📁 subdir/")
        expect(result.content).to.not.include("file3.txt") // Not recursive by default
      })

      it("should list directory contents recursively", async () => {
        // Create test files
        await fsExtra.writeFile(join(testDir, "file1.txt"), "content1")
        await fsExtra.ensureDir(join(testDir, "subdir"))
        await fsExtra.writeFile(join(testDir, "subdir", "file2.txt"), "content2")

        const handler = testAgent.getTestToolHandlers().list_directory
        const result = await handler({
          input: { directory_path: ".", recursive: true },
          rootDir: testDir,
          log: testContext.log,
        })

        expect(result.result).to.equal("success")
        expect(result.content).to.include("📄 file1.txt")
        expect(result.content).to.include("📁 subdir/")
        expect(result.content).to.include("📄 subdir/file2.txt")
      })

      it("should ignore common directories", async () => {
        // Create test directories that should be ignored
        await fsExtra.ensureDir(join(testDir, "node_modules"))
        await fsExtra.ensureDir(join(testDir, ".git"))
        await fsExtra.ensureDir(join(testDir, ".garden"))
        await fsExtra.writeFile(join(testDir, "file1.txt"), "content1")

        const handler = testAgent.getTestToolHandlers().list_directory
        const result = await handler({
          input: { directory_path: "." },
          rootDir: testDir,
          log: testContext.log,
        })

        expect(result.result).to.equal("success")
        expect(result.content).to.include("📄 file1.txt")
        expect(result.content).to.not.include("node_modules")
        expect(result.content).to.not.include(".git")
        expect(result.content).to.not.include(".garden")
      })

      it("should handle non-existent directory", async () => {
        const handler = testAgent.getTestToolHandlers().list_directory
        const result = await handler({
          input: { directory_path: "nonexistent" },
          rootDir: testDir,
          log: testContext.log,
        })

        expect(result.result).to.equal("error")
        expect(result.content).to.include("Error listing directory")
      })
    })

    describe("read_files", () => {
      it("should read multiple files", async () => {
        await fsExtra.writeFile(join(testDir, "file1.txt"), "content1")
        await fsExtra.writeFile(join(testDir, "file2.txt"), "content2")

        const handler = testAgent.getTestToolHandlers().read_files
        const result = await handler({
          input: { file_paths: ["file1.txt", "file2.txt"] },
          rootDir: testDir,
          log: testContext.log,
        })

        expect(result.result).to.equal("success")
        expect(result.content).to.include("file1.txt")
        expect(result.content).to.include("content1")
        expect(result.content).to.include("file2.txt")
        expect(result.content).to.include("content2")
      })

      it("should handle non-existent files", async () => {
        await fsExtra.writeFile(join(testDir, "file1.txt"), "content1")

        const handler = testAgent.getTestToolHandlers().read_files
        const result = await handler({
          input: { file_paths: ["file1.txt", "nonexistent.txt"] },
          rootDir: testDir,
          log: testContext.log,
        })

        expect(result.result).to.equal("success")
        expect(result.content).to.include("file1.txt")
        expect(result.content).to.include("content1")
        expect(result.content).to.include("Failed to read")
        expect(result.content).to.include("nonexistent.txt")
      })
    })

    describe("write_file", () => {
      it("should write a new file", async () => {
        const handler = testAgent.getTestToolHandlers().write_file
        const result = await handler({
          input: { file_path: "newfile.txt", content: "new content" },
          rootDir: testDir,
          log: testContext.log,
        })

        expect(result.result).to.equal("success")
        expect(result.content).to.include("Successfully created file")

        const fileContent = await fsExtra.readFile(join(testDir, "newfile.txt"), "utf-8")
        expect(fileContent).to.equal("new content")
      })

      it("should overwrite existing file with force flag", async () => {
        await fsExtra.writeFile(join(testDir, "existing.txt"), "old content")

        const handler = testAgent.getTestToolHandlers().write_file
        const result = await handler({
          input: { file_path: "existing.txt", content: "new content", force: true },
          rootDir: testDir,
          log: testContext.log,
        })

        expect(result.result).to.equal("success")
        expect(result.content).to.include("Successfully overwrote file")

        const fileContent = await fsExtra.readFile(join(testDir, "existing.txt"), "utf-8")
        expect(fileContent).to.equal("new content")
      })
    })
  })

  describe("getToolsDefinition", () => {
    it("should return tool definitions", () => {
      const tools = testAgent.getTestToolsDefinition()

      expect(tools).to.be.an("array")
      expect(tools.length).to.be.at.least(3)

      const toolNames = tools.map((t) => t.name)
      expect(toolNames).to.include("list_directory")
      expect(toolNames).to.include("read_files")
      expect(toolNames).to.include("write_file")
    })
  })

  describe("abstract methods", () => {
    it("should allow subclasses to add additional tools", () => {
      class ExtendedAgent extends BaseAgent {
        getName(): string {
          return "extended-agent"
        }

        getDescription(): string {
          return "Extended test agent"
        }

        getSystemPrompt(): string {
          return "You are an extended test agent."
        }

        protected override getAdditionalToolHandlers() {
          return {
            custom_tool: async () => ({ content: "custom", result: "success" as const }),
          }
        }

        protected override getAdditionalTools() {
          return [
            {
              name: "custom_tool",
              description: "A custom tool",
              input_schema: {
                type: "object" as const,
                properties: {},
              },
            },
          ]
        }

        async processQuery(_query: string): Promise<AgentResponse> {
          return { message: "test" }
        }

        // Expose protected members for testing
        public getTestToolHandlers() {
          return this.toolHandlers
        }

        public getTestToolsDefinition() {
          return this.getToolsDefinition()
        }
      }

      const extendedAgent = new ExtendedAgent(testContext, testDir)
      const tools = extendedAgent.getTestToolsDefinition()

      const toolNames = tools.map((t) => t.name)
      expect(toolNames).to.include("custom_tool")
      expect(extendedAgent.getTestToolHandlers()).to.have.property("custom_tool")
    })
  })
})
