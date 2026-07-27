#!/usr/bin/env python3
import re
import pathlib

root = pathlib.Path.cwd()

task_pattern = re.compile(
    r'^\* (.+?)(?:\s*>(\d{4})(\d{2})(\d{2}))?(.*)$'
)

for mdfile in root.rglob("*.md"):
    text = mdfile.read_text(encoding="utf-8").splitlines()
    new_lines = []
    changed = False

    for line in text:
        m = task_pattern.match(line)
        if m:
            title, year, month, day, rest = m.groups()
            # Convert NotePlan priorities (!)
            title = (
                title.replace("!!!", "🔴🔴🔴")
                     .replace("!!", "🔴🔴")
                     .replace("!", "🔴")
            )
            if year:
                due = f" 📅 {year}-{month}-{day}"
            else:
                due = ""
            newline = f"- [ ] {title.strip()}{due}{rest}"
            new_lines.append(newline.strip())
            changed = True
        else:
            new_lines.append(line)

    if changed:
        mdfile.write_text("\n".join(new_lines), encoding="utf-8")
        print(f"Converted tasks in {mdfile}")

