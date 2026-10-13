'use strict';
/* 5-day program. fields: which inputs each set row has (weight, reps, sec, min, done). rest: 'heavy' = 2–3 min, else 60–90 s. */
const WR = ['weight', 'reps'];
const PROGRAM = [
  {id: 'd1', name: 'Day 1 · Legs: Strength', note: 'Focus on force production — not exhausting the legs.', exercises: [
    {name: 'Smith Machine Squat', sets: 4, target: '4 × 5–6', rest: 'heavy'},
    {name: 'Smith Romanian Deadlift', sets: 3, target: '3 × 6–8', rest: 'heavy'},
    {name: 'Bulgarian Split Squat', sets: 3, target: '3 × 8 each leg'},
    {name: 'Smith Standing Calf Raise', sets: 3, target: '3 × 10–15'},
    {name: 'Step-Ups', sets: 3, target: '3 × 8 each leg'},
    {name: 'Dead Bug', sets: 3, target: '3 × 8–10 each side', fields: ['reps']}]},
  {id: 'd2', name: 'Day 2 · Upper Body', note: '', exercises: [
    {name: 'Smith Machine Bench Press', sets: 4, target: '4 × 6–8', rest: 'heavy', note: '⚠️ Only with secure bilateral prosthetic control — otherwise substitute.'},
    {name: 'One-Arm Dumbbell/Cable Row', sets: 4, target: '4 × 8–10', rest: 'heavy'},
    {name: 'One-Arm Incline Press', sets: 3, target: '3 × 8–10'},
    {name: 'One-Arm Lat Pulldown', sets: 3, target: '3 × 8–12'},
    {name: 'One-Arm Lateral Raise', sets: 3, target: '3 × 12–15'},
    {name: 'Biceps Curl', sets: 2, target: '2 × 10–15'},
    {name: 'Triceps Extension', sets: 2, target: '2 × 10–15'}]},
  {id: 'd3', name: 'Day 3 · MTB Athletic Day', note: '', exercises: [
    {name: 'Box Jump', sets: 4, target: '4 × 3', rest: 'heavy', fields: ['reps']},
    {name: 'Smith Reverse Lunge', sets: 3, target: '3 × 8 each'},
    {name: 'Single-Leg Romanian Deadlift', sets: 3, target: '3 × 8 each'},
    {name: 'Step-Up → Knee Drive', sets: 3, target: '3 × 8 each'},
    {name: 'Hamstring Curl', sets: 3, target: '3 × 10–12'},
    {name: 'Calf Raise', sets: 3, target: '3 × 15'},
    {name: 'Core Circuit', sets: 3, target: '3 rounds', fields: ['done'], note: 'Dead bugs → reverse crunches → side plank variation → bird dogs. Controlled.'}]},
  {id: 'd4', name: 'Day 4 · Upper Body + Core', note: '', exercises: [
    {name: 'One-Arm Shoulder Press', sets: 4, target: '4 × 6–8', rest: 'heavy'},
    {name: 'One-Arm Row', sets: 4, target: '4 × 8–10', rest: 'heavy'},
    {name: 'One-Arm Chest Press', sets: 3, target: '3 × 8–12'},
    {name: 'One-Arm Pulldown', sets: 3, target: '3 × 8–12'},
    {name: 'Rear-Delt Raise', sets: 3, target: '3 × 12–15'},
    {name: 'Suitcase Carry', sets: 3, target: '3 × 30–45 sec', fields: ['weight', 'sec']},
    {name: 'Pallof Press', sets: 3, target: '3 × 10 each direction'}]},
  {id: 'd5', name: 'Day 5 · Legs: Muscle + Conditioning', note: '', exercises: [
    {name: 'Smith Squat', sets: 3, target: '3 × 8–10', rest: 'heavy'},
    {name: 'Smith Romanian Deadlift', sets: 3, target: '3 × 8–10', rest: 'heavy'},
    {name: 'Walking/Reverse Lunge', sets: 3, target: '3 × 10 each'},
    {name: 'Hip Thrust', sets: 3, target: '3 × 8–12', rest: 'heavy'},
    {name: 'Calf Raise', sets: 3, target: '3 × 15–20'},
    {name: 'Conditioning', sets: 1, target: '10–15 min', fields: ['min']}]},
  {id: 'stretch', name: 'Stretch — Full Body (~11 min)', note: 'Breathe slowly, ease into each stretch, never to pain.', exercises: [
    {name: 'Cat-Cow', sets: 1, target: '1 × 45 s', fields: ['sec']},
    {name: "World's Greatest Stretch", sets: 2, target: '2 × 30 s (each side)', fields: ['sec']},
    {name: 'Kneeling Hip Flexor Stretch', sets: 2, target: '2 × 45 s (each side)', fields: ['sec']},
    {name: 'Standing Hamstring Stretch (foot on bench)', sets: 2, target: '2 × 45 s (each side)', fields: ['sec']},
    {name: 'Figure-4 Glute Stretch (lying)', sets: 2, target: '2 × 45 s (each side)', fields: ['sec']},
    {name: 'Standing Quad Stretch (hold wall/rack)', sets: 2, target: '2 × 30 s (each side)', fields: ['sec']},
    {name: 'Calf Stretch (wall)', sets: 2, target: '2 × 30 s (each side)', fields: ['sec']},
    {name: "Child's Pose (reach forward)", sets: 1, target: '1 × 45 s', fields: ['sec']},
    {name: 'Open-Book Thoracic Rotation (side-lying)', sets: 2, target: '2 × 30 s (each side)', fields: ['sec']},
    {name: 'Doorway Chest Stretch (left side)', sets: 1, target: '1 × 30 s', fields: ['sec']},
    {name: 'Cross-Body Shoulder Stretch (left; band or wall assist)', sets: 1, target: '1 × 30 s', fields: ['sec']},
    {name: 'Neck Side Stretch', sets: 2, target: '2 × 20 s (each side)', fields: ['sec']}]},
];
const REST_NOTE = 'Rest 2–3 min on heavy compounds, 60–90 s on accessories. Stop each set with 1–3 reps in reserve (RIR).';
