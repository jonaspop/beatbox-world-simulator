"""Clean fandom wikitext into compact readable text + extract bracket templates.
Usage: python -I clean_wiki.py <in_dir> <out_dir>
"""
import sys as _s; _s.stdout.reconfigure(encoding='utf-8')
import json, os, re, sys

DROP_HEADINGS = re.compile(r"(used tracks|judge votes|gallery|references|prizes|numbers? of participants|showcases|trivia|history|judge ranking|videos)", re.I)


def split_templates(text, start):
    """Return (template_body, end_index) for {{...}} starting at start."""
    depth = 0
    i = start
    while i < len(text):
        if text.startswith("{{", i):
            depth += 1
            i += 2
            continue
        if text.startswith("}}", i):
            depth -= 1
            i += 2
            if depth == 0:
                return text[start + 2 : i - 2], i
            continue
        i += 1
    return text[start + 2 :], len(text)


def simplify(s):
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\{\{\s*[Ff]lag\s*\|\s*code\s*=\s*([a-zA-Z\-]+)\s*\}\}", lambda m: "[" + m.group(1).lower() + "]", s)
    s = re.sub(r"\{\{-\}\}", "-", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", s)
    s = re.sub(r"https?://\S+", "", s)
    s = re.sub(r"</?(small|br|s|center|span|div|sup)[^>]*>", " ", s)
    s = s.replace("'''", "**").replace("''", "")
    return s


def bracket_params(body):
    # split top-level pipes
    parts, depth, cur = [], 0, ""
    i = 0
    while i < len(body):
        if body.startswith("{{", i) or body.startswith("[[", i):
            depth += 1; cur += body[i:i+2]; i += 2; continue
        if body.startswith("}}", i) or body.startswith("]]", i):
            depth -= 1; cur += body[i:i+2]; i += 2; continue
        if body[i] == "|" and depth == 0:
            parts.append(cur); cur = ""; i += 1; continue
        cur += body[i]; i += 1
    parts.append(cur)
    name = parts[0].strip()
    params = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.strip()] = simplify(v).strip()
    return name, params


def clean(text):
    brackets = []
    out = []
    i = 0
    # replace bracket templates with placeholders
    res = ""
    while True:
        m = re.search(r"\{\{\s*[^|}]*[Bb]racket", text[i:])
        if not m:
            res += text[i:]
            break
        s = i + m.start()
        res += text[i:s]
        body, e = split_templates(text, s)
        name, params = bracket_params(body)
        brackets.append({"template": name, "params": params})
        res += f"\n[[BRACKET #{len(brackets)-1} {name}]]\n"
        i = e
    text = simplify(res)
    # drop unwanted sections
    lines = text.split("\n")
    keep, drop_level = [], None
    for ln in lines:
        h = re.match(r"^(=+)\s*(.*?)\s*=+\s*$", ln)
        if h:
            level = len(h.group(1))
            if drop_level is not None and level <= drop_level:
                drop_level = None
            if drop_level is None and DROP_HEADINGS.search(h.group(2)):
                drop_level = level
                continue
        if drop_level is None or ln.strip().startswith("[[BRACKET") or ln.strip().startswith("BRACKET #"):
            keep.append(ln)
    # drop collapsible "Used Tracks"/"Judge Votes" tables inside kept sections
    txt = "\n".join(keep)
    txt = re.sub(r"\{\|[^\n]*\n\|\+\s*(Used Tracks|Judge Votes|Judge Ranking|Battles)?\s*\n(?:(?!\n\|\}).)*?\n\|\}", lambda m: "" if m.group(1) else m.group(0), txt, flags=re.S)
    # compact tables: rows to "a | b | c"
    rows, cur = [], []
    for ln in txt.split("\n"):
        t = ln.strip()
        if t.startswith("{|"):
            rows.append("<table>"); cur = []; continue
        if t.startswith("|}"):
            if cur: rows.append("  " + " | ".join(cur))
            rows.append("</table>"); cur = []; continue
        if t.startswith("|-"):
            if cur: rows.append("  " + " | ".join(cur))
            cur = []; continue
        if t.startswith("|+"):
            rows.append("  caption: " + t[2:].strip()); continue
        if t.startswith("!") or (t.startswith("|") and not t.startswith("||")):
            cells = re.split(r"\s*(?:\|\||!!)\s*", t[1:])
            for c in cells:
                c = re.sub(r"^\s*(?:rowspan|colspan|class|style)=\"[^\"]*\"\s*(?:(?:rowspan|colspan|class|style)=\"[^\"]*\"\s*)*\|", "", c).strip()
                cur.append(("#" if t.startswith("!") else "") + c)
            continue
        if cur and t and not t.startswith("=") and not t.startswith("*"):
            cur[-1] += " " + t; continue
        if cur:
            rows.append("  " + " | ".join(cur)); cur = []
        rows.append(ln)
    txt = "\n".join(rows)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    txt = re.sub(r"\[\[Category:[^\]]*\]\]|Category:\S+", "", txt)
    return txt, brackets


def main():
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith(".txt"):
            continue
        with open(os.path.join(src, f), encoding="utf-8-sig") as fh:
            raw = fh.read()
        txt, br = clean(raw)
        base = f[:-4]
        with open(os.path.join(dst, base + ".clean.txt"), "w", encoding="utf-8") as fh:
            fh.write(txt)
        with open(os.path.join(dst, base + ".brackets.json"), "w", encoding="utf-8") as fh:
            json.dump(br, fh, ensure_ascii=False, indent=1)
        print(base, len(raw), "->", len(txt), "brackets:", [b["template"] for b in br])


main()
