#!/usr/bin/env python3
"""Serve index.html and proxy zevent.fr/api (no CORS upstream). Run: python3 server.py"""
import http.server, json, os, sys, time, urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
UPSTREAM = "https://zevent.fr/api/"
_cache = {"at": 0, "body": b""}


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.rstrip("/") != "/api":
            return super().do_GET()
        if time.time() - _cache["at"] > 15:  # upstream says max-age=15
            req = urllib.request.Request(UPSTREAM, headers={"User-Agent": "zevent-grid"})
            with urllib.request.urlopen(req, timeout=10) as r:
                _cache.update(at=time.time(), body=r.read())
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(_cache["body"])))
        self.end_headers()
        self.wfile.write(_cache["body"])

    def log_message(self, *a):
        pass


os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f"http://localhost:{PORT}")
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
