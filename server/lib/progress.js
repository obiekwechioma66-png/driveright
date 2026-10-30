const STAGES = ["parking", "highway", "test_ready"];
const CONFIDENT = "confident";

// Latest lesson rating wins for progress; all LessonRating rows remain stored.
function computeProgress(skills, lessonsNewestFirst, achievedTestReady = false) {
  const latest = new Map();
  for (const lesson of lessonsNewestFirst)
    for (const rating of lesson.ratings)
      if (!latest.has(rating.skillId)) latest.set(rating.skillId, { rating: rating.rating, note: rating.note });

  const scoredStages = STAGES.filter((stage) => stage !== "test_ready").map((stage) => {
    const stageSkills = skills.filter((skill) => skill.stage === stage);
    const skillsWithRatings = stageSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      ...(latest.get(skill.id) || { rating: null, note: null }),
    }));
    const confident = skillsWithRatings.filter((skill) => skill.rating === CONFIDENT).length;
    const pointsEarned = skillsWithRatings.reduce(
      (sum, skill) => sum + ({ not_yet: 0, improving: 1, confident: 2 }[skill.rating] || 0),
      0,
    );
    return {
      stage,
      total: stageSkills.length,
      confident,
      pointsEarned,
      pct: stageSkills.length ? Math.round((pointsEarned / (stageSkills.length * 2)) * 100) : 0,
      skills: skillsWithRatings,
    };
  });

  const parking = scoredStages.find((stage) => stage.stage === "parking");
  const highway = scoredStages.find((stage) => stage.stage === "highway");
  const parkingDone = parking.total > 0 && parking.confident === parking.total;
  const highwayDone = highway.total > 0 && highway.confident === highway.total;
  const readyEligible = parkingDone && highwayDone;
  const testReady = readyEligible && achievedTestReady;
  const testReadyChecklist = [
    { id: "parking-prerequisite", name: "Parking skills all Confident", rating: parkingDone ? CONFIDENT : "not_yet", note: null },
    { id: "highway-prerequisite", name: "Highway skills all Confident", rating: highwayDone ? CONFIDENT : "not_yet", note: null },
    { id: "instructor-signoff", name: "Instructor Test-ready sign-off", rating: testReady ? CONFIDENT : null, note: null },
  ];
  const testReadyConfident = testReadyChecklist.filter((skill) => skill.rating === CONFIDENT).length;
  const testReadyStage = {
    stage: "test_ready",
    total: testReadyChecklist.length,
    confident: testReadyConfident,
    pointsEarned: testReadyConfident * 2,
    pct: Math.round((testReadyConfident / testReadyChecklist.length) * 100),
    skills: testReadyChecklist,
  };
  const perStage = [...scoredStages, testReadyStage];
  const totalPoints = scoredStages.reduce((sum, stage) => sum + stage.pointsEarned, 0) + testReadyStage.pointsEarned;
  const possiblePoints = (scoredStages.reduce((sum, stage) => sum + stage.total, 0) + testReadyStage.total) * 2;

  return {
    perStage,
    unlocked: ["parking", parkingDone ? "highway" : null, readyEligible ? "test_ready" : null].filter(Boolean),
    activeStage: parkingDone ? (highwayDone ? null : "highway") : "parking",
    readyEligible,
    testReady,
    overallPct: possiblePoints ? Math.round((totalPoints / possiblePoints) * 100) : 0,
  };
}

module.exports = { computeProgress };
