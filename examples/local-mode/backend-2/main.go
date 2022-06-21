package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprint(w, "Hello from 2nd Go!")
}

func main() {
	http.HandleFunc("/hello-backend-2", handler)
	fmt.Println("Server running...")

	err := http.ListenAndServe(":8081", nil)
	if err != nil {
		panic(err)
	}
}
