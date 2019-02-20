"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const log_node_1 = require("../../src/logger/log-node");
const logger_1 = require("../../src/logger/logger");
const logger = logger_1.getLogger();
beforeEach(() => {
    logger.children = [];
});
describe("Logger", () => {
    describe("findById", () => {
        it("should return the first log entry with a matching id and undefined otherwise", () => {
            logger.info({ msg: "0" });
            logger.info({ msg: "a1", id: "a" });
            logger.info({ msg: "a2", id: "a" });
            chai_1.expect(logger.findById("a")["opts"]["msg"]).to.eql("a1");
            chai_1.expect(logger.findById("z")).to.be.undefined;
        });
    });
    describe("filterBySection", () => {
        it("should return an array of all entries with the matching section name", () => {
            logger.info({ section: "s0" });
            logger.info({ section: "s1", id: "a" });
            logger.info({ section: "s2" });
            logger.info({ section: "s1", id: "b" });
            const s1 = logger.filterBySection("s1");
            const sEmpty = logger.filterBySection("s99");
            chai_1.expect(s1.map(entry => entry.id)).to.eql(["a", "b"]);
            chai_1.expect(sEmpty).to.eql([]);
        });
    });
    describe("getLogEntries", () => {
        it("should return an ordered list of log entries", () => {
            logger.error("error");
            logger.warn("warn");
            logger.info("info");
            logger.verbose("verbose");
            logger.debug("debug");
            logger.silly("silly");
            const entries = logger.getLogEntries();
            const levels = entries.map(e => e.level);
            chai_1.expect(entries).to.have.lengthOf(6);
            chai_1.expect(levels).to.eql([
                log_node_1.LogLevel.error,
                log_node_1.LogLevel.warn,
                log_node_1.LogLevel.info,
                log_node_1.LogLevel.verbose,
                log_node_1.LogLevel.debug,
                log_node_1.LogLevel.silly,
            ]);
        });
    });
});
//# sourceMappingURL=logger.js.map