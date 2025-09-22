---
order: 0
title: Template Helper Functions
---

# Template Helper Functions

These are all the helper functions available in template strings, and some usage examples for each.

## base64Decode

Decodes the given base64-encoded string.

Usage: `base64Decode(string)`

Examples:

* `${base64Decode("bXkgdmFsdWU=")}` -> `"my value"`

## base64Encode

Encodes the given string as base64.

Usage: `base64Encode(string)`

Examples:

* `${base64Encode("my value")}` -> `"bXkgdmFsdWU="`

## camelCase

Converts the given string to a valid camelCase identifier, changing the casing and removing characters as necessary.

Usage: `camelCase(string)`

Examples:

* `${camelCase("Foo Bar")}` -> `"fooBar"`
* `${camelCase("--foo-bar--")}` -> `"fooBar"`
* `${camelCase("__FOO_BAR__")}` -> `"fooBar"`

## concat

Concatenates two arrays or strings.

Usage: `concat(arg1, arg2)`

Examples:

* `${concat(["first","two"], ["second","list"])}` -> `["first","two","second","list"]`
* `${concat([1,2,3], [4,5])}` -> `[1,2,3,4,5]`
* `${concat("string1", "string2")}` -> `"string1string2"`

## formatDateUtc

Formats the given date using the specified format. The input date is always converted to the UTC time zone before the modification. If no explicit timezone is specified on the input date, then the system default one will be used. The output date is always returned in the UTC time zone too.

Usage: `formatDateUtc(date, format)`

Examples:

* `${formatDateUtc("2021-01-01T00:00:00Z", "yyyy-MM-dd")}` -> `"2021-01-01"`
* `${formatDateUtc("2021-01-01T00:00:00+0200", "yyyy-MM-dd")}` -> `"2020-12-31"`
* `${formatDateUtc("2021-01-01T00:00:00Z", "yyyy-MM-dd HH:mm:ss")}` -> `"2021-01-01 00:00:00"`
* `${formatDateUtc("2021-01-01T00:00:00+0200", "yyyy-MM-dd HH:mm:ss")}` -> `"2020-12-31 22:00:00"`

## indent

Indents each line in the given string with the specified number of spaces.

Usage: `indent(string, spaces)`

Examples:

* `${indent("some: multiline\nyaml: document", 2)}` -> `"  some: multiline\n  yaml: document"`
* `${indent("My\nblock\nof\ntext", 4)}` -> `"    My\n    block\n    of\n    text"`

## isEmpty

Returns true if the given value is an empty string, object, array, null or undefined.

Usage: `isEmpty([value])`

Examples:

* `${isEmpty({})}` -> `true`
* `${isEmpty({"not":"empty"})}` -> `false`
* `${isEmpty([])}` -> `true`
* `${isEmpty([1,2,3])}` -> `false`
* `${isEmpty("")}` -> `true`
* `${isEmpty("not empty")}` -> `false`
* `${isEmpty(null)}` -> `true`

## join

Takes an array of strings (or other primitives) and concatenates them into a string, with the given separator

Usage: `join(input, separator)`

Examples:

* `${join(["some","list","of","strings"], " ")}` -> `"some list of strings"`
* `${join(["some","list","of","strings"], ".")}` -> `"some.list.of.strings"`

## jsonDecode

Decodes the given JSON-encoded string.

Usage: `jsonDecode(string)`

Examples:

* `${jsonDecode("{\"foo\": \"bar\"}")}` -> `{"foo":"bar"}`
* `${jsonDecode("\"JSON encoded string\"")}` -> `"JSON encoded string"`
* `${jsonDecode("[\"my\", \"json\", \"array\"]")}` -> `["my","json","array"]`

## jsonEncode

Encodes the given value as JSON.

Usage: `jsonEncode(value)`

Examples:

* `${jsonEncode(["some","array"])}` -> `"[\"some\",\"array\"]"`
* `${jsonEncode({"some":"object"})}` -> `"{\"some\":\"object\"}"`

## kebabCase

Converts the given string to a valid kebab-case identifier, changing to all lowercase and removing characters as necessary.

Usage: `kebabCase(string)`

Examples:

* `${kebabCase("Foo Bar")}` -> `"foo-bar"`
* `${kebabCase("fooBar")}` -> `"foo-bar"`
* `${kebabCase("__FOO_BAR__")}` -> `"foo-bar"`

## lower

Convert the given string to all lowercase.

Usage: `lower(string)`

Examples:

* `${lower("Some String")}` -> `"some string"`

## modifyDateUtc

Modifies the date by setting the specified amount of time units. The input date is always converted to the UTC time zone before the modification. If no explicit timezone is specified on the input date, then the system default one will be used. The output date is always returned in the UTC time zone too.

Usage: `modifyDateUtc(date, amount, unit)`

Examples:

