package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Incoming request")
	fmt.Fprint(w, "Hello from 1st local Go!")
}

func main() {
	http.HandleFunc("/hello-backend-1", handler)
	fmt.Println("Server running at port 8090...")
	err1 := http.ListenAndServe(":8090", nil)
	if err1 != nil {
		panic(err1)
	}

	fmt.Println("Server running at port 8000...")
  err2 := http.ListenAndServe(":8000", nil)
  if err2 != nil {
  	panic(err2)
  }
}
