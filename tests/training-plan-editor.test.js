import { describe, expect, it } from "vitest";
import { createBlankNormalizedPlan } from "../assets/js/training-plan-view.js";
import { createTrainingPlanRecords } from "../assets/js/training-plan-model.js";
import {
  exercisesToPlannedRows, plannedRowsToExercises, validatePlannedDayReplacement,
} from "../assets/js/training-plan-editor.js";

const row = (override = {}) => ({
  planned_set_id: "legacy-1", workout_id: "workout-1",
  exercise_order: "1", exercise_name: "Pause Squat", item_kind: "exercise",
  target_sets: "3", reps_kind: "fixed", reps_value: "5",
  load_kind: "rpe_target", load_rpe: "5",
  coach_notes: "Paused technique", source_row: "17",
  ...override,
});
let number = 0;
const idFactory = () => "row-" + ++number;

describe("Shared Training Plan editor adapter", () => {
  it("expands old summary rows to individual sets without losing RPE targets", () => {
    const [exercise] = plannedRowsToExercises([row()]);
    expect(exercise.name).toBe("Pause Squat");
    expect(exercise.sets).toHaveLength(3);
    expect(exercise.sets.map(s=>s.loadRpe)).toEqual(["5","5","5"]);
    expect(exercise.sets[0].notes).toBe("Paused technique");
    const planned = exercisesToPlannedRows("workout-1", [exercise], { idFactory });
    expect(planned).toHaveLength(3);
    expect(planned.map(p => p.set_order)).toEqual([1,2,3]);
    expect(planned.map(p => p.load_kind)).toEqual(["rpe_target","rpe_target","rpe_target"]);
    expect(planned.map(p => p.reps_value)).toEqual(["5","5","5"]);
    expect(planned[0].planned_set_id).toBe("legacy-1");
  });

  it("groups varied per-set prescriptions and respects BW / needs-review", () => {
    number = 0;
    const source = [
      { name: "Squat", category:"squat", planKind:"exercise",
        sets: [
          { repsKind:"fixed", reps:"5", loadKind:"fixed", weightKg:"60", loadUnit:"kg", type:"warmup", isWarmup:true },
          { repsKind:"fixed", reps:"3", loadKind:"fixed", weightKg:"80", loadUnit:"kg", type:"top" },
          { repsKind:"range", repsMin:"8", repsMax:"12", loadKind:"bodyweight", type:"backoff" },
        ],
      },
      { name: "RDL", category:"accessory", planKind:"exercise",
        sets:[{ repsKind:"needs_review", repsRaw:"2025-08-12", loadKind:"needs_review", loadRaw:"2025-08-12", type:"working" }],
      },
    ];
    const created = exercisesToPlannedRows("workout-1", source, { idFactory });
    expect(created.map(x=>x.exercise_order)).toEqual([1,2,3,4]);
    expect(created.map(x=>x.set_type)).toEqual(["warmup","top","backoff","working"]);
    expect(created[0].exercise_group_id).toBe(created[1].exercise_group_id);
    expect(created[3].exercise_group_id).not.toBe(created[0].exercise_group_id);
    const roundTrip=plannedRowsToExercises(created);
    expect(roundTrip).toHaveLength(2);
    expect(roundTrip[0].sets).toHaveLength(3);
    expect(roundTrip[0].sets[0].weightKg).toBe("60");
    expect(roundTrip[0].sets[1].weightKg).toBe("80");
    expect(roundTrip[0].sets[2].loadKind).toBe("bodyweight");
    expect(roundTrip[1].sets[0].repsRaw).toBe("2025-08-12");
  });

  it("never confuses pounds with kg when editing fixed weight", () => {
    const [ex] = plannedRowsToExercises([row({
      target_sets:"1",load_kind:"fixed",load_value:"20",load_unit:"lbs",
      reps_kind:"fixed",reps_value:"10",
    })]);
    expect(ex.sets[0].weightKg).toBe("20");
    expect(ex.sets[0].loadUnit).toBe("lbs");
    const [saved] = exercisesToPlannedRows("workout-1", [ex], { idFactory });
    expect(saved.load_unit).toBe("lbs");
    expect(saved.load_value).toBe("20");
  });

  it("automatically derives the day's status from the presence of prescriptions", () => {
    let id=0;
    const records=createTrainingPlanRecords(createBlankNormalizedPlan(1,1),{
      idFactory:()=>String(++id),
    });
    const workoutId=records.workouts[0].workout_id;
    const items=exercisesToPlannedRows(workoutId,[{
      name:"Squat",category:"squat",planKind:"exercise",
      sets:[{repsKind:"fixed",reps:"3",loadKind:"fixed",weightKg:"70",loadUnit:"kg",type:"working"}],
    }],{idFactory});
    const first=validatePlannedDayReplacement(records.plan,records.workouts,[],workoutId,items);
    expect(first.workouts[0].status).toBe("planned");
    const second=validatePlannedDayReplacement(records.plan,first.workouts,items,workoutId,[]);
    expect(second.workouts[0].status).toBe("not_provided");
  });

  it("rejects invalid blank sets, duplicate group rows, and out-of-range RPE", () => {
    number=0;
    expect(()=>exercisesToPlannedRows("w",[{
      name:"Squat",category:"squat",planKind:"exercise",
      sets:[{repsKind:"fixed",reps:"",loadKind:"fixed",weightKg:"50",loadUnit:"kg",type:"working"}],
    }],{idFactory})).not.toThrow();
    let n=0;const records=createTrainingPlanRecords(createBlankNormalizedPlan(1,1),{
      idFactory:()=>String(++n),
    });
    const workoutId=records.workouts[0].workout_id;
    const invalid=exercisesToPlannedRows(workoutId,[{
      name:"Squat",category:"squat",planKind:"exercise",
      sets:[{repsKind:"fixed",reps:"5",loadKind:"rpe_target",loadRpe:"12",type:"working"}],
    }],{idFactory});
    expect(()=>validatePlannedDayReplacement(records.plan,records.workouts,[],workoutId,invalid)).toThrow("RPE");
  });
});
