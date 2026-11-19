"""Download fandom wikitext for a list of page names into <root>/wiki-<comp>/ folders.
Usage: python -I download.py <pages_txt> <root>
pages_txt lines: "<comp_id> <PageName>"
"""
import json, os, re, sys, time, urllib.parse, urllib.request

pages_txt, root = sys.argv[1], sys.argv[2]
done, failed = 0, []
for line in open(pages_txt, encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    comp, page = line.split(" ", 1)
    d = os.path.join(root, f"wiki-{comp}")
    os.makedirs(d, exist_ok=True)
    fn = re.sub(r"[^A-Za-z0-9_]", "_", page) + ".txt"
    path = os.path.join(d, fn)
    if os.path.exists(path):
        done += 1
        continue
    url = ("https://beatbox.fandom.com/api.php?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1&page="
           + urllib.parse.quote(page))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    try:
        data = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
        if "parse" not in data:
            failed.append(f"{comp} {page}: {data.get('error', {}).get('info')}")
            continue
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(data["parse"]["wikitext"])
        done += 1
    except Exception as ex:
        failed.append(f"{comp} {page}: {ex}")
    time.sleep(0.2)
print("downloaded", done)
for f in failed:
    print("FAILED", f)
