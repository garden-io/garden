package hello;

public class HelloWorld {
  public static void main(String[] args) {
    Greeter greeter = new Greeter();
      System.out.println(greeter.sayHello());
      // try {
      //   System.out.println(execCmd("date +%s%N"));
      // } catch (Exception ex) {
      //   ex.printStackTrace();
      // }

    //  while (true) {
    //   try {
    //     Thread.sleep(Long.MAX_VALUE);
    //   } catch(InterruptedException ex) {
    //     Thread.currentThread().interrupt();
    //   }
    // }
  }

  public static String execCmd(String cmd) throws java.io.IOException {
    java.util.Scanner s = new java.util.Scanner(Runtime.getRuntime().exec(cmd).getInputStream()).useDelimiter("\\A");
    return s.hasNext() ? s.next() : "";
  }
}
