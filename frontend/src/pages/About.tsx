export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">About This Platform</h1>
      <p className="text-slate-700 mb-4">
        This portal runs online multiple-choice examinations with integrity monitoring
        designed to support fair review rather than automatic judgment. Signals such as
        tab switches, fullscreen exits, and webcam-based attention cues are logged as
        timestamped events with severity and confidence — never a binary "cheating" verdict.
      </p>
      <p className="text-slate-700 mb-4">
        Administrators can configure thresholds for every signal, review full timelines
        for any session, and export reports. Students only ever see their own submission
        confirmation and score, never another student's data.
      </p>
      <p className="text-slate-700">
        Camera, microphone, screen, and location access are requested explicitly and
        disclosed before your exam begins, and retention settings are configured by
        your institution.
      </p>
    </div>
  );
}
