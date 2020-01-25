/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useRef } from "react"
import { css } from "emotion"
import { ActionIcon } from "./action-icon"

interface Props {
  value: string
  onCopy: () => void
}

export const CopyActionIcon: React.FC<Props> = ({ value, onCopy }) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  // Just return null if browser doesn't support copying to clipboard
  if (!document.queryCommandSupported("copy")) {
    return null
  }

  const copyToClipboard = () => {
    if (textAreaRef && textAreaRef.current) {
      textAreaRef.current.select()
      document.execCommand("copy")
      onCopy()
    }
  }

  return (
    <>
      <ActionIcon onClick={copyToClipboard} iconClassName="copy" />
      <form>
        <textarea
          className={css`
            position: absolute;
            left: -9999px;
          `}
          ref={textAreaRef}
          readOnly
          value={value}
        />
      </form>
    </>
  )
}
