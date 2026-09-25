#!/usr/bin/env python3
"""Engage Island - local preview server (alternative to serve.mjs).

Serves the built game in ./game with Python 3's standard library only.

    python3 serve.py            this Mac only (127.0.0.1)
    python3 serve.py --lan      also other devices on the same Wi-Fi
    python3 serve.py --port 9000

Stop it with Control-C in the Terminal window it is running in.
"""
import argparse
import functools
import http.server
import os
import socket
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "game")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".webp": "image/webp",
        ".wav": "audio/wav",
        ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass  # quiet


def lan_addresses():
    """Best-effort: the address this Mac uses on the local network."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # no packet is sent for UDP connect
        addr = s.getsockname()[0]
        s.close()
        return [] if addr.startswith("127.") else [addr]
    except OSError:
        return []


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--lan", action="store_true")
    p.add_argument("--port", type=int, default=8089)
    a = p.parse_args()
    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        sys.exit(f"Can't find the game files next to this script (expected {ROOT}).")
    host = "0.0.0.0" if a.lan else "127.0.0.1"
    handler = functools.partial(Handler, directory=ROOT)
    try:
        httpd = http.server.ThreadingHTTPServer((host, a.port), handler)
    except OSError:
        sys.exit(f"Port {a.port} is already in use. Try: python3 serve.py --port {a.port + 1}")
    print("\n  Engage Island preview is running.\n")
    print(f"  On this Mac, open:   http://127.0.0.1:{a.port}/start.html")
    if a.lan:
        addrs = lan_addresses()
        print("")
        if addrs:
            print("  On an iPad or phone on the SAME Wi-Fi, open:")
            for ip in addrs:
                print(f"      http://{ip}:{a.port}/start.html")
        else:
            print("  No Wi-Fi/LAN address found on this Mac.")
        print("  (Anyone on this Wi-Fi can open it while this window is running.)")
    print("\n  To stop: press Control-C in this window.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
