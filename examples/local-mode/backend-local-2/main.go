package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Incoming request")
	fmt.Fprint(w, "Hello from 2nd local Go!")
}

func main() {
	http.HandleFunc("/hello-backend-2", handler)
	fmt.Println("Server running at port 8091...")

	http.ListenAndServe(":8091", nil)
}
