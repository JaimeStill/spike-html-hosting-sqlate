// The files the revised quick-start guide writes in full, read from its Markdown: the program
// quick-start/ holds is the guide's last block for each path (test/unit/quick-start.test.ts), and
// the program as the guide has it at an earlier step, which a recording of that step runs
// (scripts/recordings.ts), is the guide's last block for each path through that step.
//
// The rule that makes a block a file: the paragraph before the fence is the file's path alone,
// in backticks, followed by a colon (`main.go`:), with a blank line on each side. Every other
// block is no file: a shell block, a program's output, the fragment a sentence introduces, and
// the statement step 10 plants and removes, which a sentence names in its own words. A step is
// the section under a numbered heading, "## 9. Test without a database".

/** A caption: a file's path alone, in backticks, and a colon. */
const caption = /^`([^`\s]+)`:$/;

/** A numbered step's heading, its number captured. */
const stepHeading = /^## (\d+)\. /;

/** Each file the guide's Markdown writes in full, by its path, its last block's text, counting
 * only the blocks in the steps numbered through through, every block when it is omitted; throws
 * on a fence left open. */
export function guideFiles(markdown: string, through = Infinity): Map<string, string> {
  const lines = markdown.split("\n");
  const files = new Map<string, string>();
  /** The step the line is in, 0 before the first numbered heading. */
  let step = 0;
  /** The path the last paragraph captioned, while only blank lines follow it. */
  let captioned: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = stepHeading.exec(line)?.[1];
    if (heading !== undefined) step = Number(heading);
    if (step > through) break;
    const fence = /^(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== undefined) {
      const open = i;
      do i++;
      while (i < lines.length && !new RegExp(`^${fence}${fence[0]}*\\s*$`).test(lines[i]));
      if (i === lines.length) throw new Error(`the fence on line ${open + 1} is never closed`);
      if (captioned !== undefined) files.set(captioned, lines.slice(open + 1, i).join("\n") + "\n");
      captioned = undefined;
      continue;
    }
    if (line === "") continue;
    const alone = (i === 0 || lines[i - 1] === "") && lines[i + 1] === "";
    captioned = alone ? caption.exec(line)?.[1] : undefined;
  }
  return files;
}
