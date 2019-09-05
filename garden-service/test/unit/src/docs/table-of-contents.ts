import { expect } from "chai"
import { generateTableOfContents } from "../../../../src/docs/table-of-contents"
import { getDataDir } from "../../../helpers"
import dedent = require("dedent")

describe("table of contents", () => {
  it("should return a correctly ordered table of contents", async () => {
    const testDocsDir = getDataDir("test-table-of-contents")
    const output = generateTableOfContents(testDocsDir)
    expect(output).to.eql(dedent`
      # Table of Contents

      * [Directory 3](./3/README.md)
      * [Directory 2](./2/README.md)
      * [Directory 1](./1/README.md)
      * [Directory 4](./4/README.md)
        * [This goes first.](./4/2.md)
        * [This goes second.](./4/1.md)
        * [I have a title but no order.](./4/b.md)
        * [I too have a title but no order.](./4/a.md)
        * [x-something.md](./4/x-something.md)
        * [y-something.md](./4/y-something.md)\n

    `)
  })
})
