defmodule Hello do
  use Application

  def start(_type, args) do
    if 1 != 0 do
      IO.puts("Hello World!")
      :timer.sleep(args)
      start(0,args)
    end
  end
end
