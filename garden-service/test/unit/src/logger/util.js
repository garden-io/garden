"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const util_1 = require("../../src/logger/util");
describe("util", () => {
    describe("getChildNodes", () => {
        it("should convert an n-ary tree into an ordered list of child nodes (skipping the root)", () => {
            const graph = {
                children: [
                    {
                        children: [
                            {
                                children: [
                                    { children: [], id: 3 },
                                ],
                                id: 2,
                            },
                            { children: [], id: 4 },
                            { children: [], id: 5 },
                        ],
                        id: 1,
                    },
                    {
                        children: [],
                        id: 6,
                    },
                ],
                id: 0,
            };
            const nodeList = util_1.getChildNodes(graph);
            chai_1.expect(nodeList.map(n => n.id)).to.eql([1, 2, 3, 4, 5, 6]);
        });
    });
});
//# sourceMappingURL=util.js.map