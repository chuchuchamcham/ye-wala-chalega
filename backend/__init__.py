"""Drishti backend.

Set before any submodule imports Ultralytics: by default that library
probes the internet and sends anonymous usage statistics to Google
Analytics whenever YOLO loads. scripts/network_check.py caught it doing so
from the server. Nothing sensitive goes in those statistics, but a border
post's surveillance system should open no connection its operator did not
ask for, so it is switched off here, for every way Drishti is started.
"""
import os

os.environ.setdefault("YOLO_OFFLINE", "True")