* `${modifyDateUtc("2021-01-01T00:00:00.234Z", 345, "milliseconds")}` -> `"2021-01-01T00:00:00.345Z"`
* `${modifyDateUtc("2021-01-01T00:00:05Z", 30, "seconds")}` -> `"2021-01-01T00:00:30.000Z"`
* `${modifyDateUtc("2021-01-01T00:01:00Z", 15, "minutes")}` -> `"2021-01-01T00:15:00.000Z"`
* `${modifyDateUtc("2021-01-01T12:00:00Z", 11, "hours")}` -> `"2021-01-01T11:00:00.000Z"`
* `${modifyDateUtc("2021-01-01T10:00:00+0200", 11, "hours")}` -> `"2021-01-01T11:00:00.000Z"`
* `${modifyDateUtc("2021-01-31T00:00:00Z", 1, "days")}` -> `"2021-01-01T00:00:00.000Z"`
* `${modifyDateUtc("2021-03-01T00:00:00Z", 0, "months")}` -> `"2021-01-01T00:00:00.000Z"`
* `${modifyDateUtc("2021-01-01T00:00:00Z", 2024, "years")}` -> `"2024-01-01T00:00:00.000Z"`

## range

Generates a list of numbers in the specified range (inclusively).

Usage: `range(first, last)`

Examples:

* `${range(1, 5)}` -> `[1,2,3,4,5]`

## replace

Replaces all occurrences of a given substring in a string.

Usage: `replace(string, substring, replacement)`

Examples:

* `${replace("string_with_underscores", "_", "-")}` -> `"string-with-underscores"`
* `${replace("remove.these.dots", ".", "")}` -> `"removethesedots"`

## sha256

Creates a SHA256 hash of the provided string.

Usage: `sha256(string)`

Examples:

* `${sha256("Some String")}` -> `"7f0fd64653ba0bb1a579ced2b6bf375e916cc60662109ee0c0b24f0a750c3a6c"`

## shiftDateUtc

Shifts the date by the specified amount of time units. The input date is always converted to the UTC time zone before the modification. If no explicit timezone is specified on the input date, then the system default one will be used. The output date is always returned in the UTC time zone too.

Usage: `shiftDateUtc(date, amount, unit)`

Examples:

* `${shiftDateUtc("2021-01-01T00:00:00Z", 1, "seconds")}` -> `"2021-01-01T00:00:01.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", -1, "seconds")}` -> `"2020-12-31T23:59:59.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", 1, "minutes")}` -> `"2021-01-01T00:01:00.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", -1, "minutes")}` -> `"2020-12-31T23:59:00.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", 1, "hours")}` -> `"2021-01-01T01:00:00.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", -1, "hours")}` -> `"2020-12-31T23:00:00.000Z"`
* `${shiftDateUtc("2021-01-01T10:00:00+0200", 1, "hours")}` -> `"2021-01-01T09:00:00.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", 1, "days")}` -> `"2021-01-02T00:00:00.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", -1, "days")}` -> `"2020-12-31T00:00:00.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", 1, "months")}` -> `"2021-02-01T00:00:00.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", -1, "months")}` -> `"2020-12-01T00:00:00.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", 1, "years")}` -> `"2022-01-01T00:00:00.000Z"`
* `${shiftDateUtc("2021-01-01T00:00:00Z", -1, "years")}` -> `"2020-01-01T00:00:00.000Z"`

## slice

Slices a string or array at the specified start/end offsets. Note that you can use a negative number for the end offset to count backwards from the end.

Usage: `slice(input, start, [end])`

Examples:

* `${slice("ThisIsALongStringThatINeedAPartOf", 11, -7)}` -> `"StringThatINeed"`
* `${slice(".foo", 1)}` -> `"foo"`

## split

Splits the given string by a substring (e.g. a comma, colon etc.).

Usage: `split(string, separator)`

Examples:

* `${split("a,b,c", ",")}` -> `["a","b","c"]`
* `${split("1:2:3:4", ":")}` -> `["1","2","3","4"]`

## string

Converts the given value to a string.

Usage: `string(value)`

Examples:

* `${string(1)}` -> `"1"`
* `${string(true)}` -> `"true"`

## trim

Trims whitespace (or other specified characters) off the ends of the given string.

Usage: `trim(string, [characters])`

Examples:

* `${trim("   some string with surrounding whitespace ")}` -> `"some string with surrounding whitespace"`

## upper

Converts the given string to all uppercase.

Usage: `upper(string)`

Examples:

* `${upper("Some String")}` -> `"SOME STRING"`

## uuidv4

Generates a random v4 UUID.

Usage: `uuidv4()`

Examples:

* `${uuidv4()}` -> `"1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"`

## yamlDecode

Decodes the given YAML-encoded string. Note that for multi-document YAML strings, you need to set the 2nd argument to true (see below).

Usage: `yamlDecode(string, [multiDocument])`

Examples:

* `${yamlDecode("a: 1\nb: 2\n")}` -> `{"a":1,"b":2}`
* `${yamlDecode("a: 1\nb: 2\n---\na: 3\nb: 4\n", true)}` -> `[{"a":1,"b":2},{"a":3,"b":4}]`

## yamlEncode

Encodes the given value as YAML.

Usage: `yamlEncode(value, [multiDocument])`

Examples:

* `${yamlEncode({"my":"simple document"})}` -> `"my: simple document\n"`
* `${yamlEncode([{"a":1,"b":2},{"a":3,"b":4}], true)}` -> `"---a: 1\nb: 2\n---a: 3\nb: 4\n"`

