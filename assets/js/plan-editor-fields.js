// Plan-only controls attached to the existing reusable WorkoutEditor set templates.
// Keeps the record/quick-add editor behavior unchanged.
const REPS = [["fixed","固定次數"],["range","次數範圍"],["until_rpe","至目標 RPE"],["unspecified","未指定"],["needs_review","待確認"]];
const LOAD = [["fixed","固定重量 kg"],["rpe_target","目標 RPE"],["bodyweight","自體重量 BW"],["bounded","重量限制"],["unspecified","未指定"],["needs_review","待確認"]];
const KINDS = [["exercise","訓練動作"],["warmup","暖身"],["cooldown","收操"],["activity","活動目標"]];

function select(name, options) {
  const el = document.createElement("select");
  el.dataset[name] = "";
  for (const [value, label] of options) el.add(new Option(label, value));
  return el;
}
function input(name, type = "text") {
  const el = document.createElement("input");
  el.type = type;
  el.dataset[name] = "";
  if (type === "number") el.min = "0";
  if (type === "text") el.maxLength = 150;
  return el;
}
function label(title, element, condition = "") {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.dataset.planCondition = condition;
  const span = document.createElement("span");
  span.textContent = title;
  wrapper.append(span, element);
  return wrapper;
}
const fields = [
  ["次數類型", "planRepsKind", select("planRepsKind", REPS), ""],
  ["最少次數", "planRepsMin", input("planRepsMin","number"), "reps:range"],
  ["最多次數", "planRepsMax", input("planRepsMax","number"), "reps:range"],
  ["次數 RPE", "planRepsRpe", input("planRepsRpe","number"), "reps:until_rpe"],
  ["待確認次數", "planRepsRaw", input("planRepsRaw"), "reps:needs_review"],
  ["重量類型", "planLoadKind", select("planLoadKind", LOAD), ""],
  ["限制重量", "planLoadValue", input("planLoadValue","number"), "load:bounded"],
  ["單位", "planLoadUnit", select("planLoadUnit", [["kg","kg"],["lbs","lbs"]]), "load:fixed,bounded"],
  ["運算子", "planLoadOperator", select("planLoadOperator", [["<","<"],["<=","<="],[">",">"],[">=",">="]]), "load:bounded"],
  ["重量目標 RPE", "planLoadRpe", input("planLoadRpe","number"), "load:rpe_target"],
  ["待確認重量", "planLoadRaw", input("planLoadRaw"), "load:needs_review"],
  ["步數目標", "planTargetMinimum", input("planTargetMinimum","number"), "activity"],
];
const names = fields.map((f) => f[1]);
const defaults = { planRepsKind:"fixed", planLoadKind:"fixed", planLoadUnit:"kg", planLoadOperator:"<" };
function get(set,name) {
  const kebab=name.replace(/[A-Z]/g,(s)=>"-"+s.toLowerCase());
  return set.querySelector("[data-"+kebab+"]");
}
export function attachPlanExercise(exercise, values = {}) {
  const initial = values ?? {};
  exercise.dataset.exerciseGroupId = initial.groupId || "";
  const kind = select("planKind", KINDS);
  kind.value = initial.planKind || "exercise";
  exercise.querySelector(".exercise-fields").append(label("動作用途", kind));
}
export function attachPlanSet(set, exercise, values = {}) {
  const panel = document.createElement("div");
  panel.className = "set-fields plan-target-fields";
  fields.forEach(([title,name,template,condition]) => {
    const el = template.cloneNode(true);
    el.value = String(values[name.replace(/^plan/,"").replace(/^[A-Z]/,c=>c.toLowerCase())] ?? defaults[name] ?? "");
    panel.append(label(title,el,condition));
  });
  set.querySelector(".set-fields").after(panel);
  set.dataset.plannedSetId = values.plannedSetId || "";
  set.dataset.sourceRow = values.sourceRow || "";
  set.querySelector("[data-set-weight]").closest("label").querySelector("span").textContent = "重量（依單位）";
  set.querySelector("[data-inline-rest]").hidden = true;
  togglePlanSet(set, exercise);
}
export function togglePlanSet(set, exercise) {
  const reps = get(set, "planRepsKind").value;
  const load = get(set, "planLoadKind").value;
  const activity = exercise.querySelector("[data-plan-kind]").value === "activity";
  set.querySelector("[data-set-reps]").closest("label").hidden = reps !== "fixed";
  set.querySelector("[data-set-weight]").closest("label").hidden = load !== "fixed";
  set.querySelector("[data-set-rpe]").closest("label").hidden = true;
  set.querySelectorAll("[data-plan-condition]").forEach((wrap) => {
    const condition = wrap.dataset.planCondition;
    wrap.hidden = condition === "activity" ? !activity
      : condition.startsWith("reps:") ? reps !== condition.slice(5)
      : condition.startsWith("load:") ? !condition.slice(5).split(",").includes(load)
      : false;
  });
}
export function readPlanSet(set, original) {
  const extra = Object.fromEntries(names.map((name) => {
    const key = name.replace(/^plan/,"").replace(/^[A-Z]/,c=>c.toLowerCase());
    return [key, get(set,name).value];
  }));
  return { ...original, ...extra,
    plannedSetId: set.dataset.plannedSetId || "",
    sourceRow: set.dataset.sourceRow || "",
  };
}
