/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

TemplateString
  = a:(FormatString)+ b:TemplateString? { return [...a, ...(b || [])] }
  / a:Prefix b:(FormatString)+ c:TemplateString? { return [a, ...b, ...(c || [])] }
  / InvalidFormatString
  / $(.*) { return [text()] }

NestedTemplateString
  = a:(FormatString)+ b:NestedTemplateString? {
    return [...a, ...(b || [])]
  }
  / a:Prefix b:(FormatString)+ c:NestedTemplateString? {
    return [a, ...b, ...(c || [])]
  }
  / InvalidFormatString
  / Suffix { return [text()] }

FormatString
  = FormatStart key:Key FormatEnd {
      return options.getKey(key)
  }
  / FormatStart a:Key Or b:Key FormatEnd {
      return options.resolve(a, { allowUndefined: true })
        .then(result => {
          return result || options.resolve(b, { allowUndefined: false })
        })
  }
  / FormatStart a:Key Or b:StringLiteral FormatEnd {
      return options.resolve(a, { allowUndefined: true })
        .then(result => {
          return result || b
        })
  }
  // These would be odd in configuration, but there's no reason to throw if it comes up.
  / FormatStart a:StringLiteral Or b:StringLiteral FormatEnd {
      return a
  }
  / FormatStart a:StringLiteral FormatEnd {
      return a
  }
  / FormatStart s:NestedTemplateString FormatEnd {
      return options.resolve(s)
  }

InvalidFormatString
  = Prefix? FormatStart .* {
  	throw new options.TemplateStringError("Invalid template string: " + text())
  }

FormatStart
  = ws "${" ws

FormatEnd
  = ws "}" ws

Identifier
  = [a-zA-Z][a-zA-Z0-9_\-]* { return text() }

KeySeparator
  = "."

Key
  = head:Identifier tail:(KeySeparator Identifier)* {
    return [["", head]].concat(tail).map(p => p[1])
  }

Or
  = ws "||" ws

// Some of the below is based on https://github.com/pegjs/pegjs/blob/master/examples/json.pegjs
ws "whitespace" = [ \t\n\r]*

StringLiteral
  = ws '"' chars:DoubleQuotedChar* '"' ws { return chars.join(""); }
  / ws "'" chars:SingleQuotedChar* "'" ws { return chars.join(""); }

Escape
  = "\\"

DoubleQuotedChar
  = [^\0-\x1F\x22\x5C]
  / Escape
    sequence:(
        '"'
      / "\\"
      / "/"
      / "b" { return "\b"; }
      / "f" { return "\f"; }
      / "n" { return "\n"; }
      / "r" { return "\r"; }
      / "t" { return "\t"; }
      / "u" digits:$(HEXDIG HEXDIG HEXDIG HEXDIG) {
          return String.fromCharCode(parseInt(digits, 16));
        }
    )
    { return sequence; }

SingleQuotedChar
  = [^\0-\x1F\x27\x5C]
  / Escape
    sequence:(
        "'"
      / "\\"
      / "/"
      / "b" { return "\b"; }
      / "f" { return "\f"; }
      / "n" { return "\n"; }
      / "r" { return "\r"; }
      / "t" { return "\t"; }
      / "u" digits:$(HEXDIG HEXDIG HEXDIG HEXDIG) {
          return String.fromCharCode(parseInt(digits, 16));
        }
    )
    { return sequence; }

Prefix
  = !FormatStart (. ! FormatStart)* . { return text() }

Suffix
  = !FormatEnd (. ! FormatEnd)* . { return text() }

// ----- Core ABNF Rules -----

// See RFC 4234, Appendix B (http://tools.ietf.org/html/rfc4234).
DIGIT  = [0-9]
HEXDIG = [0-9a-f]i
