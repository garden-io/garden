from flask import Flask, render_template, request, make_response, g
from flask_cors import CORS
import os
import socket
import random
import json
import logging
import psycopg2

import sys
import time

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

option_a = os.getenv('OPTION_A', "Cats")
option_b = os.getenv('OPTION_B', "Dogs")
db_hostname = 'postgres'
db_database = os.getenv('PGDATABASE')
db_password = os.getenv('PGPASSWORD')
db_user = os.getenv('PGUSER')
hostname = socket.gethostname()

app = Flask(__name__)
CORS(app)

print("Starting API")

@app.route("/health", methods=['GET'])
def health():
    return app.response_class(
        status=200,
    )

@app.route("/api", methods=['GET'])
def hello():
    return app.response_class(
        response="Hello, I am the api service",
        status=200,
    )

@app.route("/api/vote", methods=['GET'])
def get_votes():
    print("Getting votes")

    conn = psycopg2.connect( host=db_hostname, user=db_user, password=db_password, dbname=db_database)
    cur = conn.cursor()
    cur.execute("SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote")
    res = cur.fetchall()
    cur.close()
    conn.close()
    
    return app.response_class(
        response=json.dumps(res),
        status=200,
        mimetype='application/json'
    )

@app.route("/api/vote", methods=['POST'])
def post_vote():
    voter_id = hex(random.getrandbits(64))[2:-1]
    vote = None

    if request.method == 'POST':
        vote = request.form['vote']
        data = json.dumps({'voter_id': voter_id, 'vote': vote})
        print("received vote request for '%s' from voter id: '%s'" % (vote, voter_id))
        sys.stdout.flush()

        conn = psycopg2.connect( host=db_hostname, user=db_user, password=db_password, dbname=db_database)
        query = "INSERT INTO votes (id, vote, created_at) VALUES (%s, %s, NOW())"
        queryParams = (voter_id, vote)
        cur = conn.cursor()
        cur.execute(query, queryParams)
        conn.commit()
        cur.close()
        conn.close()

        return app.response_class(
            response=json.dumps(data),
            status=200,
            mimetype='application/json'
        )
    else:
        print("received invalid request")
        sys.stdout.flush()
        return app.response_class(
            response=json.dumps({}),
            status=404,
            mimetype='application/json'
        )

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True, threaded=True)
