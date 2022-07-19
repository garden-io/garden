console.error("Error to console")
console.log("Log to console")
console.info("info to console")
console.warn("warn to console")
console.trace("trace to console")
console.debug("debug to console")
console.group("new group")
  console.error("Error to console")
  console.log("Log to console")
  console.info("info to console")
console.groupEnd()
console.groupCollapsed("collapsed group")
  console.error("Error to console")
  console.log("Log to console")
  console.info("info to console")
console.groupEnd()
console.table(["apples", "oranges", "bananas"]);
console.timeStamp("timestamp")
console.dir({hey: "I am", cool: true})
console.time("my timer")
console.timeLog("my timer", "time things")
console.timeEnd("my timer")

process.stdout.write("This line should NOT be visible");
process.stdout.clearLine(0);
process.stdout.cursorTo(0);
process.stdout.write("\n"); // end the line
process.stdout.write("This line SHOULD be visible\n");

console.log('\x1b[36m%s\x1b[0m', 'I am cyan');  //cyan
console.log('\x1b[33m%s\x1b[0m', "stringToMakeYellow");  //yellow


