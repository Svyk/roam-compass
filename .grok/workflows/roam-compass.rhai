let meta = #{
    name: "roam-compass",
    description: "Clean-room Roam Compass extension: harc neighborhood navigator on the roam-extension-template, no AGPL source",
    when_to_use: "port kplex behavior to Roam as Compass, roam-compass, harc attributes, spatial neighborhood",
    phases: [
        #{ title: "Identity", detail: "Rename the template to Compass and keep npm run check green" },
        #{ title: "Model", detail: "Pure classify, layout, write planner, and node:test" },
        #{ title: "Surface", detail: "Host pull, overlay, commands, settings" },
        #{ title: "Gate", detail: "npm run check, one fix pass if it fails" },
    ],
};

let result_schema = #{
    "type": "object",
    "required": ["ok", "summary"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "check": #{ "type": "string" },
    },
};

fn txt(x) {
    if type_of(x) == "string" { return x; }
    "";
}

let repo = "/Users/svyatoslavkleshchev/roam-compass";
if args != () && args.repo != () { repo = args.repo; }

fn rules(repo_path) {
    let s = "";
    s += "Workspace git root: " + repo_path + ".\n";
    s += "You are the implementer. Edit files in that repo. Do not launch another agent.\n";
    s += "Read " + repo_path + "/spec-compass.md fully before editing. It is the spec. Do not widen it.\n";
    s += "Also read ~/.grok/skills/roam-plugin-dev/SKILL.md and ~/roam-docs/public/developer-documentation/attributes-data-model-new.md.\n";
    s += "Verify every roamAlphaAPI call against ~/openkb-roam-plugin/raw/api-types/roam-alpha-api.d.ts.\n";
    s += "LICENSE BOUNDARY: do not read, grep, or copy ~/kplex-reference or github.com/zsviczian/kplex. That tree is AGPL. This repo stays MIT. No new npm dependencies.\n";
    s += "Do not commit. Do not push. Do not amend. Author if a hook asks later: Svyatoslav Kleshchev <svyk@icloud.com>.\n";
    s += "Do not write :harc, :entity/attrs, or :attr/proxy. Do not reshape BT_attr or Aliases.\n";
    s += "Keep one lifecycle in src/extension.js. Register watches, nodes, listeners, and commands on it.\n";
    s += "CSS selectors start with .compass-root. No runtime dependencies.\n";
    s += "Finish by running npm run check in " + repo_path + " with Node 20. If node_modules is missing, npm ci --ignore-scripts --no-audit --no-fund first.\n";
    s += "Return ok true only when npm run check exits 0. Put the last 40 lines of that output in check.\n";
    s
}

phase("Identity");
let id_p = rules(repo);
id_p += "UNIT: identity only.\n";
id_p += "Replace roam-extension-template, Example Extension, and example-extension with roam-compass, Compass, and compass.\n";
id_p += "Log prefix [compass]. Settings tab Compass. Package description: Spatial neighborhood navigator for a Roam graph.\n";
id_p += "Update test/extension.test.js expectations. Keep lifecycle.js API. Change only its log prefix.\n";
id_p += "Replace the example hello command with Compass: Open that console.info [compass] open. The Surface unit replaces this stub.\n";
id_p += "Replace README.md from the README section of spec-compass.md. Do not implement classify, layout, host, or the overlay in this unit.\n";
id_p += "Leave spec-compass.md unchanged.\n";
let identity = agent(id_p, #{
    label: "compass-identity",
    agent_type: "executor-cursor",
    capability_mode: "all",
    output_schema: result_schema,
});
if identity == () || !identity.success || identity.output == () || identity.output.ok != true {
    complete(#{ ok: false, summary: "Identity unit failed", phase: "Identity" });
}

phase("Model");
let model_p = rules(repo);
model_p += "UNIT: pure model only.\n";
model_p += "Add src/model/classify.js, src/model/layout.js, src/model/writes.js and test/classify.test.js, test/layout.test.js, test/writes.test.js.\n";
model_p += "Implement classify, layout, applyLens, and planWrite exactly as spec-compass.md. Export those names.\n";
model_p += "Cover every case in the Tests that must exist section.\n";
model_p += "Do not import host.js from tests. Do not add the overlay in this unit. Do not edit spec-compass.md.\n";
let model = agent(model_p, #{
    label: "compass-model",
    agent_type: "executor-cursor",
    capability_mode: "all",
    output_schema: result_schema,
});
if model == () || !model.success || model.output == () || model.output.ok != true {
    complete(#{ ok: false, summary: "Model unit failed", phase: "Model" });
}

phase("Surface");
let surface_p = rules(repo);
surface_p += "UNIT: host and view.\n";
surface_p += "Add src/host.js and src/view/overlay.js. Append overlay CSS to src/extension.css under .compass-root.\n";
surface_p += "Wire settings.js to the Defaults table in spec-compass.md. Wire extension.js so Compass: Open, Compass: Focus page, and Compass: Focus block call the overlay.\n";
surface_p += "Host pull, retargeted pullWatch, write chain, and web lock as spec-compass.md Host. View as spec-compass.md View, including lenses, pins, history, sidecar, edge popover, and zone drag for writable nodes.\n";
surface_p += "Replace the identity stub command. Keep npm run check green, including the model tests.\n";
surface_p += "Do not edit spec-compass.md. Do not add dependencies.\n";
let surface = agent(surface_p, #{
    label: "compass-surface",
    agent_type: "executor-cursor",
    capability_mode: "all",
    output_schema: result_schema,
});

phase("Gate");
let gate_ok = false;
let gate_summary = "";
if surface != () && surface.success && surface.output != () && surface.output.ok == true {
    gate_ok = true;
    gate_summary = txt(surface.output.summary);
} else {
    let fix_p = rules(repo);
    fix_p += "UNIT: repair. npm run check is failing or the Surface unit did not return ok.\n";
    fix_p += "Read spec-compass.md and the current src/. Fix the smallest set of files so npm run check exits 0.\n";
    fix_p += "Do not delete the model tests to go green. Do not edit spec-compass.md.\n";
    let fix = agent(fix_p, #{
        label: "compass-fix",
        agent_type: "executor-cursor",
        capability_mode: "all",
        output_schema: result_schema,
    });
    if fix != () && fix.success && fix.output != () && fix.output.ok == true {
        gate_ok = true;
        gate_summary = txt(fix.output.summary);
    } else {
        gate_summary = "check still failing";
    }
}

complete(#{
    ok: gate_ok,
    summary: gate_summary,
    repo: repo,
});
