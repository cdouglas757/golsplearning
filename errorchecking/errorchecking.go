package main

import (
	"fmt"
	"log"
	"strconv"
)

func main() {
	i, err := strconv.Atoi("-50")
	s, errS := strconv.Atoi("-75")

	if errS != nil {
		log.Fatal(errS)
	}

	fmt.Print(err)
	fmt.Print(errS)
	fmt.Print(s)
	fmt.Print(i)
}
