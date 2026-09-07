#!/usr/bin/env python3
"""Serve Twitch grid locally. Run: python3 server.py [port]."""
import http.server
import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f"http://localhost:{port}", flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", port), http.server.SimpleHTTPRequestHandler).serve_forever()
