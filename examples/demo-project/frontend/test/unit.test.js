function printToConsoleInDifferentWays() {
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

  console.log(genereateLongText())
}

function genereateLongText() {
  let text = "long boyy"
  for (let i = 0; i < 100; i++) {
    text += "\n longer boyy" + i
  }
  return text
}

describe("all my lovely tests", async () => {
  describe("fails", () => {
    test('throw exception fail test case', () => {
      printToConsoleInDifferentWays()
      throw new Error("stuff is broken bro")
    })

    test('fail test case', () => {
      printToConsoleInDifferentWays()
      expect(sum(1, 2)).toBe(4);
    });
  })

  describe("success", () => {
    test('only log', () => {
      printToConsoleInDifferentWays()
      throw new Error("stuff is broken bro")
    })

    test('success test case', () => {
      printToConsoleInDifferentWays()
      expect(sum(1, 2)).toBe(3);
    });
  })


  describe("async", async () => {
    async function asyncLog() {
      return new Promise(resolve => {
        setTimeout(() => {
          printToConsoleInDifferentWays()
          resolve('resolved');
        }, 200);
      });
    }
    test('only log throw', async () => {
      await asyncLog()
      throw new Error("stuff is broken bro")
    })

    test('only log throw, but no await', async () => {
      asyncLog()
      throw new Error("stuff is broken bro")
    })

    test('success test case', async () => {
      await asyncLog()
      expect(sum(1, 2)).toBe(3);
      await asyncLog()
    });
  })
})
