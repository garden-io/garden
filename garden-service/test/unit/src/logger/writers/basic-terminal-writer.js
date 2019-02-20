"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const log_node_1 = require("../../../src/logger/log-node");
const basic_terminal_writer_1 = require("../../../src/logger/writers/basic-terminal-writer");
const logger_1 = require("../../../src/logger/logger");
const renderers_1 = require("../../../src/logger/renderers");
const logger = logger_1.getLogger();
beforeEach(() => {
    logger.children = [];
});
describe("BasicTerminalWriter", () => {
    describe("render", () => {
        it("should return a formatted message if level is geq than entry level", () => {
            const writer = new basic_terminal_writer_1.BasicTerminalWriter();
            const entry = logger.info("hello logger");
            const out = writer.render(entry, logger);
            chai_1.expect(out).to.eql(renderers_1.formatForTerminal(entry));
        });
        it("should return a new line if message is an empty string", () => {
            const writer = new basic_terminal_writer_1.BasicTerminalWriter();
            const entry = logger.info("");
            const out = writer.render(entry, logger);
            chai_1.expect(out).to.eql("\n");
        });
        it("should return null if entry level is geq to writer level", () => {
            const writer = new basic_terminal_writer_1.BasicTerminalWriter();
            const entry = logger.verbose("abc");
            const out = writer.render(entry, logger);
            chai_1.expect(out).to.eql(null);
        });
        it("should override root level if level is set", () => {
            const writer = new basic_terminal_writer_1.BasicTerminalWriter({ level: log_node_1.LogLevel.verbose });
            const entry = logger.verbose("");
            const out = writer.render(entry, logger);
            chai_1.expect(out).to.eql("\n");
        });
        it("should return an empty string if entry is empty", () => {
            const writer = new basic_terminal_writer_1.BasicTerminalWriter();
            const entry = logger.placeholder();
            const out = writer.render(entry, logger);
            chai_1.expect(out).to.eql("");
        });
    });
});
//# sourceMappingURL=basic-terminal-writer.js.map