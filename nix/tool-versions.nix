let
  splitStr = splitOn: str: builtins.filter (l: l != [ ] && l != "") (builtins.split splitOn str);
  toolVersionsFile = builtins.readFile ../.tool-versions;
  lines = splitStr "\n" toolVersionsFile;
  pairs = map (splitStr " ") lines;
  versions = map (ps: {
    name = builtins.elemAt ps 0;
    value = builtins.elemAt ps 1;
  }) pairs;
in
builtins.listToAttrs versions
