package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
fmt.Println("Incoming request")
	fmt.Fprint(w, "Hello from Dockerized Go!")
}

func main() {
	http.HandleFunc("/hello-backend", handler)
	fmt.Println("Server running at port 8080...")

	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}
