"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const chalk_1 = require("chalk");
const stripAnsi = require("strip-ansi");
const log_node_1 = require("../../../src/logger/log-node");
const logger_1 = require("../../../src/logger/logger");
const renderers_1 = require("../../../src/logger/renderers");
const file_writer_1 = require("../../../src/logger/writers/file-writer");
const logger = logger_1.getLogger();
beforeEach(() => {
    logger.children = [];
});
describe("FileWriter", () => {
    describe("render", () => {
        it("should render message without ansi characters", () => {
            const entry = logger.info(chalk_1.default.red("hello"));
            chai_1.expect(file_writer_1.render(log_node_1.LogLevel.info, entry)).to.equal("hello");
        });
        it("should render error message if entry level is error", () => {
            const entry = logger.error("error");
            const expectedOutput = stripAnsi(renderers_1.renderError(entry));
            chai_1.expect(file_writer_1.render(log_node_1.LogLevel.info, entry)).to.equal(expectedOutput);
        });
        it("should return null if entry level is geq to writer level", () => {
            const entry = logger.silly("silly");
            chai_1.expect(file_writer_1.render(log_node_1.LogLevel.info, entry)).to.equal(null);
        });
    });
});
//# sourceMappingURL=file-writer.js.map