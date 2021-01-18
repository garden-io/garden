from flask import Flask, render_template, request, make_response, g
from flask_cors import CORS
from redis import Redis
import os
import socket
import random
import json

option_a = os.getenv('OPTION_A', "Cats")
option_b = os.getenv('OPTION_B', "Dogs")
hostname = socket.gethostname()

app = Flask(__name__)
CORS(app)

def get_redis():
    if not hasattr(g, 'redis'):
        g.redis = Redis(host="redis", db=0, socket_timeout=5)
    return g.redis

@app.route("/api", methods=['GET'])
def hello():
    return app.response_class(
        response="Hello, I am the api service",
        status=200,
    )

@app.route("/api/vote", methods=['POST','GET'])
def vote():
    app.logger.info("received request")

    voter_id = hex(random.getrandbits(64))[2:-1]
    vote = None

    if request.method == 'POST':
        redis = get_redis()
        vote = request.form['vote']
        data = json.dumps({'voter_id': voter_id, 'vote': vote})

        redis.rpush('votes', data)
        print("Registered vote")
        return app.response_class(
            response=json.dumps(data),
            status=200,
            mimetype='application/json'
        )
    else:
        return app.response_class(
            response=json.dumps({}),
            status=404,
            mimetype='application/json'
        )

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=80, debug=True, threaded=True)
