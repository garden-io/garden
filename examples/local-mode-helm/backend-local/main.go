package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Incoming request")
	fmt.Fprint(w, "Hello from Local Go!")
}

func main() {
	http.HandleFunc("/hello-backend", handler)
	fmt.Println("Server running at port 8090...")

	err := http.ListenAndServe(":8090", nil)
	if err != nil {
		panic(err)
	}
}
