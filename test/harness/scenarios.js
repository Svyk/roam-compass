async function wait(ms) {
  const step = 50;
  let remaining = Math.max(0, Number(ms) || 0);
  if (remaining === 0) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return;
  }
  while (remaining > 0) {
    const slice = Math.min(step, remaining);
    await new Promise((resolve) => setTimeout(resolve, slice));
    remaining -= slice;
  }
}

function centerOf(element) {
  const rect = element.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
}

function nextFrame() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(finish);
    setTimeout(finish, 20);
  });
}

export function createScenarioHelper(harness, assertions) {
  const root = () => document.querySelector(".compass-root");
  const q = (selector) => root()?.querySelector(selector) ?? null;
  const qa = (selector) => {
    const container = root();
    return container ? Array.from(container.querySelectorAll(selector)) : [];
  };
  const resolveTarget = (target) => {
    const element = typeof target === "string" ? q(target) : target;
    if (!element || typeof element.dispatchEvent !== "function") {
      throw new Error(`Target not found: ${String(target)}`);
    }
    return element;
  };

  return {
    harness,

    async open(uid) {
      harness.overlay.focusUid(uid);
      await nextFrame();
      await wait(350);
    },

    wait,
    q,
    qa,

    click(target, init = {}) {
      const element = resolveTarget(target);
      const { clientX, clientY } = centerOf(element);
      const base = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        clientX,
        clientY,
        ...init,
      };
      element.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, isPrimary: true, buttons: 1, ...base }));
      element.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, isPrimary: true, buttons: 0, ...base }));
      element.dispatchEvent(new MouseEvent("click", { buttons: 0, detail: 1, ...base }));
    },

    dblclick(target, init = {}) {
      const element = resolveTarget(target);
      const { clientX, clientY } = centerOf(element);
      element.dispatchEvent(new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        buttons: 0,
        detail: 2,
        clientX,
        clientY,
        ...init,
      }));
    },

    contextmenu(target, init = {}) {
      const element = resolveTarget(target);
      const { clientX, clientY } = centerOf(element);
      element.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX,
        clientY,
        ...init,
      }));
    },

    key(key, init = {}) {
      const active = document.activeElement && document.activeElement !== document.documentElement
        ? document.activeElement
        : document.body;
      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        key,
        ...init,
      };
      active.dispatchEvent(new KeyboardEvent("keydown", opts));
      const upTarget = active.isConnected
        ? active
        : (document.activeElement && document.activeElement !== document.documentElement
          ? document.activeElement
          : document.body);
      upTarget.dispatchEvent(new KeyboardEvent("keyup", opts));
    },

    type(target, text) {
      const element = resolveTarget(target);
      element.focus();
      element.value = String(text ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    },

    text(selector) {
      const element = typeof selector === "string" ? q(selector) : selector;
      return element?.textContent?.trim() ?? "";
    },

    count(selector) {
      return qa(selector).length;
    },

    assert(condition, message = "assertion") {
      assertions.push({ ok: Boolean(condition), message: String(message) });
    },

    equal(actual, expected, message = "equal") {
      const ok = Object.is(actual, expected);
      const detail = ok
        ? String(message)
        : `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`;
      assertions.push({ ok, message: detail });
    },

    calls(name) {
      if (name == null) return [...harness.host.calls];
      return harness.host.calls.filter((entry) => entry[0] === name);
    },
  };
}

export const SCENARIOS = {
  async compass(h) {
    await h.open("p-alpha");
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "center title is Project Alpha");
    for (const zone of ["north", "south", "west", "east", "siblings"]) {
      h.assert(h.count(`.compass-node[data-zone="${zone}"]`) >= 1, `at least one node in ${zone}`);
    }
    const southTitles = h.qa('.compass-node[data-zone="south"] .compass-node-title').map((el) => el.textContent.trim());
    for (const task of ["Task One", "Task Two", "Task Three"]) {
      h.assert(southTitles.includes(task), `${task} sits south`);
    }
    const edgeLabels = h.qa(".compass-edge-label").map((el) => el.textContent.trim());
    const ownerLabel = edgeLabels.find((label) => label.includes("Owner")) ?? "";
    h.assert(
      ownerLabel.includes("Owner") && ownerLabel.includes("Role") && ownerLabel.includes("Lead"),
      `Owner edge label mentions role (got "${ownerLabel}")`,
    );
  },

  async navigate(h) {
    await h.open("p-alpha");
    const taskOne = h.qa('.compass-node[data-zone="south"]').find((el) => el.textContent.includes("Task One"));
    h.assert(Boolean(taskOne), "Task One node exists on Project Alpha");
    h.click(taskOne);
    await h.wait(550);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Task One", "Task One becomes the center");
    const northTitles = h.qa('.compass-node[data-zone="north"] .compass-node-title').map((el) => el.textContent.trim());
    h.assert(northTitles.includes("Project Alpha"), "Project Alpha sits north of Task One");
    h.key("ArrowLeft", { altKey: true });
    await h.wait(500);
    h.equal(h.text(".compass-node-center .compass-node-title"), "Project Alpha", "Alt+Left returns to Project Alpha");
  },

  async outline(h) {
    await h.open("p-alpha");
    h.click(".compass-outline");
    await h.wait(400);
    h.assert(h.count(".compass-row") > 0, "Outline button expands .compass-row elements");
    h.click(".compass-outline");
    await h.wait(400);
    h.equal(h.count(".compass-row"), 0, "second Outline click collapses .compass-row elements");
  },

  async search(h) {
    await h.open("p-alpha");
    h.type(".compass-search", "task");
    await h.wait(120);
    const items = h.qa(".compass-results:not([hidden]) .compass-result");
    h.assert(items.length >= 3, `search for "task" shows at least 3 results (got ${items.length})`);
    const firstTitle = items[0]?.textContent?.trim() ?? "";
    if (items[0]) h.click(items[0]);
    await h.wait(350);
    h.equal(h.text(".compass-node-center .compass-node-title"), firstTitle, "choosing first search result focuses it");
  },

  async menu(h) {
    await h.open("p-alpha");
    const southNode = h.q('.compass-node[data-zone="south"]');
    h.assert(Boolean(southNode), "south node exists");
    h.contextmenu(southNode);
    await h.wait(50);
    const items = h.qa(".compass-menu:not([hidden]) .compass-menu-item").map((el) => el.textContent.trim());
    h.assert(items.includes("Focus here"), "context menu contains Focus here");
    h.assert(items.includes("Why is this here?"), "context menu contains Why is this here?");
  },
};
