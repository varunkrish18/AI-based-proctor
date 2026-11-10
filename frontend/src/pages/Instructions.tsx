export default function Instructions() {
  const items = [
    "Use a laptop or desktop computer. Mobile devices are not supported for proctored exams.",
    "Ensure a stable internet connection for the full duration of the exam.",
    "Your webcam, microphone, and screen-sharing must be enabled before the exam starts — this is checked on a dedicated system-check screen.",
    "You must remain in fullscreen mode for the entire exam. Exiting fullscreen is logged.",
    "Switching tabs or minimizing the browser is logged and may generate a warning.",
    "Keep your face visible and centered in the webcam frame. Looking away for extended periods may generate a warning.",
    "Only one person should be visible in the camera frame at all times.",
    "Warnings are a review aid for the exam administrator, not an automatic accusation — a human reviews flagged sessions.",
    "Once you submit, your answers are final and cannot be changed.",
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Examination Instructions</h1>
      <ol className="space-y-3 list-decimal list-inside text-slate-700">
        {items.map((text, i) => (
          <li key={i} className="bg-white border border-slate-200 rounded-md px-4 py-3">
            {text}
          </li>
        ))}
      </ol>
    </div>
  );
}
