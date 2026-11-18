import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

test("separator merges base classes with strings and primitive-state callbacks", async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { Separator } from "./src/components/ui/separator.tsx";
        const states = [];
        const callback = state => { states.push(state.orientation); return "custom-" + state.orientation; };
        const html = [
          { className: "caller-class" },
          { className: callback },
          { orientation: "vertical", className: callback },
          {},
        ].map(props => renderToStaticMarkup(React.createElement(Separator, props)));
        console.log(JSON.stringify({ html, states }));`,
      resolveDir: process.cwd(),
      loader: "jsx",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
  });
  const result = JSON.parse(
    execFileSync(process.execPath, ["--input-type=commonjs"], {
      input: bundle.outputFiles[0].text,
      encoding: "utf8",
    }),
  );
  assert.deepEqual(result.states, ["horizontal", "vertical"]);
  for (const html of result.html) {
    assert.match(html, /class="[^"]*\bbg-border\b/);
    assert.match(html, /role="separator"/);
  }
  for (const [index, name] of ["caller-class", "custom-horizontal", "custom-vertical"].entries()) {
    assert.match(result.html[index], new RegExp(`class="[^"]*\\b${name}\\b`));
  }
  assert.match(result.html[2], /aria-orientation="vertical"/);
});
