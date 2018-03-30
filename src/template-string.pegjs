TemplateString
  = a:(FormatString)+ b:TemplateString? { return [...a, ...(b || [])] }
  / a:Prefix b:(FormatString)+ c:TemplateString? { return [a, ...b, ...(c || [])] }
  / InvalidFormatString
  / $(.*) { return [text()] }

NestedTemplateString
  = a:(FormatString)+ b:NestedTemplateString? { return [...a, ...(b || [])] }
  / a:Prefix b:(FormatString)+ c:NestedTemplateString? { return [a, ...b, ...(c || [])] }
  / InvalidFormatString
  / Suffix { return [text()] }

FormatString
  = FormatStart head:Identifier tail:(KeySeparator Identifier)* FormatEnd {
      const parts = [["", head]].concat(tail).map(p => p[1])
      return options.getKey(parts)
  }
  / FormatStart s:NestedTemplateString FormatEnd {
      return options.resolve(s)
  }

InvalidFormatString
  = Prefix? FormatStart .* {
  	throw new options.TemplateStringError("Invalid template string: ..." + text())
  }

FormatStart
  = "${"

FormatEnd
  = "}"

Identifier
  = [a-zA-Z][a-zA-Z0-9_\-]* { return text() }

KeySeparator
  = "."

Prefix
  = !FormatStart (. ! FormatStart)* . { return text() }

Suffix
  = !FormatEnd (. ! FormatEnd)* . { return text() }
