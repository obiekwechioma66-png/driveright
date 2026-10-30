const stageLabels = {
  parking: "1 · Parking",
  highway: "2 · Highway",
  test_ready: "3 · Test-ready",
};

const ratingLabels = {
  not_yet: "Not yet",
  improving: "Improving",
  confident: "Confident",
};

export default function ProgressTracker({ progress, showSkills = true, onMarkTestReady, marking = false }) {
  if (!progress) return null;

  return (
    <div className={`progress-tracker${showSkills ? " detailed" : " compact"}`}>
      <div className="overall-progress">
        <div className="meter-top"><span>Overall progress</span><span>{progress.overallPct}%</span></div>
        <div className="bar"><i style={{ width: `${progress.overallPct}%` }} /></div>
      </div>

      <div className="grid3 progress-stage-grid">
        {progress.perStage.map((stage) => {
          const locked = !progress.unlocked.includes(stage.stage);
          return (
            <article className={`card progress-stage${locked ? " locked" : ""}`} key={stage.stage}>
              <h3>{stageLabels[stage.stage]}</h3>
              <div className="meter-top">
                <span>{stage.stage === "test_ready" ? (locked ? "Locked" : progress.testReady ? "Badge earned" : "Ready for sign-off") : "Skill progress"}</span>
                <span>{stage.pct}%</span>
              </div>
              <div className={`bar${stage.pct > 0 && stage.pct < 100 ? " amber" : ""}`}>
                <i style={{ width: `${stage.pct}%` }} />
              </div>
              <div className="meter-note">
                {stage.stage === "test_ready"
                  ? (locked ? "Unlocks when Parking and Highway skills are all Confident" : progress.testReady ? "Instructor sign-off complete" : "All earlier skills are Confident")
                  : `${stage.confident}/${stage.total} skills Confident`}
              </div>

              {showSkills && (
                <ul className="skill-checklist">
                  {stage.skills.map((skill, index) => (
                    <li key={skill.id || `${stage.stage}-${index}`}>
                      <span>{skill.name}</span>
                      <span className={`skill-rating${skill.rating === "confident" ? " is-confident" : ""}`}>
                        {skill.rating ? ratingLabels[skill.rating] : stage.stage === "test_ready"
                          ? (progress.readyEligible ? "Sign-off needed" : "Locked")
                          : "Not rated"}
                      </span>
                      {skill.note && <small>{skill.note}</small>}
                    </li>
                  ))}
                </ul>
              )}

              {stage.stage === "test_ready" && onMarkTestReady && progress.readyEligible && !progress.testReady && (
                <button className="btn btn-primary test-ready-button" type="button" disabled={marking} onClick={onMarkTestReady}>
                  {marking ? "Saving…" : "Mark learner Test-ready"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {progress.testReady && <div className="test-ready-badge" role="status">✓ Test-ready · instructor signed off</div>}
    </div>
  );
}
