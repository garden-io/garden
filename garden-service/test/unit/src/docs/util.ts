/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../../src/util/string"
import { expect } from "chai"
import { convertMarkdownLinks } from "../../../../src/docs/common"

describe("convertMarkdownLinks", () => {
  it("should convert all markdown links in the given text to plain links", () => {
    const text = dedent`
    For a full reference, see the [Output configuration context](https://docs.garden.io/reference/template-strings#output-configuration-context) section in the Template String Reference.

    See the [Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.
    `

    expect(convertMarkdownLinks(text)).to.equal(dedent`
    For a full reference, see the Output configuration context (https://docs.garden.io/reference/template-strings#output-configuration-context) section in the Template String Reference.

    See the Configuration Files guide (https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.
    `)
  })
})
