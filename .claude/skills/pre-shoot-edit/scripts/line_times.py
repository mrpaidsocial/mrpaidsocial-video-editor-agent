#!/usr/bin/env python3
"""Start time of every script line in a word list, for the review canvas beat map (rendered versions need an explicit
output time per beat). Works on a stand-in word list (standin.py) and on the real readback, as long as the lines file
holds the words in the order they were spoken.
Usage: python3 -I line_times.py <words.json> <lines.txt>
Prints JSON: [{"n": 1, "t": 0.22, "text": "..."}]  (t is 30 ms before the line's first word, matching the comp's cuts)
"""
import json, re, sys

def norm(s):
    return re.sub(r"[^a-z0-9$%'.]", "", s.lower()).rstrip(".")

def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    words = json.load(open(sys.argv[1]))
    lines = [l.strip() for l in open(sys.argv[2], encoding="utf-8") if l.strip()]
    out, i = [], 0
    for n, line in enumerate(lines, 1):
        first = norm(line.split()[0])
        while i < len(words) and norm(words[i]["word"]) != first:   # tolerate small differences in a real readback
            i += 1
        if i >= len(words):
            sys.exit(f"line {n} not found in the word list: {line[:60]}")
        out.append({"n": n, "t": round(max(0.0, words[i]["start"] - 0.03), 3), "text": line})
        i += len(line.split())
    print(json.dumps(out, indent=1))

if __name__ == "__main__":
    main()
