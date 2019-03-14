"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const log_node_1 = require("../../../src/logger/log-node");
const fancy_terminal_writer_1 = require("../../../src/logger/writers/fancy-terminal-writer");
const logger_1 = require("../../../src/logger/logger");
const logger = logger_1.getLogger();
beforeEach(() => {
    logger.children = [];
});
describe("FancyTerminalWriter", () => {
    describe("toTerminalEntries", () => {
        const writer = new fancy_terminal_writer_1.FancyTerminalWriter();
        const verboseWriter = new fancy_terminal_writer_1.FancyTerminalWriter({ level: log_node_1.LogLevel.verbose });
        writer.stop();
        verboseWriter.stop();
        it("should map a LogNode into an array of entries with line numbers and spinner positions", () => {
            logger.info("1 line"); // 0
            logger.info("2 lines\n"); // 1
            logger.info("1 line"); // 3
            logger.info("3 lines\n\n"); // 4
            const spinner = logger.info({ msg: "spinner", status: "active" }); // 7
            spinner.info({ msg: "nested spinner", status: "active" }); // 8
            const terminalEntries = writer.toTerminalEntries(logger);
            const lineNumbers = terminalEntries.map(e => e.lineNumber);
            const spinners = terminalEntries.filter(e => !!e.spinnerCoords).map(e => e.spinnerCoords);
            chai_1.expect(lineNumbers).to.eql([0, 1, 3, 4, 7, 8]);
            chai_1.expect(spinners).to.eql([[0, 7], [3, 8]]);
        });
        it("should override root level if level is set", () => {
            const entry = logger.verbose("");
            const terminalEntries = verboseWriter.toTerminalEntries(logger);
            chai_1.expect(terminalEntries[0].key).to.eql(entry.key);
        });
        it("should skip entry if entry level is geq to writer level", () => {
            logger.verbose("");
            const terminalEntries = writer.toTerminalEntries(logger);
            chai_1.expect(terminalEntries).to.eql([]);
        });
        it("should skip entry if entry is empty", () => {
            logger.placeholder();
            const terminalEntries = writer.toTerminalEntries(logger);
            chai_1.expect(terminalEntries).to.eql([]);
        });
    });
});
//# sourceMappingURL=fancy-terminal-writer.js.map