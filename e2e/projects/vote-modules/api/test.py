import requests
import unittest
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

retry_strategy = Retry(
    total=10,
    connect=10,
    backoff_factor=0.3,
    status_forcelist=[429, 500, 502, 503, 504],
    method_whitelist=["HEAD", "GET", "OPTIONS", "POST"]
)
adapter = HTTPAdapter(max_retries=retry_strategy)

class IntegTest(unittest.TestCase):
    def test_post(self):
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Access-Control-Allow-Origin': '*',
        }
        http = requests.Session()
        http.mount("http://", adapter)

        response = http.post("http://api/api/vote", headers=headers, data="vote=a")
        self.assertEqual(response.status_code, 200)

if __name__ == '__main__':
    unittest.main()
