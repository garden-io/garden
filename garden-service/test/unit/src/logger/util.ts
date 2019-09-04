import { expect } from "chai"

import { getChildNodes } from "../../../../src/logger/util"

describe("util", () => {
  describe("getChildNodes", () => {
    it("should convert an n-ary tree into an ordered list of child nodes (skipping the root)", () => {
      interface TestNode {
        children: any[]
        id: number
      }
      const graph = {
        children: [
          {
            children: [
              {
                children: [{ children: [], id: 3 }],
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
      }
      const nodeList = getChildNodes<TestNode, TestNode>(graph)
      expect(nodeList.map((n) => n.id)).to.eql([1, 2, 3, 4, 5, 6])
    })
  })
})
