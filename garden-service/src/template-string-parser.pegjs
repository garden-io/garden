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
  / $(.*) { return text() === "" ? [] : [text()] }

FormatString
  = FormatStart v:Literal FormatEnd {
      return v
  }
  / FormatStart v:Key FormatEnd {
      return options.getKey(v)
  }
  / FormatStart head:LiteralOrKey tail:(Or LiteralOrKey)* FormatEnd {
      const keys = [head, ...tail.map(t => t[1])]

      // Resolve all the keys
      return Promise.all(keys.map(key =>
        options.lodash.isArray(key) ? options.getKey(key, { allowUndefined: true }) : key,
      ))
        .then(candidates => {
          // Return the first non-undefined value
          for (const value of candidates) {
            if (value !== undefined) {
              return value
            }
          }

          throw new options.ConfigurationError("None of the keys could be resolved in the conditional: " + text())
        })
    }

LiteralOrKey
  = Literal
  / Key

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

Prefix
  = !FormatStart (. ! FormatStart)* . { return text() }

Suffix
  = !FormatEnd (. ! FormatEnd)* . { return text() }

// Much of the below is based on https://github.com/pegjs/pegjs/blob/master/examples/json.pegjs
ws "whitespace" = [ \t\n\r]*

// ----- Literals -----

Literal
  = BooleanLiteral
  / NullLiteral
  / NumberLiteral
  / StringLiteral

BooleanLiteral
  = ws "true" ws { return true }
  / ws "false" ws { return false }

NullLiteral
  = ws "null" ws { return null }

NumberLiteral
  = ws Minus? Int Frac? Exp? ws { return parseFloat(text()); }

DecimalPoint
  = "."

Digit1_9
  = [1-9]

E
  = [eE]

Exp
  = E (Minus / Plus)? DIGIT+

Frac
  = DecimalPoint DIGIT+

Int
  = Zero / (Digit1_9 DIGIT*)

Minus
  = "-"

Plus
  = "+"

Zero
  = "0"

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

// ----- Core ABNF Rules -----

// See RFC 4234, Appendix B (http://tools.ietf.org/html/rfc4234).
DIGIT  = [0-9]
HEXDIG = [0-9a-f]i
