"""Runs every browser test file. Usage: python3 tests/e2e/run_all.py [name-filter]"""
import sys, os, importlib
sys.path.insert(0, os.path.dirname(__file__))
import harness
from playwright.sync_api import sync_playwright

flt = sys.argv[1] if len(sys.argv) > 1 else ''
for mod in sorted(f[:-3] for f in os.listdir(os.path.dirname(__file__)) if f.startswith('test_') and f.endswith('.py')):
    importlib.import_module(mod)
harness.RESULTS[:] = [f for f in harness.RESULTS if flt in f.__name__ or flt in f.__module__]
srv, base = harness.serve()
with sync_playwright() as pw:
    failed = harness.run(pw, base)
print('%d passed, %d failed' % (len(harness.RESULTS) - failed, failed))
sys.exit(1 if failed else 0)
