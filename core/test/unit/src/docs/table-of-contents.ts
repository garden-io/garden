/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { generateTableOfContents } from "../../../../src/docs/table-of-contents.js"
import { getDataDir } from "../../../helpers.js"
import dedent from "dedent"

describe("table of contents", () => {
  it("should return a correctly ordered table of contents", async () => {
    const testDocsDir = getDataDir("test-table-of-contents")
    const output = generateTableOfContents(testDocsDir)

    expect(output.trim()).to.eql(dedent`
      # Table of Contents

      * [Welcome to Garden!](welcome.md)

      ## Directory 3


      ## Directory 2


      ## Directory 1


      ## Directory 4

      * [This goes first.](./4/2.md)
      * [This goes second.](./4/1.md)
      * [I have a title but no order.](./4/b.md)
      * [I too have a title but no order.](./4/a.md)
      * [X Something.md](./4/x-something.md)
      * [Y Something.md](./4/y-something.md)
    `)
  })
})
