package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprint(w, "Hello from 1st Go!")
}

func main() {
	http.HandleFunc("/hello-backend-1", handler)
	fmt.Println("Server running at port 8080...")
	err1 := http.ListenAndServe(":8080", nil)
	if err1 != nil {
		panic(err1)
	}

	fmt.Println("Server running at port 8000...")
  err2 := http.ListenAndServe(":8000", nil)
  if err2 != nil {
  	panic(err2)
  }
}
