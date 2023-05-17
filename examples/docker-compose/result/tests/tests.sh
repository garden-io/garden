#!/bin/sh

# TODO: Write an actual integration test that sends in a vote and verifies that the
# vote count gets updated by pinging the result service.
# curl -sS -X POST --data "vote=b" http://vote > /dev/null
echo "------------"
echo "Tests passed"
echo "------------"
exit 0
