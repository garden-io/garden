"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const logger_1 = require("../../src/logger/logger");
const renderers_1 = require("../../src/logger/renderers");
const logger = logger_1.getLogger();
beforeEach(() => {
    logger.children = [];
});
describe("renderers", () => {
    describe("renderMsg", () => {
        it("should return an empty string if the entry is empty", () => {
            const entry = logger.placeholder();
            chai_1.expect(renderers_1.renderMsg(entry)).to.equal("");
        });
        it("should render the message with the message style", () => {
            const entry = logger.info({ msg: "hello message" });
            chai_1.expect(renderers_1.renderMsg(entry)).to.equal(renderers_1.msgStyle("hello message"));
        });
        it("should join an array of messages with an arrow symbol and render with the message style", () => {
            const entry = logger.info({ msg: ["message a", "message b"] });
            chai_1.expect(renderers_1.renderMsg(entry)).to.equal(renderers_1.msgStyle("message a") + renderers_1.msgStyle(" → ") + renderers_1.msgStyle("message b"));
        });
        it("should render the message without styles if the entry is from an intercepted stream", () => {
            const entry = logger.info({ fromStdStream: true, msg: "hello stream" });
            chai_1.expect(renderers_1.renderMsg(entry)).to.equal("hello stream");
        });
        it("should join an array of messages and render without styles if the entry is from an intercepted stream", () => {
            const entry = logger.info({ fromStdStream: true, msg: ["stream a", "stream b"] });
            chai_1.expect(renderers_1.renderMsg(entry)).to.equal("stream a stream b");
        });
        it("should render the message with the error style if the entry has error status", () => {
            const entry = logger.info({ msg: "hello error", status: "error" });
            chai_1.expect(renderers_1.renderMsg(entry)).to.equal(renderers_1.errorStyle("hello error"));
        });
        it("should join an array of messages with an arrow symbol and render with the error style" +
            " if the entry has error status", () => {
            const entry = logger.info({ msg: ["error a", "error b"], status: "error" });
            chai_1.expect(renderers_1.renderMsg(entry)).to.equal(renderers_1.errorStyle("error a") + renderers_1.errorStyle(" → ") + renderers_1.errorStyle("error b"));
        });
    });
    describe("formatForTerminal", () => {
        it("should return the entry as a formatted string with a new line character", () => {
            const entry = logger.info("");
            chai_1.expect(renderers_1.formatForTerminal(entry)).to.equal("\n");
        });
        it("should return an empty string without a new line if the entry is empty", () => {
            const entry = logger.placeholder();
            chai_1.expect(renderers_1.formatForTerminal(entry)).to.equal("");
        });
    });
});
//# sourceMappingURL=renderers.js.map