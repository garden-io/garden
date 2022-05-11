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
	fmt.Println("Server running...")

	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}
