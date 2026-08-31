import urllib.request
import urllib.parse
import json
import time

BASE_URL = "https://heatshield-pkue.onrender.com"

def test_endpoint(name, path, method="GET", body=None, headers=None):
    url = f"{BASE_URL}{path}"
    print(f"\n--- Testing [{method}] {path} ---")
    req = urllib.request.Request(url, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if body:
        data = json.dumps(body).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    else:
        data = None

    start_time = time.time()
    try:
        with urllib.request.urlopen(req, data=data, timeout=15) as response:
            elapsed = time.time() - start_time
            status = response.status
            res_body = response.read().decode('utf-8')
            print(f"STATUS: {status} ({elapsed:.2f}s)")
            try:
                parsed = json.loads(res_body)
                print("RESPONSE JSON:", json.dumps(parsed, indent=2)[:500])
            except Exception:
                print("RESPONSE TEXT:", res_body[:300])
            return True, status, res_body
    except urllib.error.HTTPError as e:
        elapsed = time.time() - start_time
        res_body = e.read().decode('utf-8')
        print(f"HTTP ERROR: {e.code} ({elapsed:.2f}s)")
        print("ERROR BODY:", res_body[:500])
        return False, e.code, res_body
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"FAILED: {e} ({elapsed:.2f}s)")
        return False, 0, str(e)

if __name__ == "__main__":
    print(f"Starting test against {BASE_URL}")
    test_endpoint("Root", "/")
    test_endpoint("Heat Risk (NYC)", "/api/heat-risk?lat=40.7128&lon=-74.0060")
    test_endpoint("Heat Risk (Cairo)", "/api/heat-risk?lat=30.0444&lon=31.2357")
    test_endpoint("Nearby Safer", "/api/nearby-safer?lat=40.7128&lon=-74.0060&radius_m=300")
    test_endpoint("Heatmap", "/api/heatmap?lat=40.7128&lon=-74.0060")
    
    # Auth tests
    test_user = {"email": f"test_{int(time.time())}@example.com", "password": "password123", "name": "Test User"}
    reg_ok, status, body = test_endpoint("Register", "/api/auth/register", method="POST", body=test_user)
    
    token = None
    if reg_ok:
        try:
            token = json.loads(body).get("token")
        except:
            pass
            
    if not token:
        login_ok, status, body = test_endpoint("Login", "/api/auth/login", method="POST", body={"email": test_user["email"], "password": test_user["password"]})
        if login_ok:
            try:
                token = json.loads(body).get("token")
            except:
                pass
                
    if token:
        auth_headers = {"Authorization": f"Bearer {token}"}
        test_endpoint("Auth Me", "/api/auth/me", headers=auth_headers)
        test_endpoint("Get Saved Locations", "/api/user/saved-locations", headers=auth_headers)
        test_endpoint("Add Saved Location", "/api/user/saved-locations", method="POST", headers=auth_headers, body={"name": "Home", "lat": 40.7128, "lon": -74.0060})
