"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const logger_1 = require("../../src/logger/logger");
const logger = logger_1.getLogger();
beforeEach(() => {
    logger.children = [];
});
describe("LogNode", () => {
    describe("appendNode", () => {
        it("should add new child entries to the respective node", () => {
            logger.error("error");
            logger.warn("warn");
            logger.info("info");
            logger.verbose("verbose");
            logger.debug("debug");
            logger.silly("silly");
            const prevLength = logger.children.length;
            const entry = logger.children[0];
            const nested = entry.info("nested");
            const deepNested = nested.info("deep");
            chai_1.expect(logger.children[0].children).to.have.lengthOf(1);
            chai_1.expect(logger.children[0].children[0]).to.eql(nested);
            chai_1.expect(logger.children[0].children[0].children[0]).to.eql(deepNested);
            chai_1.expect(logger.children).to.have.lengthOf(prevLength);
        });
    });
});
//# sourceMappingURL=log-node.js.map