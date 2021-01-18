import requests
import unittest

class IntegTest(unittest.TestCase):
    def test_post(self):
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Access-Control-Allow-Origin': '*',
        }
        response = requests.post("http://api/api/vote", headers=headers, data="vote=a")
        self.assertEqual(response.status_code, 200)

if __name__ == '__main__':
    unittest.main()
