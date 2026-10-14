(() => {
  const SHADER_GUID = 200;
  const LINE_OFFSET = 8;
  const RECOMPILE_DELAY = 1000;

  const TEMPLATE = `##Vertex

VertexInput {
    vec2 aPos : Position
    vec2 texCoord : TexCoord0
}

out vec2 uv;

void main()
{
    gl_Position = vec4(aPos * 2.0, 0.0, 1.0);
    uv = texCoord;
}

##Fragment
in vec2 uv;
out vec4 FragColor;
uniform float time;
uniform sampler2D mainTex;

`;

  const PRESETS = {
    Plasma: `void main()
{
    vec2 p = uv * 6.0;
    float v = sin(p.x + time)
            + sin(p.y + time * 1.3)
            + sin(p.x + p.y + time * 0.7)
            + sin(length(p - 3.0) * 2.0 - time * 2.0);

    vec3 color = 0.55 + 0.45 * cos(v * 0.8 + vec3(3.6, 4.2, 4.8));
    FragColor = vec4(color, 1.0);
}
`,
    Rings: `void main()
{
    vec2 p = uv - 0.5;
    p.x *= 4.0 / 3.0;

    float d = length(p);
    float rings = 0.5 + 0.5 * sin(d * 40.0 - time * 4.0);
    float fade = smoothstep(0.6, 0.0, d);

    vec3 color = mix(vec3(0.03, 0.04, 0.08), vec3(0.45, 0.65, 1.0), rings * fade);
    FragColor = vec4(color, 1.0);
}
`,
    Gradient: `void main()
{
    vec3 color = 0.5 + 0.5 * cos(time + uv.xyx + vec3(0.0, 2.0, 4.0));
    FragColor = vec4(color, 1.0);
}
`,
    Checker: `void main()
{
    vec2 p = uv * vec2(8.0, 6.0);
    p.x += time;

    float cell = mod(floor(p.x) + floor(p.y), 2.0);
    FragColor = vec4(vec3(0.1 + 0.8 * cell), 1.0);
}
`
  };

  const $ = (id) => document.getElementById(id);
  const source = $("source");
  const gutter = $("gutter");
  const log = $("log");
  const status = $("status");

  let capture = null;
  let errorLines = new Set();

  function print(text) {
    if (capture) capture.push(text);

    const line = document.createElement("div");
    line.textContent = text
      .replace(/^OpenGL ShaderProgramType value \(\d+\) Compilation Error: /, "")
      .replace(/^OpenGL Shader Linking Error: /, "Link error: ")
      .replace(/ERROR: \d+:(\d+):/, (_, n) => `Line ${n - LINE_OFFSET}:`);
    if (/error/i.test(text)) line.className = "err";

    log.append(line);
    log.scrollTop = log.scrollHeight;
  }

  function renderGutter() {
    const count = source.value.split("\n").length;
    gutter.innerHTML = Array.from({ length: count }, (_, i) =>
      `<span${errorLines.has(i + 1) ? ' class="err"' : ""}>${i + 1}</span>`).join("");
    gutter.scrollTop = source.scrollTop;
  }

  function run() {
    capture = [];
    const start = performance.now();
    Module.ccall("Phezu_ReloadShader", null, ["number", "string"], [SHADER_GUID, TEMPLATE + source.value]);
    const elapsed = Math.round(performance.now() - start);
    const output = capture;
    capture = null;

    errorLines = new Set();
    for (const text of output) {
      const match = text.match(/ERROR: \d+:(\d+):/);
      if (match) errorLines.add(Number(match[1]) - LINE_OFFSET);
    }

    const failed = output.some((text) => /error/i.test(text));
    status.className = "status " + (failed ? "error" : "ok");
    status.textContent = failed ? "Compile failed · still showing last shader" : `Compiled in ${elapsed} ms`;
    renderGutter();
  }

  for (const name of Object.keys(PRESETS)) $("preset").add(new Option(name, name));

  $("preset").addEventListener("change", (e) => {
    source.value = PRESETS[e.target.value];
    run();
  });

  $("run").addEventListener("click", run);

  source.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      source.setRangeText("    ", source.selectionStart, source.selectionEnd, "end");
      renderGutter();
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
    }
  });

  let recompileTimer;
  source.addEventListener("input", () => {
    renderGutter();
    clearTimeout(recompileTimer);
    recompileTimer = setTimeout(run, RECOMPILE_DELAY);
  });
  source.addEventListener("scroll", () => { gutter.scrollTop = source.scrollTop; });

  source.value = PRESETS.Plasma;
  renderGutter();

  window.Module = {
    canvas: $("canvas"),
    locateFile: (path) => "engine/" + path,
    print,
    printErr: print,
    onRuntimeInitialized() {
      Module._Phezu_Init();
      Module._Phezu_StartSim();
      run();

      let last = performance.now();
      requestAnimationFrame(function frame(now) {
        Module._Phezu_UpdateSim((now - last) / 1000);
        last = now;
        requestAnimationFrame(frame);
      });

      $("loading").classList.add("done");
    }
  };

  for (const file of ["Assets.js", "Runtime.js"]) {
    const script = document.createElement("script");
    script.src = "engine/" + file;
    script.async = false;
    document.body.append(script);
  }
})();
